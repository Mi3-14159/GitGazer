resource "aws_cloudwatch_log_group" "api_gateway_websocket" {
  count             = var.apigateway_logging_enabled ? 1 : 0
  name              = "/aws/apigateway/${aws_apigatewayv2_api.websocket.id}/${local.websocket_api_stage_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "api_gateway_websocket_access_logs" {
  count             = var.apigateway_logging_enabled ? 1 : 0
  name              = "/aws/apigateway/${aws_apigatewayv2_api.websocket.id}/${local.websocket_api_stage_name}/access-logs"
  retention_in_days = 30
}

resource "aws_apigatewayv2_api" "websocket" {
  name                       = "${var.name_prefix}-github-websocket-api-${terraform.workspace}"
  description                = "GitGazer WebSocket API - ${terraform.workspace}"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_apigatewayv2_stage" "websocket_ws" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = local.websocket_api_stage_name
  auto_deploy = true

  default_route_settings {
    detailed_metrics_enabled = true
    throttling_burst_limit   = 500
    throttling_rate_limit    = 1000
  }

  dynamic "access_log_settings" {
    for_each = var.apigateway_logging_enabled ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.api_gateway_websocket_access_logs[0].arn
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

resource "aws_apigatewayv2_integration" "websocket" {
  api_id                 = aws_apigatewayv2_api.websocket.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_alias.api_websocket_live.invoke_arn
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "websocket_connect" {
  api_id             = aws_apigatewayv2_api.websocket.id
  route_key          = "$connect"
  authorization_type = "AWS_IAM"
  target             = "integrations/${aws_apigatewayv2_integration.websocket.id}"
  operation_name     = "ConnectRoute"
}

resource "aws_apigatewayv2_route" "websocket_disconnect" {
  api_id         = aws_apigatewayv2_api.websocket.id
  route_key      = "$disconnect"
  target         = "integrations/${aws_apigatewayv2_integration.websocket.id}"
  operation_name = "DisconnectRoute"
}
