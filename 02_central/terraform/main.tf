terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.3"
    }
  }
  required_version = "~> 1.0"
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      gitgazer  = true
      env       = terraform.workspace
      terraform = true
      app       = var.name_prefix
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  artifact                                    = "${path.module}/../dist/lambda.zip"
  ssm_parameter_gh_webhook_secret_name_prefix = "/${var.name_prefix}-${terraform.workspace}/gh-webhook-secret/"
  frontend_failover_sub_path                  = "fe-failover"
  github_oauth_scopes                         = join(" ", distinct(concat(["openid"], var.github_oauth_scopes)))
  websocket_api_stage_name                    = "prod"
}
