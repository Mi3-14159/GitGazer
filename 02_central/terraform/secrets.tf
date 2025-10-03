data "aws_kms_secrets" "this" {
  secret {
    name    = "gh_oauth_app_client_id"
    payload = var.gh_oauth_app_client_id_encrypted
  }

  secret {
    name    = "gh_oauth_app_client_secret"
    payload = var.gh_oauth_app_client_secret_encrypted
  }
}
