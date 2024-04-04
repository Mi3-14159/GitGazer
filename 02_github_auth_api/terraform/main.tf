terraform {
  required_providers {
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
      app       = local.name_prefix
    }
  }
}

locals {
  name_prefix = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-github-auth-api"
  artifact    = "${path.module}/../tmp/lambda.zip"
}
