resource "aws_cloudwatch_log_group" "gw_access_logs" {
  count             = var.apigateway_logging_enabled ? 1 : 0
  name              = "/aws/apigateway/${var.name_prefix}-rest-api-${terraform.workspace}/${local.api_gateway_stage_name}"
  retention_in_days = 30
}

data "aws_iam_policy_document" "invocation_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

data "aws_iam_policy_document" "dynamodb_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "invocation_role" {
  name               = "${var.name_prefix}-api-gw-invocation-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.invocation_assume_role.json
}

resource "aws_iam_role_policy" "invocation_policy" {
  name   = "default"
  role   = aws_iam_role.invocation_role.id
  policy = data.aws_iam_policy_document.invocation_policy.json
}

resource "aws_iam_role" "dynamodb_role" {
  name               = "${var.name_prefix}-api-gw-dynamodb-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.dynamodb_assume_role.json
}

resource "aws_iam_role_policy" "dynamodb_policy" {
  name   = "dynamodb_access"
  role   = aws_iam_role.dynamodb_role.id
  policy = data.aws_iam_policy_document.dynamodb_policy.json
}

data "aws_iam_policy_document" "invocation_policy" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_alias.live.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${module.ui_bucket.s3_bucket_arn}/*"]
  }
}

data "aws_iam_policy_document" "dynamodb_policy" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:Scan",
      "dynamodb:Query"
    ]
    resources = [
      aws_dynamodb_table.jobs.arn,
      "${aws_dynamodb_table.jobs.arn}/index/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey"
    ]
    resources = [aws_kms_key.this.arn]
  }
}

resource "aws_api_gateway_rest_api" "this" {
  name        = "${var.name_prefix}-github-rest-api-${terraform.workspace}"
  description = "GitGazer REST API"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_stage" "this" {
  deployment_id = aws_api_gateway_deployment.this.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = local.api_gateway_stage_name
  depends_on    = [aws_cloudwatch_log_group.gw_access_logs]
}

resource "aws_api_gateway_method_settings" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled = true
    logging_level   = var.apigateway_logging_enabled ? "INFO" : "OFF"
  }
  depends_on = [aws_cloudwatch_log_group.gw_access_logs]
}
resource "aws_api_gateway_request_validator" "jobs_validator" {
  name                        = "${var.name_prefix}-jobs-validator-${terraform.workspace}"
  rest_api_id                 = aws_api_gateway_rest_api.this.id
  validate_request_parameters = true
}

resource "aws_api_gateway_authorizer" "cognito" {
  name            = "${var.name_prefix}-cognito-authorizer-${terraform.workspace}"
  rest_api_id     = aws_api_gateway_rest_api.this.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : "arn:aws:cognito-idp:${provider.user_pool_config.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${provider.user_pool_config.user_pool_id}" if provider.authentication_type == "AMAZON_COGNITO_USER_POOLS"]
  identity_source = "method.request.header.Authorization"
}

resource "aws_api_gateway_resource" "api_root" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "api"
}

resource "aws_api_gateway_resource" "import" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api_root.id
  path_part   = "import"
}

resource "aws_api_gateway_resource" "intergration" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.import.id
  path_part   = "{integrationId}"
}

resource "aws_api_gateway_resource" "integrations" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api_root.id
  path_part   = "integrations"
}

resource "aws_api_gateway_resource" "integration_id" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.integrations.id
  path_part   = "{integrationId}"
}

resource "aws_api_gateway_resource" "jobs" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.integration_id.id
  path_part   = "jobs"
}

resource "aws_api_gateway_resource" "frontend_failover" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = local.frontend_failover_sub_path
}

resource "aws_api_gateway_resource" "frontend_proxy" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.frontend_failover[0].id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "frontend_proxy_get" {
  count         = var.with_frontend_stack ? 1 : 0
  authorization = "NONE"
  http_method   = "GET"
  resource_id   = aws_api_gateway_resource.frontend_proxy[0].id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_method" "this" {
  authorization = "NONE"
  http_method   = "POST"
  resource_id   = aws_api_gateway_resource.intergration.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  #authorizer_id = try(each.value.authorizer_id, null)
}

resource "aws_api_gateway_method" "jobs_get" {
  authorization        = "COGNITO_USER_POOLS"
  authorizer_id        = aws_api_gateway_authorizer.cognito.id
  http_method          = "GET"
  resource_id          = aws_api_gateway_resource.jobs.id
  rest_api_id          = aws_api_gateway_rest_api.this.id
  request_validator_id = aws_api_gateway_request_validator.jobs_validator.id
  request_parameters = {
    "method.request.path.integrationId" = true
  }
}

resource "aws_api_gateway_method" "jobs_options" {
  authorization = "NONE"
  http_method   = "OPTIONS"
  resource_id   = aws_api_gateway_resource.jobs.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
}

resource "aws_api_gateway_integration" "this" {
  http_method             = aws_api_gateway_method.this.http_method
  resource_id             = aws_api_gateway_resource.intergration.id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_alias.live.invoke_arn
}

resource "aws_api_gateway_integration" "jobs_dynamodb" {
  http_method             = aws_api_gateway_method.jobs_get.http_method
  resource_id             = aws_api_gateway_resource.jobs.id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${var.aws_region}:dynamodb:action/Query"
  credentials             = aws_iam_role.dynamodb_role.arn

  request_templates = {
    "application/json" = jsonencode({
      TableName              = aws_dynamodb_table.jobs.name
      IndexName              = "integrationId-index"
      KeyConditionExpression = "integrationId = :integrationId"
      ExpressionAttributeValues = {
        ":integrationId" = {
          S = "$input.params('integrationId')"
        }
      }
      Limit = 100
    })
  }
}

resource "aws_api_gateway_integration" "jobs_options" {
  http_method = aws_api_gateway_method.jobs_options.http_method
  resource_id = aws_api_gateway_resource.jobs.id
  rest_api_id = aws_api_gateway_rest_api.this.id
  type        = "MOCK"
  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_integration" "frontend_proxy" {
  count                   = var.with_frontend_stack ? 1 : 0
  http_method             = aws_api_gateway_method.frontend_proxy_get[0].http_method
  resource_id             = aws_api_gateway_resource.frontend_proxy[0].id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS"
  integration_http_method = "GET"
  cache_key_parameters = [
    "method.request.path.proxy",
  ]
  credentials = aws_iam_role.invocation_role.arn
  uri         = "arn:aws:apigateway:${var.aws_region}:s3:path/${module.ui_bucket.s3_bucket_id}/index.html"
}

resource "aws_api_gateway_method_response" "frontend_proxy_200" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Content-Length" = false
    "method.response.header.Content-Type"   = false
    "method.response.header.Timestamp"      = false
    "method.response.header.Cache-Control"  = false
  }
}

resource "aws_api_gateway_method_response" "frontend_proxy_400" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = "400"
}

resource "aws_api_gateway_method_response" "frontend_proxy_500" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = "500"
}

resource "aws_api_gateway_method_response" "jobs_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.jobs.id
  http_method = aws_api_gateway_method.jobs_get.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Content-Type" = false
  }
}

resource "aws_api_gateway_method_response" "jobs_400" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.jobs.id
  http_method = aws_api_gateway_method.jobs_get.http_method
  status_code = "400"
}

resource "aws_api_gateway_method_response" "jobs_500" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.jobs.id
  http_method = aws_api_gateway_method.jobs_get.http_method
  status_code = "500"
}

resource "aws_api_gateway_method_response" "jobs_options_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.jobs.id
  http_method = aws_api_gateway_method.jobs_options.http_method
  status_code = "200"
}

resource "aws_api_gateway_method_response" "webhook_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.intergration.id
  http_method = aws_api_gateway_method.this.http_method
  status_code = "200"
}

resource "aws_api_gateway_method_response" "webhook_400" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.intergration.id
  http_method = aws_api_gateway_method.this.http_method
  status_code = "400"
}

resource "aws_api_gateway_method_response" "webhook_500" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.intergration.id
  http_method = aws_api_gateway_method.this.http_method
  status_code = "500"
}

resource "aws_api_gateway_integration_response" "frontend_proxy_200" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = aws_api_gateway_method_response.frontend_proxy_200[0].status_code
  response_parameters = {
    "method.response.header.Content-Length" = "integration.response.header.Content-Length"
    "method.response.header.Content-Type"   = "integration.response.header.Content-Type"
    "method.response.header.Timestamp"      = "integration.response.header.Date"
    "method.response.header.Cache-Control"  = "integration.response.header.Cache-Control"
  }
  depends_on = [aws_api_gateway_integration.frontend_proxy]
}

resource "aws_api_gateway_integration_response" "frontend_proxy_4xx" {
  count             = var.with_frontend_stack ? 1 : 0
  rest_api_id       = aws_api_gateway_rest_api.this.id
  resource_id       = aws_api_gateway_resource.frontend_proxy[0].id
  http_method       = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code       = aws_api_gateway_method_response.frontend_proxy_400[0].status_code
  selection_pattern = "4\\d{2}"
  depends_on        = [aws_api_gateway_integration.frontend_proxy]
}

resource "aws_api_gateway_integration_response" "frontend_proxy_5xx" {
  count             = var.with_frontend_stack ? 1 : 0
  rest_api_id       = aws_api_gateway_rest_api.this.id
  resource_id       = aws_api_gateway_resource.frontend_proxy[0].id
  http_method       = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code       = aws_api_gateway_method_response.frontend_proxy_500[0].status_code
  selection_pattern = "5\\d{2}"
  depends_on        = [aws_api_gateway_integration.frontend_proxy]
}

resource "aws_api_gateway_integration_response" "jobs_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.jobs.id
  http_method = aws_api_gateway_method.jobs_get.http_method
  status_code = aws_api_gateway_method_response.jobs_200.status_code

  response_parameters = {
    "method.response.header.Content-Type" = "'application/json'"
  }

  response_templates = {
    "application/json" = <<EOF
#set($inputRoot = $input.path('$'))
$inputRoot.Items
EOF
  }

  depends_on = [aws_api_gateway_integration.jobs_dynamodb]
}

resource "aws_api_gateway_integration_response" "jobs_4xx" {
  rest_api_id       = aws_api_gateway_rest_api.this.id
  resource_id       = aws_api_gateway_resource.jobs.id
  http_method       = aws_api_gateway_method.jobs_get.http_method
  status_code       = aws_api_gateway_method_response.jobs_400.status_code
  selection_pattern = "4\\d{2}"
  depends_on        = [aws_api_gateway_integration.jobs_dynamodb]
}

resource "aws_api_gateway_integration_response" "jobs_5xx" {
  rest_api_id       = aws_api_gateway_rest_api.this.id
  resource_id       = aws_api_gateway_resource.jobs.id
  http_method       = aws_api_gateway_method.jobs_get.http_method
  status_code       = aws_api_gateway_method_response.jobs_500.status_code
  selection_pattern = "5\\d{2}"
  depends_on        = [aws_api_gateway_integration.jobs_dynamodb]
}

resource "aws_api_gateway_integration_response" "jobs_options_200" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.jobs.id
  http_method = aws_api_gateway_method.jobs_options.http_method
  status_code = aws_api_gateway_method_response.jobs_options_200.status_code
  depends_on  = [aws_api_gateway_integration.jobs_options]
}

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.api_root,
      aws_api_gateway_resource.import,
      aws_api_gateway_resource.intergration,
      aws_api_gateway_method.this,
      aws_api_gateway_integration.this,
      aws_api_gateway_integration.jobs_options,
      aws_api_gateway_method.frontend_proxy_get,
      aws_api_gateway_integration.frontend_proxy,
      aws_api_gateway_method_response.frontend_proxy_200,
      aws_api_gateway_integration_response.frontend_proxy_200,
      aws_api_gateway_integration_response.frontend_proxy_4xx,
      aws_api_gateway_integration_response.frontend_proxy_5xx,
      aws_api_gateway_integration_response.jobs_options_200
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}
