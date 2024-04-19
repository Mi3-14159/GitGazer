module "this" {
  source  = "moritzzimmer/lambda/aws"
  version = "~> 7.5"

  description      = "GitGazers jobs processor"
  filename         = local.artifact
  function_name    = "${var.name_prefix}-jobs-processor-${terraform.workspace}"
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 5
  publish          = true
  environment = {
    variables = {
      ENVIRONMENT   = terraform.workspace
      GRAPHQL_URI   = local.aws_appsync_graphql_uris["GRAPHQL"]
      EXPIRE_IN_SEC = var.expire_in_sec
    }
  }
  kms_key_arn                       = aws_kms_key.this.arn
  cloudwatch_logs_kms_key_id        = aws_kms_key.this.arn
  cloudwatch_logs_retention_in_days = 30
  event_source_mappings = {
    jobs_queue = {
      event_source_arn        = module.jobs.queue_arn
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
    resources = ["${aws_appsync_graphql_api.this.arn}/types/Mutation/fields/putJob"]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [
      aws_kms_key.this.arn,
    ]
  }
}

resource "aws_iam_policy" "this" {
  name   = "${var.name_prefix}-jobs-processor-additional-policy${terraform.workspace}"
  policy = data.aws_iam_policy_document.this.json
}

resource "aws_iam_role_policy_attachment" "this" {
  role       = module.this.role_name
  policy_arn = aws_iam_policy.this.arn
}
