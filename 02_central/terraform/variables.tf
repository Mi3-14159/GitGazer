variable "github_organization" {
  type        = string
  description = "GitHub organization to manage the repositories"
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

variable "api_aws_apigatewayv2_api_logging_enabled" {
  type        = bool
  description = "Enable logging of the HTTP API Gateway"
  default     = true
}

variable "aws_appsync_graphql_api_logging_enabled" {
  type        = bool
  description = "Enable logging of the AppSync GraphQL API"
  default     = true
}
