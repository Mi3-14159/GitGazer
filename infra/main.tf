terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.3"
    }
    awscc = {
      source  = "hashicorp/awscc"
      version = "~> 1.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  required_version = "~> 1.0"
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = local.default_tags
  }
}

data "aws_caller_identity" "current" {}

data "aws_ssoadmin_instances" "this" {}

data "aws_lakeformation_data_lake_settings" "this" {}

locals {
  default_tags = {
    gitgazer  = true
    env       = terraform.workspace
    terraform = true
    app       = var.name_prefix
  }
  frontend_failover_sub_path = "fe-failover"
  github_oauth_scopes        = join(" ", distinct(concat(["openid"], var.github_oauth_scopes)))
  websocket_api_stage_name   = "prod"
  lambda_layers = flatten([
    "arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension:21",
    var.enable_lambda_tracing ? [
      "arn:aws:lambda:eu-central-1:580247275435:layer:LambdaInsightsExtension:64",
      "arn:aws:lambda:eu-central-1:615299751070:layer:AWSOpenTelemetryDistroJs:10",
  ] : []])
  lambda_application_log_level = "INFO"
  lambda_enable_event_logging  = true
  cors_allowed_origins = compact([
    "https://app.gitgazer.localhost:5173",
    try("https://${var.custom_domain_config.domain_name}", null),
  ])
  worker_lambda_timeout_seconds = 120
}
