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
  database_endpoint             = var.enable_rds_proxy ? module.rds_proxy[0].proxy_endpoint : module.db.cluster_endpoint
  db_resource_id                = var.enable_rds_proxy ? element(split(":", module.rds_proxy[0].proxy_arn), 6) : module.db.cluster_resource_id
  vpc_id                        = coalesce(try(var.db_config.vpc_id, null), try(module.vpc.vpc_id, null))
  private_subnets               = coalescelist(try(var.db_config.subnets, []), try(module.vpc.private_subnets, []))
  availability_zones            = coalescelist(try(var.db_config.availability_zones, []), try(module.vpc.azs, []))
  ses_domain                    = var.ses_config.domain != null ? var.ses_config.domain : var.custom_domain_config.domain_name
  monitoring_alarm_actions      = var.enable_cloudwatch_alarm_notifications ? [aws_sns_topic.cloudwatch_alarms[0].arn] : []
  monitored_lambda_alarm_config = merge({
    api = {
      function_name         = aws_lambda_function.api.function_name
      duration_threshold_ms = 24000
    }
    api_websocket = {
      function_name         = aws_lambda_function.api_websocket.function_name
      duration_threshold_ms = 8000
    }
    worker = {
      function_name         = aws_lambda_function.worker.function_name
      duration_threshold_ms = 96000
    }
    org_sync_scheduler = {
      function_name         = aws_lambda_function.org_sync_scheduler.function_name
      duration_threshold_ms = 540000
    }
    },
    var.enable_http_proxy ? {
      http_proxy = {
        function_name         = aws_lambda_function.http_proxy[0].function_name
        duration_threshold_ms = 24000
      }
    } : {}
  )
  monitored_lambda_log_groups = merge({
    api                = aws_cloudwatch_log_group.api.name
    api_websocket      = aws_cloudwatch_log_group.api_websocket.name
    worker             = aws_cloudwatch_log_group.worker.name
    org_sync_scheduler = aws_cloudwatch_log_group.org_sync_scheduler.name
    },
    var.enable_http_proxy ? {
      http_proxy = aws_cloudwatch_log_group.http_proxy[0].name
    } : {}
  )
}
