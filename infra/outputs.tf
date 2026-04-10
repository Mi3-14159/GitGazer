output "cdn_domain_name" {
  description = "The domain name of the CloudFront distribution."
  value       = try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)
}

output "websocket_endpoint" {
  description = "The WebSocket API endpoint URL"
  value       = "${aws_apigatewayv2_api.websocket.api_endpoint}/${aws_apigatewayv2_stage.websocket_ws.name}"
}

output "bastion_instance_id" {
  description = "Instance ID of the bastion host (use with SSM Session Manager)"
  value       = var.enable_bastion ? aws_instance.bastion[0].id : null
}

output "bastion_ssm_port_forward_command" {
  description = "Command to start an SSM port-forwarding session to the RDS Proxy"
  value       = var.enable_bastion ? "aws ssm start-session --target ${aws_instance.bastion[0].id} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{\"host\":[\"${module.rds_proxy.proxy_endpoint}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5432\"]}' " : null
}

output "ses_domain_identity_arn" {
  description = "ARN of the SES domain identity for sending emails"
  value       = var.ses_config.enabled ? aws_ses_domain_identity.this[0].arn : null
}

output "ses_from_email" {
  description = "The verified sender email address for SES"
  value       = var.ses_config.enabled ? "${var.ses_config.from_prefix}@${local.ses_domain}" : null
}
