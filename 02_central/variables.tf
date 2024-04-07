variable "gh_webhook_secret_encrypted" {
  type        = string
  sensitive   = true
  description = "GitHub webhook secret, encrypted with KMS"
}
