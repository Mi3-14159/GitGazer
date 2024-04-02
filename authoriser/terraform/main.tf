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
  region = var.aws_region
  default_tags {
    tags = {
      env       = terraform.workspace
      terraform = true
      app       = local.name_prefix
    }
  }
}

locals {
  name_prefix = "${terraform.workspace}-${var.name_prefix}"
  public_api_routes = [
    "GET /auth/github",
    "GET /auth/github/callback",
  ]
  artifact = "${path.module}/../tmp/lambda.zip"
}
