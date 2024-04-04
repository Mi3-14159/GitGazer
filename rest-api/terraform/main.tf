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
      app       = data.terraform_remote_state.prerequisite.outputs.name_prefix
    }
  }
}

locals {
  public_api_routes = [
    "GET /auth/github",
    "GET /auth/github/callback",
  ]
  artifact = "${path.module}/../tmp/lambda.zip"
}
