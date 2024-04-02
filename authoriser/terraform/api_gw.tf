resource "aws_cloudwatch_log_group" "gw_access_logs" {
  name              = "/aws/apigateway/${local.name_prefix}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_api" "this" {
  name          = local.name_prefix
  description   = "GitGazer ${terraform.workspace} api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_credentials = true
    allow_headers     = ["Content-Type"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH", "OPTIONS"]
    allow_origins = [
      "http://localhost:3000",
    ]
    expose_headers = []
    max_age        = 604800 # 7 days
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.gw_access_logs.arn
    format = jsonencode(
      {
        requestId : "$context.requestId",
        ip : "$context.identity.sourceIp",
        requestTime : "$context.requestTime",
        httpMethod : "$context.httpMethod",
        routeKey : "$context.routeKey",
        status : "$context.status",
        protocol : "$context.protocol",
        path : "$context.path",
        responseLength : "$context.responseLength"
        authError : "$context.authorizer.error",
        errorMessage : "$context.error.message",
        integrationErrorMessage : "$context.integrationErrorMessage",
        responseLatency : "$context.responseLatency",
      }
    )
  }

  default_route_settings {
    detailed_metrics_enabled = true
    #logging_level            = "INFO"
    throttling_burst_limit = 5000  # same as account wide limit
    throttling_rate_limit  = 10000 # same as account wide limit
  }

  # Bug in terraform-aws-provider with perpetual diff
  lifecycle {
    ignore_changes = [deployment_id]
  }
}

resource "aws_apigatewayv2_integration" "api_lambda_integration" {
  api_id           = aws_apigatewayv2_api.this.id
  integration_type = "AWS_PROXY"

  # Connecting to Lambda function
  integration_uri        = aws_lambda_alias.live.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "public_api_routes" {
  for_each  = toset(local.public_api_routes)
  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.api_lambda_integration.id}"
}
