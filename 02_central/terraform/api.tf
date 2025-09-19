resource "aws_cloudwatch_log_group" "gw_access_logs" {
  count             = var.apigateway_logging_enabled ? 1 : 0
  name              = "/aws/apigatewayv2/${var.name_prefix}-http-api-${terraform.workspace}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-github-http-api-${terraform.workspace}"
  description   = "GitGazer HTTP API"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = var.custom_domain_config != null ? true : false
    allow_headers     = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token", "x-amz-user-agent"]
    allow_methods     = ["*"]
    allow_origins     = var.custom_domain_config != null ? ["https://${var.custom_domain_config.domain_name}"] : ["*"]
    expose_headers    = ["date", "keep-alive"]
    max_age           = 86400
  }
}

resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    detailed_metrics_enabled = true
  }

  dynamic "access_log_settings" {
    for_each = var.apigateway_logging_enabled ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.gw_access_logs[0].arn
      format = jsonencode({
        requestId      = "$context.requestId"
        ip             = "$context.identity.sourceIp"
        requestTime    = "$context.requestTime"
        httpMethod     = "$context.httpMethod"
        routeKey       = "$context.routeKey"
        status         = "$context.status"
        protocol       = "$context.protocol"
        responseLength = "$context.responseLength"
      })
    }
  }

  depends_on = [aws_cloudwatch_log_group.gw_access_logs]
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
}

resource "aws_iam_role_policy" "invocation_policy" {
  name   = "default"
  role   = aws_iam_role.invocation_role.id
  policy = data.aws_iam_policy_document.invocation_policy.json
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

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.name_prefix}-cognito-authorizer-${terraform.workspace}"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.this.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
  }
}
