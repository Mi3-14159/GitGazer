output "cdn_domain_name" {
  description = "The domain name of the CloudFront distribution."
  value       = try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)
}

output "docs_cdn_domain_name" {
  description = "The domain name of the docs CloudFront distribution"
  value       = var.docs_config.enabled ? try(var.docs_config.domain_name, aws_cloudfront_distribution.docs[0].domain_name) : null
}
