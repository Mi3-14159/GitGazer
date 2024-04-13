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
      app       = var.name_prefix
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  artifact = "${path.module}/../tmp/lambda.zip"
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
  appsync_additional_authentication_provider_api_key                   = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : provider if provider.authentication_type == "API_KEY"]
  appsync_additional_authentication_provider_amazon_cognito_user_pools = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : provider if provider.authentication_type == "AMAZON_COGNITO_USER_POOLS"]
  appsync_ui_as_array                                                  = split("/", aws_appsync_graphql_api.this.uris["GRAPHQL"])
  appsync_domain_name                                                  = element(local.appsync_ui_as_array, length(local.appsync_ui_as_array) - 2)
}
