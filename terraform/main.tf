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
  owner = var.github_organization
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      env       = terraform.workspace
      terraform = true
    }
  }
}

locals {
  name_prefix = "${terraform.workspace}-${var.name_prefix}"
}

data "aws_apigatewayv2_api" "authorizer" {
  api_id = coalesce(var.api_gateway_id, data.terraform_remote_state.authorizer.outputs.api_gateway_id)
}
