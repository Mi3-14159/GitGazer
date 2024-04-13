data "aws_kms_secrets" "this" {
  secret {
    name    = "gh_webhook_secret"
    payload = var.gh_webhook_secret_encrypted
  }
}

resource "aws_ssm_parameter" "gh_webhook_secret" {
  name   = "${var.name_prefix}-gh-webhook-secret-${terraform.workspace}"
  type   = "SecureString"
  key_id = aws_kms_key.this.arn
  value  = data.aws_kms_secrets.this.plaintext["gh_webhook_secret"]
}
