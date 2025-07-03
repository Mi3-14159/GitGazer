terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.2"
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
    }
  }
}

locals {
  name_prefix            = "${var.name_prefix}-auth-proxy-${terraform.workspace}"
  artifact               = "${path.module}/../tmp/lambda.zip"
  api_gateway_stage_name = "v1"
  github_oauth_scopes    = join(" ", distinct(concat(["openid"], var.github_oauth_scopes)))
}

data "aws_kms_key" "this" {
  key_id = "alias/${var.name_prefix}-${terraform.workspace}"
}
