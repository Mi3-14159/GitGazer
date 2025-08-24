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

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = uuid()
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

resource "aws_api_gateway_authorizer" "cognito" {
  name            = "${var.name_prefix}-cognito-authorizer-${terraform.workspace}"
  rest_api_id     = aws_api_gateway_rest_api.this.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : "arn:aws:cognito-idp:${provider.user_pool_config.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${provider.user_pool_config.user_pool_id}" if provider.authentication_type == "AMAZON_COGNITO_USER_POOLS"]
  identity_source = "method.request.header.Authorization"
}
