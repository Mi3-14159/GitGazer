output "jobs_sqs_queue_arn" {
  description = "The ARN of the SQS queue that jobs are sent to."
  value       = module.jobs.queue_arn
}

output "cdn_domain_name" {
  description = "The domain name of the CloudFront distribution."
  value       = try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)
}

output "aws_appsync_graphql_uris" {
  description = "The URIs of the AppSync GraphQL API."
  value       = local.aws_appsync_graphql_uris
}

output "aws_appsync_graphql_api_arn" {
  description = "The ARN of the AppSync GraphQL API."
  value       = aws_appsync_graphql_api.this.arn
}

/*
{
      - GRAPHQL  = "https://z2giwaeqtvhapgejerc6g2bszm.appsync-api.eu-central-1.amazonaws.com/graphql"
      - REALTIME = "wss://z2giwaeqtvhapgejerc6g2bszm.appsync-realtime-api.eu-central-1.amazonaws.com/graphql"
    }
*/
