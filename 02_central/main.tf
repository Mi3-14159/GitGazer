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
      gitgazer  = true
      env       = terraform.workspace
      terraform = true
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  appsync_unit_resolvers = [
    {
      type : "Query",
      field : "listJobs",
      code_file_path : "${path.module}/resolvers/listJobs.js",
    },
    {
      type : "Query",
      field : "getJob",
      code_file_path : "${path.module}/resolvers/getJob.js",
    },
    {
      type : "Mutation",
      field : "putJob",
      code_file_path : "${path.module}/resolvers/putJob.js",
    },
  ]
}
