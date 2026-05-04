variable "aws_region" {
  type        = string
  description = "AWS region to deploy the resources"
}

variable "name_prefix" {
  type        = string
  description = "Prefix to add to the name of the resources"
  default     = "gitgazer"
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

variable "gh_app" {
  type = object({
    id                       = string
    private_key_encrypted    = string
    webhook_secret_encrypted = string
  })
  sensitive   = true
  description = "GitHub App configuration (ID, KMS-encrypted private key and webhook secret)"
}

variable "callback_urls" {
  type        = list(string)
  description = "List of callback URLs for the Cognito User Pool Client"
  default     = []
}

variable "github_oauth_scopes" {
  type        = list(string)
  description = "List of additional GitHub OAuth scopes to request"
  default     = []
}

variable "enable_http_proxy" {
  type        = bool
  description = "Deploy the HTTP proxy Lambda for routing requests to IPv4-only services (GitHub, Slack) from the IPv6-only VPC"
  default     = true
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

variable "db_config" {
  type = object({
    engine_version              = optional(string, "17.7")
    engine_mode                 = optional(string, "provisioned")
    instance_class              = optional(string, "db.serverless")
    vpc_id                      = optional(string)
    availability_zones          = optional(list(string))
    subnets                     = optional(list(string))
    cluster_monitoring_interval = optional(number, 0)
    serverlessv2_scaling_configuration = optional(object({
      max_capacity             = number
      min_capacity             = optional(number)
      seconds_until_auto_pause = optional(number)
      }), {
      min_capacity             = 0.5
      max_capacity             = 2
      seconds_until_auto_pause = null
    })
    instances = optional(any, {
      one = {}
    })
    cluster_performance_insights_retention_period = optional(number, 7)
    enable_http_endpoint                          = optional(bool, true)
  })
  description = "Configuration for the RDS database"
}

variable "enable_bastion" {
  type        = bool
  description = "Whether to create a bastion host for database access via SSM Session Manager"
  default     = false
}

variable "ses_config" {
  type = object({
    enabled     = bool
    domain      = optional(string)
    from_prefix = optional(string, "noreply")
  })
  description = "SES configuration for sending invitation emails. Domain defaults to custom_domain_config.domain_name if not set."
  default = {
    enabled = false
  }
}

variable "vpc" {
  type = object({
    create = bool
    config = optional(object({
      azs                                           = list(string)
      cidr_block                                    = optional(string)
      public_subnets                                = optional(list(string), [])
      private_subnets                               = optional(list(string), [])
      enable_nat_gateway                            = optional(bool, false)
      single_nat_gateway                            = optional(bool, false)
      create_egress_only_igw                        = optional(bool, true)
      enable_ipv6                                   = optional(bool, true)
      public_subnet_assign_ipv6_address_on_creation = optional(bool, true)
      public_subnet_ipv6_prefixes                   = optional(list(number), [])
      private_subnet_ipv6_prefixes                  = optional(list(number), [])
    }))
  })
  default = {
    create = false
  }
  description = "Configuration for the VPC"
}

variable "docs_config" {
  type = object({
    enabled         = bool
    domain_name     = optional(string)
    certificate_arn = optional(string)
    hosted_zone_id  = optional(string)
  })
  description = "Configuration for the documentation site (Docusaurus)"
  default = {
    enabled = false
  }
}
