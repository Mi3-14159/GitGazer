resource "aws_cloudwatch_log_group" "analytics" {
  name              = "/aws/lambda/${var.name_prefix}-analytics-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "analytics_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "analytics" {
  name               = "${var.name_prefix}-analytics-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.analytics_assume_role.json
}

data "aws_iam_policy_document" "analytics" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.name_prefix}-analytics-${terraform.workspace}:*"]
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
    ])
  }

  statement {
    effect = "Allow"
    actions = [
      "firehose:PutRecord",
      "firehose:PutRecordBatch"
    ]
    resources = [
      aws_kinesis_firehose_delivery_stream.analytics.arn
    ]
  }
}

resource "aws_iam_role_policy" "analytics" {
  name   = "${var.name_prefix}-analytics-role-${terraform.workspace}"
  role   = aws_iam_role.analytics.id
  policy = data.aws_iam_policy_document.analytics.json
}

resource "aws_iam_role_policy_attachment" "analytics_tracing_lambda_insights" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.analytics.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "analytics_tracing_application_signals" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.analytics.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaApplicationSignalsExecutionRolePolicy"
}

data "aws_s3_object" "analytics_lambda_function_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-analytics.zip"
}

resource "aws_lambda_function" "analytics" {
  description       = "GitGazer analytics processor (DynamoDB stream)"
  function_name     = "${var.name_prefix}-analytics-${terraform.workspace}"
  role              = aws_iam_role.analytics.arn
  handler           = "02_central/src/handlers/analytics.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.analytics_lambda_function_archive.key
  s3_object_version = data.aws_s3_object.analytics_lambda_function_archive.version_id
  timeout           = 30
  publish           = true
  memory_size       = 256
  environment {
    variables = {
      AWS_LAMBDA_EXEC_WRAPPER             = var.enable_lambda_tracing ? "/opt/otel-instrument" : null
      OTEL_NODE_DISABLED_INSTRUMENTATIONS = "none"
      ENVIRONMENT                         = terraform.workspace
      POWERTOOLS_LOG_LEVEL                = local.lambda_application_log_level
      DYNAMO_DB_JOBS_TABLE_ARN            = aws_dynamodb_table.jobs.name
      FIREHOSE_STREAM_NAME                = aws_kinesis_firehose_delivery_stream.analytics.name
    }
  }
  layers = local.lambda_layers
  logging_config {
    log_group             = aws_cloudwatch_log_group.analytics.name
    log_format            = "JSON"
    application_log_level = local.lambda_application_log_level
    system_log_level      = "INFO"
  }
  tracing_config {
    mode = var.enable_lambda_tracing ? "Active" : "PassThrough"
  }
}

resource "aws_lambda_event_source_mapping" "analytics_jobs_stream" {
  event_source_arn               = aws_dynamodb_table.jobs.stream_arn
  function_name                  = aws_lambda_function.analytics.arn
  starting_position              = "TRIM_HORIZON"
  batch_size                     = 500 # 500 ist the max limit of records a PutRecordBatchCommand can handle
  maximum_retry_attempts         = 3
  enabled                        = true
  bisect_batch_on_function_error = true
  function_response_types = [
    "ReportBatchItemFailures",
  ]
  filter_criteria {
    filter {
      pattern = jsonencode({
        "eventName" : ["INSERT", "MODIFY"],
        "dynamodb.NewImage.event_type.S" : ["workflow_job"],
        "dynamodb.NewImage.workflow_event.M.workflow_job.M.status.S" : ["completed"]
      })
    }
  }
  metrics_config {
    metrics = [
      "EventCount",
    ]
  }
}
