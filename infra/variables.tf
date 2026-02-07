
variable "aws_region" {
  type        = string
  description = "AWS region to deploy the resources"
}

variable "name_prefix" {
  type        = string
  description = "Prefix to add to the name of the resources"
  default     = "gitgazer"
}

variable "enabled_pitr" {
  type        = bool
  description = "Enable point in time recovery for the DynamoDB table"
  default     = false
}

variable "expire_in_sec" {
  type        = number
  description = "Time in seconds for the jobs to expire. If null, the TTL will be disabled."
  default     = null
}

variable "apigateway_logging_enabled" {
  type        = bool
  description = "Enable logging of the HTTP API Gateway"
  default     = true
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

variable "callback_uls" {
  type        = list(string)
  description = "List of callback URLs for the Cognito User Pool Client"
  default     = []
}

variable "github_oauth_scopes" {
  type        = list(string)
  description = "List of additional GitHub OAuth scopes to request"
  default     = []
}

variable "enable_lambda_tracing" {
  type        = bool
  description = "Enable AWS X-Ray tracing for the Lambda functions"
  default     = false
}

variable "enable_bedrock_invocation_logging" {
  type        = bool
  description = "Enable logging of Bedrock model invocations"
  default     = false
}
