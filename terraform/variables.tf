variable "api_gateway_id" {
  type        = string
  description = "Optional API Gateway ID, if not provided it will be retrieved from the remote state data.terraform_remote_state.rest-api.outputs.api_gateway_id which you need to specify."
  default     = null
}

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
