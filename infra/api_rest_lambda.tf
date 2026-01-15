resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name_prefix}-api-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "api_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "api" {
  name               = "${var.name_prefix}-api-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.api_assume_role.json
}

resource "aws_iam_role_policy_attachment" "api_tracing_lambda_insights" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.api.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "api_tracing_application_signals" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.api.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaApplicationSignalsExecutionRolePolicy"
}

data "aws_iam_policy_document" "api" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.name_prefix}-api-${terraform.workspace}:*"]
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
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:GetItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:Batch*"
    ]
    resources = compact([
      aws_dynamodb_table.workflows.arn,
      "${aws_dynamodb_table.workflows.arn}/index/*",
      try(aws_dynamodb_table.notification_rules.arn, null),
      try("${aws_dynamodb_table.notification_rules.arn}/index/*", null),
      aws_dynamodb_table.connections.arn,
      "${aws_dynamodb_table.connections.arn}/index/*",
      aws_dynamodb_table.integrations.arn,
      "${aws_dynamodb_table.integrations.arn}/index/*",
      aws_dynamodb_table.user_assignments.arn,
      "${aws_dynamodb_table.user_assignments.arn}/index/*",
    ])
  }

  statement {
    effect = "Allow"
    actions = [
      "athena:StartQueryExecution",
      "athena:GetQueryExecution",
      "athena:GetQueryResults",
      "athena:StopQueryExecution",
      "athena:GetWorkGroup",
      "athena:ListQueryExecutions"
    ]
    resources = ["*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${module.ui_bucket.s3_bucket_arn}/*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [
      module.athena_query_results_bucket.s3_bucket_arn,
      "${module.athena_query_results_bucket.s3_bucket_arn}/*",
    ]
  }


  statement {
    effect = "Allow"
    actions = [
      "execute-api:ManageConnections"
    ]
    resources = [
      "${aws_apigatewayv2_api.websocket.execution_arn}/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "lakeformation:GetDataAccess"
    ]
    resources = [
      "*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "glue:GetDatabase",
      "glue:GetDatabases",
      "glue:GetTable",
      "glue:GetTables",
      "glue:GetPartition",
      "glue:GetPartitions",
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:database/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}/*",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}/*",
    ]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${var.name_prefix}-api-role-${terraform.workspace}"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

data "aws_s3_object" "api_lambda_function_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-api.zip"
}

resource "aws_lambda_function" "api" {
  description       = "GitGazers REST API Lambda Function"
  function_name     = "${var.name_prefix}-api-${terraform.workspace}"
  role              = aws_iam_role.api.arn
  handler           = "02_central/src/handlers/api.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.api_lambda_function_archive.key
  s3_object_version = data.aws_s3_object.api_lambda_function_archive.version_id
  timeout           = 15
  publish           = true
  memory_size       = 256
  environment {
    variables = {
      AWS_LAMBDA_EXEC_WRAPPER              = var.enable_lambda_tracing ? "/opt/otel-instrument" : null
      OTEL_NODE_DISABLED_INSTRUMENTATIONS  = "none"
      ENVIRONMENT                          = terraform.workspace
      POWERTOOLS_LOG_LEVEL                 = local.lambda_application_log_level
      POWERTOOLS_LOGGER_LOG_EVENT          = local.lambda_enable_event_logging
      EXPIRE_IN_SEC                        = var.expire_in_sec
      DYNAMO_DB_NOTIFICATIONS_TABLE_ARN    = aws_dynamodb_table.notification_rules.name
      DYNAMO_DB_WORKFLOWS_TABLE_ARN        = aws_dynamodb_table.workflows.name
      UI_BUCKET_NAME                       = module.ui_bucket.s3_bucket_id
      KMS_KEY_ID                           = aws_kms_key.this.id
      COGNITO_USER_POOL_ID                 = aws_cognito_user_pool.this.id
      DYNAMO_DB_CONNECTIONS_TABLE_ARN      = aws_dynamodb_table.connections.name
      WEBSOCKET_API_DOMAIN_NAME            = replace(aws_apigatewayv2_api.websocket.api_endpoint, "wss://", "")
      WEBSOCKET_API_STAGE                  = aws_apigatewayv2_stage.websocket_ws.name
      DYNAMO_DB_INTEGRATIONS_TABLE_ARN     = aws_dynamodb_table.integrations.name
      DYNAMO_DB_USER_ASSIGNMENTS_TABLE_ARN = aws_dynamodb_table.user_assignments.name
      ATHENA_DATABASE                      = aws_s3tables_namespace.gitgazer.namespace
      ATHENA_JOBS_TABLE                    = aws_s3tables_table.jobs.name
      ATHENA_CATALOG                       = aws_athena_data_catalog.analytics.name
      ATHENA_QUERY_RESULT_S3_BUCKET        = module.athena_query_results_bucket.s3_bucket_id
      ATHENA_WORKGROUP                     = aws_athena_workgroup.analytics.name
      CORS_ORIGINS                         = jsonencode(local.cors_allowed_origins)
    }
  }
  layers = local.lambda_layers
  logging_config {
    log_group             = aws_cloudwatch_log_group.api.name
    log_format            = "JSON"
    application_log_level = local.lambda_application_log_level
    system_log_level      = "INFO"
  }
  tracing_config {
    mode = var.enable_lambda_tracing ? "Active" : "PassThrough"
  }
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "live version"
  function_name    = aws_lambda_function.api.arn
  function_version = aws_lambda_function.api.version
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_alias.live.function_name
  qualifier     = aws_lambda_alias.live.name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*"
}
