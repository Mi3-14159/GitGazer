resource "aws_cloudwatch_log_group" "api_websocket" {
  name              = "/aws/lambda/${var.name_prefix}-websocket-handler-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "api_websocket_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "api_websocket" {
  name               = "${var.name_prefix}-websocket-handler-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.api_websocket_assume_role.json
}

resource "aws_iam_role_policy_attachment" "api_websocket_tracing_lambda_insights" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.api_websocket.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "api_websocket_tracing_application_signals" {
  count      = var.enable_lambda_tracing ? 1 : 0
  role       = aws_iam_role.api_websocket.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaApplicationSignalsExecutionRolePolicy"
}

data "aws_iam_policy_document" "api_websocket" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["${aws_cloudwatch_log_group.api_websocket.arn}:*"]
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
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem",
      "dynamodb:GetItem",
      "dynamodb:Scan",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem"
    ]
    resources = [aws_dynamodb_table.connections.arn, "${aws_dynamodb_table.connections.arn}/index/*"]
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
}

resource "aws_iam_role_policy" "api_websocket" {
  name   = "${var.name_prefix}-websocket-handler-role-${terraform.workspace}"
  role   = aws_iam_role.api_websocket.id
  policy = data.aws_iam_policy_document.api_websocket.json
}

data "aws_s3_object" "websocket_lambda_function_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-websocket.zip"
}

resource "aws_lambda_function" "api_websocket" {
  description       = "GitGazers websocket handler"
  function_name     = "${var.name_prefix}-websocket-handler-${terraform.workspace}"
  role              = aws_iam_role.api_websocket.arn
  handler           = "handlers/websocket.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.websocket_lambda_function_archive.key
  s3_object_version = data.aws_s3_object.websocket_lambda_function_archive.version_id
  timeout           = 10
  publish           = true
  memory_size       = 512 # speedup jwt verification with more memory = more CPU
  environment {
    variables = {
      AWS_LAMBDA_EXEC_WRAPPER                         = var.enable_lambda_tracing ? "/opt/otel-instrument" : null
      OTEL_NODE_DISABLED_INSTRUMENTATIONS             = "none"
      ENVIRONMENT                                     = terraform.workspace
      POWERTOOLS_LOG_LEVEL                            = local.lambda_application_log_level
      POWERTOOLS_LOGGER_LOG_EVENT                     = local.lambda_enable_event_logging
      TABLE_NAME                                      = aws_dynamodb_table.connections.name
      COGNITO_USER_POOL_ID                            = aws_cognito_user_pool.this.id
      COGNITO_CLIENT_ID                               = aws_cognito_user_pool_client.this.id
      DYNAMO_DB_TABLE_CONNECTIONS_CONNECTION_ID_INDEX = local.dynamodb_table_connections_connection_id_index
      DYNAMO_DB_CONNECTIONS_TABLE_ARN                 = aws_dynamodb_table.connections.arn
    }
  }
  layers = local.lambda_layers
  logging_config {
    log_group             = aws_cloudwatch_log_group.api_websocket.name
    log_format            = "JSON"
    application_log_level = local.lambda_application_log_level
    system_log_level      = "INFO"
  }
  tracing_config {
    mode = var.enable_lambda_tracing ? "Active" : "PassThrough"
  }
}

resource "aws_lambda_alias" "api_websocket_live" {
  name             = "live"
  description      = "live version"
  function_name    = aws_lambda_function.api_websocket.arn
  function_version = aws_lambda_function.api_websocket.version
}

resource "aws_lambda_permission" "api_websocket_apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_alias.api_websocket_live.function_name
  qualifier     = aws_lambda_alias.api_websocket_live.name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*"
}
