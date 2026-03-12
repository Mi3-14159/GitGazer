data "aws_kms_secrets" "this" {
  secret {
    name    = "gh_oauth_app_client_id"
    payload = var.gh_oauth_app_client_id_encrypted
  }

  secret {
    name    = "gh_oauth_app_client_secret"
    payload = var.gh_oauth_app_client_secret_encrypted
  }

  secret {
    name    = "gh_app_private_key"
    payload = var.gh_app.private_key_encrypted
  }

  secret {
    name    = "gh_app_webhook_secret"
    payload = var.gh_app.webhook_secret_encrypted
  }
}
