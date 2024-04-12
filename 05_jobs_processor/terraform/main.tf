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
      gitgazer  = true
    }
  }
}

locals {
  name_prefix = "${var.name_prefix}-jobs-processor-${terraform.workspace}"
  artifact    = "${path.module}/../tmp/lambda.zip"
}

data "aws_kms_key" "this" {
  key_id = "alias/${var.name_prefix}-${terraform.workspace}"
}
