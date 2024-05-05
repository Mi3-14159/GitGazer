variable "github_owner" {
  type        = string
  description = "GitHub owner of the repositories, organization or user"
}

variable "aws_region" {
  type        = string
  description = "AWS region to deploy the resources"
}

variable "name_prefix" {
  type        = string
  description = "Prefix to add to the name of the resources"
  default     = "gitgazer"
}

variable "gh_webhook_secret_encrypted" {
  type        = string
  sensitive   = true
  description = "GitHub webhook secret, encrypted with KMS"
}

variable "enabled_pitr" {
  type        = bool
  description = "Enable point in time recovery for the DynamoDB table"
  default     = false
}

variable "expire_in_sec" {
  type        = number
  description = "Time in seconds for the jobs to expire"
  default     = 60 * 60 * 24 * 7 # 7 days
}

variable "with_frontend_stack" {
  type        = bool
  description = "Deploy the frontend stack"
  default     = true
}

variable "apigateway_logging_enabled" {
  type        = bool
  description = "Enable logging of the HTTP API Gateway"
  default     = true
}

variable "aws_appsync_graphql_api_logging_enabled" {
  type        = bool
  description = "Enable logging of the AppSync GraphQL API"
  default     = true
}

variable "aws_appsync_graphql_api_additional_authentication_providers" {
  type = list(object({
    authentication_type = string
    user_pool_config = optional(object({
      user_pool_id        = string
      app_id_client_regex = optional(string)
      aws_region          = optional(string)
    }))
  }))
  description = "Additional authentication providers for the AppSync GraphQL API"
  default     = []
  validation {
    condition     = length([for provider in var.aws_appsync_graphql_api_additional_authentication_providers : provider.authentication_type if provider.authentication_type != "API_KEY" && provider.authentication_type != "AMAZON_COGNITO_USER_POOLS"]) == 0
    error_message = "In this implementation only API_KEY and AMAZON_COGNITO_USER_POOLS are allowed as additional authentication providers. If you need more, please open an issue on the GitHub repository."
  }
}

variable "custom_domain_config" {
  type = object({
    hosted_zone_id  = string
    domain_name     = string
    certificate_arn = string
  })
  description = "Configuration for the custom domain"
  default     = null
}

variable "create_github_organization_webhook" {
  type        = bool
  description = "Create a webhook in the GitHub organization. Can only be used if the var.github_owner is an organization."
  default     = false
}

variable "create_github_repository_webhooks_repositories" {
  type        = list(string)
  description = "Create webhooks in the GitHub repositories. Can only be used if the var.github_owner is a user."
  default     = []
}

variable "create_gitgazer_alerting" {
  type        = bool
  description = "Create alerting for the GitGater resources"
  default     = true
}
