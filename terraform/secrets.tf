data "aws_kms_secrets" "this" {
  secret {
    name    = "gh_webhook_secret"
    payload = var.gh_webhook_secret.encrypted
  }
}

resource "aws_ssm_parameter" "gh_webhook_secret" {
  name   = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-gh-webhook-secret"
  type   = "SecureString"
  key_id = data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn
  value  = local.gh_webhook_secret
}
