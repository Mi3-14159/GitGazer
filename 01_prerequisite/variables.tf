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