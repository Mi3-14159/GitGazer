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
      app       = "${var.name_prefix}-websocket-handler"
    }
  }
}

locals {
  dynamodb_table_connections_connection_id_index = "connectionId-index"
}

data "aws_kms_key" "this" {
  key_id = "alias/${var.name_prefix}-${terraform.workspace}"
}

data "aws_cognito_user_pool" "this" {
  user_pool_id = "eu-central-1_IpIkxR5hD"
}

data "aws_cognito_user_pool_client" "this" {
  client_id    = "2bcev7e7t30n7odagplc8kfv0n"
  user_pool_id = data.aws_cognito_user_pool.this.id
}
