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
  region = data.terraform_remote_state.prerequisite.outputs.aws_region
  default_tags {
    tags = {
      env       = terraform.workspace
      terraform = true
      app       = local.name_prefix
    }
  }
}

locals {
  name_prefix = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-jobs-processor"
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
      field : "createJob",
      code_file_path : "${path.module}/resolvers/createJob.js",
    },
    {
      type : "Mutation",
      field : "updateJob",
      code_file_path : "${path.module}/resolvers/updateJob.js",
    },
  ]
}
