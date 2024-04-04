variable "enabled_pitr" {
  type        = bool
  description = "Enable point in time recovery for the DynamoDB table"
  default     = false
}

variable "gh_client_id" {
  type = object({
    plain     = optional(string)
    encrypted = optional(string)
  })
  sensitive   = true
  description = "GitHub OAuth client id"
  validation {
    condition     = var.gh_client_id.plain != null || var.gh_client_id.encrypted != null
    error_message = "Either plain or encrypted client id must be provided"
  }
}

variable "gh_client_secret" {
  type = object({
    plain     = optional(string)
    encrypted = optional(string)
  })
  sensitive   = true
  description = "GitHub OAuth client secret"
  validation {
    condition     = var.gh_client_secret.plain != null || var.gh_client_secret.encrypted != null
    error_message = "Either plain or encrypted client secret must be provided"
  }
}
