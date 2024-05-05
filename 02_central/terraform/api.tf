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

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.api_root,
      aws_api_gateway_resource.import,
      aws_api_gateway_resource.intergration,
      aws_api_gateway_method.this,
      aws_api_gateway_integration.this,
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
