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
