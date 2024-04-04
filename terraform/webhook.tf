resource "github_organization_webhook" "imports" {
  active = true
  configuration {
    url          = "https://${aws_cloudfront_distribution.this.domain_name}/api/import"
    content_type = "json"
    insecure_ssl = false
    secret       = local.gh_webhook_secret
  }
  events = ["workflow_job"]
}
