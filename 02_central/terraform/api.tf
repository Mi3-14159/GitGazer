resource "aws_cloudwatch_log_group" "gw_access_logs" {
  count             = var.apigateway_logging_enabled ? 1 : 0
  name              = "/aws/apigateway/${var.name_prefix}-rest-api-${terraform.workspace}/${local.api_gateway_stage_name}"
  retention_in_days = 30
}

resource "aws_api_gateway_rest_api" "this" {
  name        = "${var.name_prefix}-github-rest-api-${terraform.workspace}"
  description = "GitGazer REST API"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
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

resource "aws_api_gateway_integration" "this" {
  http_method             = aws_api_gateway_method.this.http_method
  resource_id             = aws_api_gateway_resource.intergration.id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_alias.live.invoke_arn
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

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.api_root,
      aws_api_gateway_resource.import,
      aws_api_gateway_resource.intergration,
      aws_api_gateway_method.this,
      aws_api_gateway_integration.this,
      aws_api_gateway_method.frontend_proxy_get,
      aws_api_gateway_integration.frontend_proxy,
      aws_api_gateway_method_response.frontend_proxy_200,
      aws_api_gateway_integration_response.frontend_proxy_200,
      aws_api_gateway_integration_response.frontend_proxy_4xx,
      aws_api_gateway_integration_response.frontend_proxy_5xx,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "this" {
  deployment_id = aws_api_gateway_deployment.this.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = local.api_gateway_stage_name
  depends_on    = [aws_cloudwatch_log_group.gw_access_logs]
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

resource "aws_iam_role" "invocation_role" {
  name               = "${var.name_prefix}-api-gw-invocation-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.invocation_assume_role.json
  inline_policy {
    name   = "default"
    policy = data.aws_iam_policy_document.invocation_policy.json
  }
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

# resource "aws_api_gateway_method_settings" "this" {
#   rest_api_id = aws_api_gateway_rest_api.this.id
#   stage_name  = aws_api_gateway_stage.this.stage_name
#   method_path = "*/*"

#   settings {
#     metrics_enabled = true
#     logging_level   = var.apigateway_logging_enabled ? "INFO" : "OFF"
#   }
#   depends_on = [aws_cloudwatch_log_group.gw_access_logs]
# }
