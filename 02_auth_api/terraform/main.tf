terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = "~> 1.0"
}

provider "aws" {
  region = data.terraform_remote_state.prerequisite.outputs.aws_region
  default_tags {
    tags = {
      env       = terraform.workspace
      terraform = true
    }
  }
}

locals {
  name_prefix            = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-auth-proxy"
  artifact               = "${path.module}/../tmp/lambda.zip"
  api_gateway_stage_name = "v1"
}
