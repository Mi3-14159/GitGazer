resource "aws_cloudwatch_log_group" "org_sync_scheduler" {
  name              = "/aws/lambda/${var.name_prefix}-org-sync-scheduler-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "org_sync_scheduler_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "org_sync_scheduler" {
  name               = "${var.name_prefix}-org-sync-sched-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.org_sync_scheduler_assume_role.json
}

resource "aws_iam_role_policy_attachment" "org_sync_scheduler_vpc_access" {
  role       = aws_iam_role.org_sync_scheduler.id
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "org_sync_scheduler" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      "${aws_cloudwatch_log_group.org_sync_scheduler.arn}:*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "sqs:SendMessage",
      "sqs:GetQueueUrl",
    ]
    resources = [
      aws_sqs_queue.webhook_events.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.lambda_config.arn,
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
      "arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:${local.rds_proxy_resource_id}/*"
    ]
  }
}

resource "aws_iam_role_policy" "org_sync_scheduler" {
  name   = "${var.name_prefix}-org-sync-sched-policy-${terraform.workspace}"
  role   = aws_iam_role.org_sync_scheduler.id
  policy = data.aws_iam_policy_document.org_sync_scheduler.json
}

data "aws_s3_object" "org_sync_scheduler_lambda_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-org-sync-scheduler.zip"
}

resource "aws_lambda_function" "org_sync_scheduler" {
  description       = "Dispatches periodic org member sync tasks to SQS"
  function_name     = "${var.name_prefix}-org-sync-scheduler-${terraform.workspace}"
  role              = aws_iam_role.org_sync_scheduler.arn
  handler           = "index.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.org_sync_scheduler_lambda_archive.key
  s3_object_version = data.aws_s3_object.org_sync_scheduler_lambda_archive.version_id
  timeout           = 60 * 10
  publish           = true
  memory_size       = 128

  environment {
    variables = {
      ENVIRONMENT                 = terraform.workspace
      POWERTOOLS_LOG_LEVEL        = local.lambda_application_log_level
      POWERTOOLS_LOGGER_LOG_EVENT = local.lambda_enable_event_logging
      RDS_DATABASE                = "postgres"
      RDS_DB_USER                 = module.db.cluster_master_username
      RDS_PROXY_ENDPOINT          = module.rds_proxy.proxy_endpoint
      CONFIG_SECRET_ARN           = aws_secretsmanager_secret.lambda_config.arn
      NODE_OPTIONS                = "--enable-source-maps"
    }
  }

  logging_config {
    log_group             = aws_cloudwatch_log_group.org_sync_scheduler.name
    log_format            = "JSON"
    application_log_level = local.lambda_application_log_level
    system_log_level      = "INFO"
  }

  tracing_config {
    mode = "PassThrough"
  }

  vpc_config {
    subnet_ids                  = local.private_subnets
    security_group_ids          = [aws_security_group.lambda.id]
    ipv6_allowed_for_dual_stack = true
  }
}

resource "aws_cloudwatch_event_rule" "org_sync_schedule" {
  name                = "${var.name_prefix}-org-sync-schedule-${terraform.workspace}"
  description         = "Triggers daily org member sync reconciliation"
  schedule_expression = "rate(1 day)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "org_sync_scheduler" {
  rule      = aws_cloudwatch_event_rule.org_sync_schedule.name
  target_id = "org-sync-scheduler"
  arn       = aws_lambda_function.org_sync_scheduler.arn
}

resource "aws_lambda_permission" "org_sync_scheduler_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.org_sync_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.org_sync_schedule.arn
}
