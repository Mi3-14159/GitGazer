data "aws_kms_secrets" "this" {
  dynamic "secret" {
    for_each = {
      gh_client_id     = var.gh_client_id.encrypted
      gh_client_secret = var.gh_client_secret.encrypted
    }
    content {
      name    = secret.key
      payload = secret.value
    }
  }
}

resource "aws_ssm_parameter" "gh_client_config" {
  name   = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-gh-client-config"
  type   = "SecureString"
  key_id = data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn
  value = jsonencode({
    id     = coalesce(var.gh_client_id.plain, data.aws_kms_secrets.this.plaintext["gh_client_id"])
    secret = coalesce(var.gh_client_secret.plain, data.aws_kms_secrets.this.plaintext["gh_client_secret"])
  })
}
