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

provider "github" {
  owner = data.terraform_remote_state.prerequisite.outputs.github_organization
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
  gh_webhook_secret = coalesce(var.gh_webhook_secret.plain, data.aws_kms_secrets.this.plaintext["gh_webhook_secret"])
}

data "aws_apigatewayv2_api" "authorizer" {
  api_id = coalesce(var.api_gateway_id, data.terraform_remote_state.rest-api.outputs.api_gateway_id)
}
