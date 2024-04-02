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

variable "api_gateway_id" {
  type = string
  description = "Optional API Gateway ID, if not provided it will be retrieved from the remote state data.terraform_remote_state.authorizer.outputs.api_gateway_id which you need to specify."
  default = null
}