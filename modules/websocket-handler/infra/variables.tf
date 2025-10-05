variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "eu-central-1"
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "gitgazer"
}

variable "enable_lambda_api_tracing" {
  description = "Enable AWS X-Ray tracing for the Lambda function"
  type        = bool
  default     = false
}
