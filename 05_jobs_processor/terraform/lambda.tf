module "this" {
  source  = "moritzzimmer/lambda/aws"
  version = "~> 7.5"

  description      = "GitGazers jobs processor"
  filename         = local.artifact
  function_name    = local.name_prefix
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 5
  publish          = true
  environment = {
    variables = {
      ENVIRONMENT = terraform.workspace
      GRAPHQL_URI = data.terraform_remote_state.graphql_api.outputs.aws_appsync_graphql_uris["GRAPHQL"]
    }
  }
  kms_key_arn                       = data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn
  cloudwatch_logs_retention_in_days = 90
  event_source_mappings = {
    jobs_queue = {
      event_source_arn        = data.terraform_remote_state.central.outputs.jobs_sqs_queue_arn
      function_response_types = ["ReportBatchItemFailures"]
    }
  }
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "live version"
  function_name    = module.this.arn
  function_version = module.this.version
}

data "aws_iam_policy_document" "this" {
  statement {
    effect = "Allow"
    actions = [
      "appsync:GraphQL",
    ]
    resources = ["${data.terraform_remote_state.graphql_api.outputs.aws_appsync_graphql_api_arn}/types/Mutation/fields/putJob"]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [
      data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn,
    ]
  }
}

resource "aws_iam_policy" "this" {
  name   = "${local.name_prefix}-additional-policy"
  policy = data.aws_iam_policy_document.this.json
}

resource "aws_iam_role_policy_attachment" "this" {
  role       = module.this.role_name
  policy_arn = aws_iam_policy.this.arn
}
