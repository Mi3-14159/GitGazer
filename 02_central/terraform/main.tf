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
  owner = var.github_owner
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
  artifact          = "${path.module}/../tmp/lambda.zip"
  appsync_functions = []
  appsync_unit_resolvers = flatten([
    {
      type : "Query",
      field : "listJobs",
      code_file_path : "${path.module}/resolvers/listJobs.js",
      data_source : aws_appsync_datasource.jobs.name,
      kind : "UNIT",
    },
    {
      type : "Query",
      field : "getJob",
      code_file_path : "${path.module}/resolvers/getJob.js",
      data_source : aws_appsync_datasource.jobs.name,
      kind : "UNIT",
    },
    {
      type : "Mutation",
      field : "putJob",
      code_file_path : "${path.module}/resolvers/putJob.js",
      data_source : aws_appsync_datasource.jobs.name,
      kind : "UNIT",
    },
    {
      type : "Subscription",
      field : "onPutJob",
      code_file_path : "${path.module}/resolvers/onPutJob.js",
      data_source : aws_appsync_datasource.none.name,
      kind : "UNIT",
    },
    var.create_gitgazer_alerting ? [{
      type : "Mutation",
      field : "putNotificationRule",
      code_file_path : "${path.module}/resolvers/putNotificationRule.js",
      data_source : aws_appsync_datasource.notification_rules[0].name,
      kind : "UNIT",
    }] : [],
  ])
  appsync_additional_authentication_provider_api_key                   = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : provider if provider.authentication_type == "API_KEY"]
  appsync_additional_authentication_provider_amazon_cognito_user_pools = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : provider if provider.authentication_type == "AMAZON_COGNITO_USER_POOLS"]
  aws_appsync_graphql_uris = {
    GRAPHQL  = try(format("https://%s/graphql", aws_appsync_domain_name.this.domain_name), aws_appsync_graphql_api.this.uris["GRAPHQL"])
    REALTIME = try(format("wss://%s/graphql/realtime", aws_appsync_domain_name.this.domain_name), aws_appsync_graphql_api.this.uris["REALTIME"])
  }
  api_gateway_stage_name                      = "v1"
  ssm_parameter_gh_webhook_secret_name_prefix = "/${var.name_prefix}-${terraform.workspace}/gh-webhook-secret/"
}
