data "aws_kms_secrets" "this" {
  secret {
    name    = "gh_webhook_secret"
    payload = var.gh_webhook_secret_encrypted
  }

  secret {
    name    = "gh_oauth_app_client_id"
    payload = var.gh_oauth_app_client_id_encrypted
  }

  secret {
    name    = "gh_oauth_app_client_secret"
    payload = var.gh_oauth_app_client_secret_encrypted
  }
}

resource "aws_ssm_parameter" "gh_webhook_secret" {
  name   = "${local.ssm_parameter_gh_webhook_secret_name_prefix}default"
  type   = "SecureString"
  key_id = aws_kms_key.this.arn
  value  = data.aws_kms_secrets.this.plaintext["gh_webhook_secret"]
}
