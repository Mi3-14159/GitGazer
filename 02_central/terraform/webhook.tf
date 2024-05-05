resource "github_organization_webhook" "imports" {
  count  = var.create_github_organization_webhook ? 1 : 0
  active = true
  configuration {
    url          = "https://${try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)}/v1/api/import/default"
    content_type = "json"
    insecure_ssl = false
    secret       = data.aws_kms_secrets.this.plaintext["gh_webhook_secret"]
  }
  events = ["workflow_job"]
}

resource "github_repository_webhook" "imports" {
  for_each   = { for repo in var.create_github_repository_webhooks_repositories : repo => repo }
  active     = true
  repository = each.key
  configuration {
    url          = "https://${try(var.custom_domain_config.domain_name, aws_cloudfront_distribution.this.domain_name)}/v1/api/import/default"
    content_type = "json"
    insecure_ssl = false
    secret       = data.aws_kms_secrets.this.plaintext["gh_webhook_secret"]
  }
  events = ["workflow_job"]
}
