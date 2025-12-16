resource "aws_cloudwatch_log_group" "alerting" {
  name              = "/aws/lambda/${var.name_prefix}-alerting-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "alerting_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "alerting" {
  name               = "${var.name_prefix}-alerting-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.alerting_assume_role.json
}

data "aws_iam_policy_document" "alerting" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.name_prefix}-alerting-${terraform.workspace}:*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "kms:Encrypt",
    ]
    resources = [
      aws_kms_key.this.arn,
    ]
  }

  # Read access to tables used by alerting
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:DescribeStream",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
      "dynamodb:ListStreams",
    ]
    resources = compact([
      aws_dynamodb_table.jobs.arn,
      "${aws_dynamodb_table.jobs.arn}/stream/*",
      "${aws_dynamodb_table.jobs.arn}/index/*",
      aws_dynamodb_table.notification_rules.arn,
      "${aws_dynamodb_table.notification_rules.arn}/index/*",
    ])
  }
}

resource "aws_iam_role_policy" "alerting" {
  name   = "${var.name_prefix}-alerting-role-${terraform.workspace}"
  role   = aws_iam_role.alerting.id
  policy = data.aws_iam_policy_document.alerting.json
}

data "aws_s3_object" "alerting_lambda_function_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-alerting.zip"
}

resource "aws_lambda_function" "alerting" {
  description       = "GitGazer alerting processor (DynamoDB stream)"
  function_name     = "${var.name_prefix}-alerting-${terraform.workspace}"
  role              = aws_iam_role.alerting.arn
  handler           = "02_central/src/handlers/alerting.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.alerting_lambda_function_archive.key
  s3_object_version = data.aws_s3_object.alerting_lambda_function_archive.version_id
  timeout           = 30
  publish           = true
  memory_size       = 256
  environment {
    variables = {
      ENVIRONMENT                       = terraform.workspace
      PINO_LOG_LEVEL                    = "info"
      DYNAMO_DB_NOTIFICATIONS_TABLE_ARN = aws_dynamodb_table.notification_rules.name
      DYNAMO_DB_JOBS_TABLE_ARN          = aws_dynamodb_table.jobs.name
      DYNAMO_DB_CONNECTIONS_TABLE_ARN   = aws_dynamodb_table.connections.name
      DYNAMO_DB_INTEGRATIONS_TABLE_ARN  = aws_dynamodb_table.integrations.name
    }
  }
}

resource "aws_lambda_event_source_mapping" "alerting_jobs_stream" {
  event_source_arn               = aws_dynamodb_table.jobs.stream_arn
  function_name                  = aws_lambda_function.alerting.arn
  starting_position              = "LATEST"
  batch_size                     = 10
  maximum_retry_attempts         = 3
  enabled                        = true
  bisect_batch_on_function_error = true
  function_response_types = [
    "ReportBatchItemFailures",
  ]
  filter_criteria {
    filter {
      pattern = jsonencode({
        "eventName" : ["INSERT", "MODIFY"]
      })
    }
  }
}
