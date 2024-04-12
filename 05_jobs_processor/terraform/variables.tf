variable "aws_region" {
  type        = string
  description = "AWS region to deploy the resources"
}

variable "name_prefix" {
  type        = string
  description = "Prefix to add to the name of the resources"
  default     = "gitgazer"
}

variable "expire_in_sec" {
  type        = number
  description = "Time in seconds for the jobs to expire"
  default     = 60 * 60 * 24 * 7 # 7 days
}
