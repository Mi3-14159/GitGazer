###############################################################################
# Serverless GitHub backfill
#
# A single `backfill-worker` Lambda with two entry modes:
#   - direct invoke (operator `aws lambda invoke`) seeds a `discover` task
#   - SQS consumption processes tasks and self-enqueues fan-out
#
# Standard queue + DLQ (ordering is not required; ingestion freshness guards
# make duplicate/out-of-order delivery safe). GitHub egress goes through the
# shared HTTP proxy Lambda. No WebSocket/alerting permissions — backfill skips
# those side effects.
###############################################################################

locals {
  backfill_lambda_timeout_seconds = 60
  # PAT secrets follow `<prefix>/<integrationId>`; namespaced per workspace to
  # avoid collisions between environments. IAM is scoped to `<prefix>/*`.
  backfill_secret_prefix = "${var.name_prefix}/backfill/${terraform.workspace}"
}

resource "aws_sqs_queue" "backfill_tasks_dlq" {
  name                      = "${var.name_prefix}-backfill-tasks-dlq-${terraform.workspace}"
  message_retention_seconds = 60 * 60 * 24 * 14 # 14 days
  kms_master_key_id         = aws_kms_key.this.id
}

resource "aws_sqs_queue" "backfill_tasks" {
  name                       = "${var.name_prefix}-backfill-tasks-${terraform.workspace}"
  visibility_timeout_seconds = local.backfill_lambda_timeout_seconds * 6
  message_retention_seconds  = 60 * 60 * 24 * 4 # 4 days
  receive_wait_time_seconds  = 5                # long polling
  kms_master_key_id          = aws_kms_key.this.id
  max_message_size           = 256 * 1024

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.backfill_tasks_dlq.arn
    # Rate-limited tasks are deferred to the limit reset (the worker extends
    # their visibility timeout), so a task may legitimately be redelivered
    # several times across reset windows before succeeding. Keep this high
    # enough to survive that without prematurely landing in the DLQ.
    maxReceiveCount = 10
  })
}

resource "aws_cloudwatch_log_group" "backfill_worker" {
  name              = "/aws/lambda/${var.name_prefix}-backfill-worker-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "backfill_worker_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "backfill_worker" {
  name               = "${var.name_prefix}-backfill-worker-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.backfill_worker_assume_role.json
}

resource "aws_iam_role_policy_attachment" "backfill_worker_tracing_lambda_insights" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.backfill_worker.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "backfill_worker_tracing_application_signals" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.backfill_worker.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaApplicationSignalsExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "backfill_worker_vpc_access" {
  role       = aws_iam_role.backfill_worker.id
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "backfill_worker" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      "${aws_cloudwatch_log_group.backfill_worker.arn}:*",
    ]
  }

  dynamic "statement" {
    for_each = var.enable_lambda_tracing ? [1] : []
    content {
      effect = "Allow"
      actions = [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
      ]
      resources = ["*"]
    }
  }

  # Consume tasks and self-enqueue fan-out on the backfill queue.
  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:SendMessage",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [
      aws_sqs_queue.backfill_tasks.arn,
    ]
  }

  # Read DB config (lambda_config) and per-integration PATs (prefix-scoped).
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.lambda_config.arn,
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.backfill_secret_prefix}/*",
    ]
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
    effect  = "Allow"
    actions = ["rds-db:connect"]
    resources = [
      "arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:${local.db_resource_id}/*"
    ]
  }
}

resource "aws_iam_role_policy" "backfill_worker" {
  name   = "${var.name_prefix}-backfill-worker-role-${terraform.workspace}"
  role   = aws_iam_role.backfill_worker.id
  policy = data.aws_iam_policy_document.backfill_worker.json
}

data "aws_s3_object" "backfill_worker_lambda_function_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-backfill-worker.zip"
}

resource "aws_lambda_function" "backfill_worker" {
  description       = "Serverless GitHub historical backfill worker (SQS-driven, dual entry)"
  function_name     = "${var.name_prefix}-backfill-worker-${terraform.workspace}"
  role              = aws_iam_role.backfill_worker.arn
  handler           = "index.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.backfill_worker_lambda_function_archive.key
  s3_object_version = data.aws_s3_object.backfill_worker_lambda_function_archive.version_id
  timeout           = local.backfill_lambda_timeout_seconds
  publish           = true
  memory_size       = 256

  environment {
    variables = {
      AWS_LAMBDA_EXEC_WRAPPER             = var.enable_lambda_tracing ? "/opt/otel-instrument" : null
      OTEL_NODE_DISABLED_INSTRUMENTATIONS = "none"
      ENVIRONMENT                         = terraform.workspace
      POWERTOOLS_LOG_LEVEL                = local.lambda_application_log_level
      POWERTOOLS_LOGGER_LOG_EVENT         = local.lambda_enable_event_logging
      RDS_DATABASE                        = "postgres"
      RDS_DB_USER                         = module.db.cluster_master_username
      RDS_HOST                            = local.database_endpoint
      CONFIG_SECRET_ARN                   = aws_secretsmanager_secret.lambda_config.arn
      BACKFILL_QUEUE_URL                  = aws_sqs_queue.backfill_tasks.url
      BACKFILL_SECRET_PREFIX              = local.backfill_secret_prefix
      NODE_OPTIONS                        = "--enable-source-maps"
    }
  }

  layers = local.lambda_layers

  logging_config {
    log_group             = aws_cloudwatch_log_group.backfill_worker.name
    log_format            = "JSON"
    application_log_level = local.lambda_application_log_level
    system_log_level      = "INFO"
  }

  tracing_config {
    mode = var.enable_lambda_tracing ? "Active" : "PassThrough"
  }

  vpc_config {
    subnet_ids                  = local.private_subnets
    security_group_ids          = [aws_security_group.lambda.id]
    ipv6_allowed_for_dual_stack = true
  }
}

resource "aws_lambda_function_recursion_config" "backfill_worker" {
  function_name  = aws_lambda_function.backfill_worker.function_name
  recursive_loop = "Allow"
}

resource "aws_lambda_event_source_mapping" "backfill_sqs" {
  event_source_arn        = aws_sqs_queue.backfill_tasks.arn
  function_name           = aws_lambda_function.backfill_worker.arn
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = true

  scaling_config {
    maximum_concurrency = var.backfill_max_concurrency
  }
}

# DLQ depth is the "something failed" signal for a backfill run.
resource "aws_cloudwatch_metric_alarm" "backfill_dlq" {
  count = var.enable_cloudwatch_alarm_notifications ? 1 : 0

  alarm_name          = "${var.name_prefix}-backfill-dlq-not-empty-${terraform.workspace}"
  alarm_description   = "Backfill tasks have exhausted retries and landed in the DLQ"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.backfill_tasks_dlq.name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = local.monitoring_alarm_actions
  insufficient_data_actions = []
}
