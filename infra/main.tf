terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.3"
    }
  }
  required_version = "~> 1.0"
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
  frontend_failover_sub_path                     = "fe-failover"
  github_oauth_scopes                            = join(" ", distinct(concat(["openid"], var.github_oauth_scopes)))
  websocket_api_stage_name                       = "prod"
  dynamodb_table_connections_connection_id_index = "connectionId-index"
  s3tables_catalog_id                            = "${data.aws_caller_identity.current.account_id}:s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
  lambda_layers = flatten([
    "arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension:21",
    var.enable_lambda_tracing ? [
      "arn:aws:lambda:eu-central-1:580247275435:layer:LambdaInsightsExtension:64",
      "arn:aws:lambda:eu-central-1:615299751070:layer:AWSOpenTelemetryDistroJs:10",
  ] : []])
  lambda_application_log_level = "INFO"
  lambda_enable_event_logging  = true
}
