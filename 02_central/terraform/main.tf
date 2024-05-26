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
  artifact = "${path.module}/../tmp/lambda.zip"
  appsync_functions = flatten([
    var.create_gitgazer_alerting ? [{
      name : "getSsmSecrets",
      code : templatefile("${path.module}/functions/getSsmSecrets.tftpl", {
        ssm_parameter_name_prefix = local.ssm_parameter_gh_webhook_secret_name_prefix
      }),
      data_source : aws_appsync_datasource.ssm[0].name,
      }, {
      name : "putSsmSecret",
      code : templatefile("${path.module}/functions/putSsmSecret.tftpl", {
        ssm_parameter_name_prefix = local.ssm_parameter_gh_webhook_secret_name_prefix
        kms_key_id                = aws_kms_key.this.id
      }),
      data_source : aws_appsync_datasource.ssm[0].name,
      }, {
      name : "createCognitoGroup",
      code : templatefile("${path.module}/functions/createCognitoGroup.tftpl", {
        user_pool_id = element([for each in var.aws_appsync_graphql_api_additional_authentication_providers : each.user_pool_config.user_pool_id if each.authentication_type == "AMAZON_COGNITO_USER_POOLS"], 0)
      }),
      data_source : aws_appsync_datasource.cognito[0].name,
      }, {
      name : "deleteCognitoGroup",
      code : templatefile("${path.module}/functions/deleteCognitoGroup.tftpl", {
        user_pool_id = element([for each in var.aws_appsync_graphql_api_additional_authentication_providers : each.user_pool_config.user_pool_id if each.authentication_type == "AMAZON_COGNITO_USER_POOLS"], 0)
      }),
      data_source : aws_appsync_datasource.cognito[0].name,
      }, {
      name : "addUserToGroup",
      code : templatefile("${path.module}/functions/addUserToGroup.tftpl", {
        user_pool_id = element([for each in var.aws_appsync_graphql_api_additional_authentication_providers : each.user_pool_config.user_pool_id if each.authentication_type == "AMAZON_COGNITO_USER_POOLS"], 0)
      }),
      data_source : aws_appsync_datasource.cognito[0].name,
      }, {
      name : "deleteSsmParameter",
      code : templatefile("${path.module}/functions/deleteSsmParameter.tftpl", {
        ssm_parameter_name_prefix = local.ssm_parameter_gh_webhook_secret_name_prefix
      }),
      data_source : aws_appsync_datasource.ssm[0].name,
    }] : [],
  ])
  appsync_resolvers = flatten([
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
      }, {
      type : "Query",
      field : "listNotificationRules",
      code_file_path : "${path.module}/resolvers/listNotificationRules.js",
      data_source : aws_appsync_datasource.notification_rules[0].name,
      kind : "UNIT",
      }, {
      type : "Query",
      field : "listIntegrations",
      code_file_path : "${path.module}/resolvers/listIntegrations.js",
      kind : "PIPELINE",
      pipeline_config : {
        functions : [
          aws_appsync_function.this["getSsmSecrets"].function_id,
        ],
      }
      }, {
      type : "Mutation",
      field : "putIntegration",
      code_file_path : "${path.module}/resolvers/putIntegration.js",
      kind : "PIPELINE",
      pipeline_config : {
        functions : [
          aws_appsync_function.this["putSsmSecret"].function_id,
          aws_appsync_function.this["createCognitoGroup"].function_id,
          aws_appsync_function.this["addUserToGroup"].function_id,
        ],
      }
      }, {
      type : "Mutation",
      field : "deleteIntegration",
      code_file_path : "${path.module}/resolvers/deleteIntegration.js",
      kind : "PIPELINE",
      pipeline_config : {
        functions : [
          aws_appsync_function.this["deleteSsmParameter"].function_id,
          aws_appsync_function.this["deleteCognitoGroup"].function_id,
        ],
      }
    }] : [null, null, null, null, null],
  ])
  appsync_additional_authentication_provider_api_key                   = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : provider if provider.authentication_type == "API_KEY"]
  appsync_additional_authentication_provider_amazon_cognito_user_pools = [for provider in var.aws_appsync_graphql_api_additional_authentication_providers : provider if provider.authentication_type == "AMAZON_COGNITO_USER_POOLS"]
  aws_appsync_graphql_uris = {
    GRAPHQL  = try(format("https://%s/graphql", aws_appsync_domain_name.this.domain_name), aws_appsync_graphql_api.this.uris["GRAPHQL"])
    REALTIME = try(format("wss://%s/graphql/realtime", aws_appsync_domain_name.this.domain_name), aws_appsync_graphql_api.this.uris["REALTIME"])
  }
  api_gateway_stage_name                      = "v1"
  ssm_parameter_gh_webhook_secret_name_prefix = "/${var.name_prefix}-${terraform.workspace}/gh-webhook-secret/"
  frontend_failover_sub_path                  = "fe-failover"
}
