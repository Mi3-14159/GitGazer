output "cdn_domain_name" {
  description = "The domain name of the CloudFront distribution."
  value       = try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)
}
