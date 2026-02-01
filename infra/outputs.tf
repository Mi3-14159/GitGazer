output "cdn_domain_name" {
  description = "The domain name of the CloudFront distribution."
  value       = try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)
}

output "websocket_endpoint" {
  description = "The WebSocket API endpoint URL"
  value       = "${aws_apigatewayv2_api.websocket.api_endpoint}/${aws_apigatewayv2_stage.websocket_ws.name}"
}
