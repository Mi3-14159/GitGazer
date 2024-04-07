variable "gh_oauth_app_client_id_encrypted" {
  type        = string
  sensitive   = true
  description = "GitHub OAuth app client id, encrypted with KMS"
}

variable "gh_oauth_app_client_secret_encrypted" {
  type        = string
  sensitive   = true
  description = "GitHub OAuth app client secret, encrypted with KMS"
}
