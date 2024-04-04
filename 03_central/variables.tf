
variable "gh_webhook_secret" {
  type = object({
    plain     = optional(string)
    encrypted = optional(string)
  })
  sensitive   = true
  description = "GitHub webhook secret"
  validation {
    condition     = var.gh_webhook_secret.plain != null || var.gh_webhook_secret.encrypted != null
    error_message = "Either plain or encrypted client secret must be provided"
  }
}
