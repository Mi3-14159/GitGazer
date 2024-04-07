output "jobs_sqs_queue_arn" {
  value = module.jobs.queue_arn
}

output "cdn_domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}
