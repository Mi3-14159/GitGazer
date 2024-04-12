variable "aws_region" {
  type        = string
  description = "AWS region to deploy the resources"
}

variable "name_prefix" {
  type        = string
  description = "Prefix to add to the name of the resources"
  default     = "gitgazer"
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
