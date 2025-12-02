resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name_prefix}-jobs-processor-${terraform.workspace}"
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
  name               = "${var.name_prefix}-jobs-processor-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.api_assume_role.json
}

resource "aws_iam_role_policy_attachment" "api_tracing_lambda_insights" {
  count      = var.enable_lambda_api_tracing ? 1 : 0
  role       = aws_iam_role.api.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "api_tracing_application_signals" {
  count      = var.enable_lambda_api_tracing ? 1 : 0
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
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.name_prefix}-jobs-processor-${terraform.workspace}:*"]
  }

  dynamic "statement" {
    for_each = var.enable_lambda_api_tracing ? [1] : []
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
    ]
    resources = compact([
      aws_dynamodb_table.jobs.arn,
      "${aws_dynamodb_table.jobs.arn}/index/*",
      try(aws_dynamodb_table.notification_rules[0].arn, null),
      try("${aws_dynamodb_table.notification_rules[0].arn}/index/*", null),
      aws_dynamodb_table.connections.arn,
      "${aws_dynamodb_table.connections.arn}/index/*",
      aws_dynamodb_table.integrations.arn,
      "${aws_dynamodb_table.integrations.arn}/index/*",
    ])
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${module.ui_bucket.s3_bucket_arn}/*"]
  }

  dynamic "statement" {
    for_each = var.create_gitgazer_alerting ? [1] : []
    content {
      effect = "Allow"
      actions = [
        "cognito-idp:CreateGroup",
        "cognito-idp:DeleteGroup",
        "cognito-idp:UpdateGroup",
        "cognito-idp:AddUserToGroup",
        "cognito-idp:RemoveUserFromGroup",
        "cognito-idp:AdminAddUserToGroup",
      ]
      resources = [aws_cognito_user_pool.this.arn]
    }
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

resource "aws_iam_role_policy" "api" {
  name   = "${var.name_prefix}-jobs-processor-role-${terraform.workspace}"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

data "aws_s3_object" "api_lambda_function_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-jobs-processor.zip"
}

resource "aws_lambda_function" "api" {
  description       = "GitGazers jobs processor"
  function_name     = "${var.name_prefix}-jobs-processor-${terraform.workspace}"
  role              = aws_iam_role.api.arn
  handler           = "02_central/src/index.handler"
  runtime           = "nodejs22.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = "${var.name_prefix}-jobs-processor.zip"
  s3_object_version = data.aws_s3_object.api_lambda_function_archive.version_id
  timeout           = 15
  publish           = true
  memory_size       = 256
  environment {
    variables = {
      AWS_LAMBDA_EXEC_WRAPPER           = var.enable_lambda_api_tracing ? "/opt/otel-instrument" : null
      ENVIRONMENT                       = terraform.workspace
      PINO_LOG_LEVEL                    = "info"
      EXPIRE_IN_SEC                     = var.expire_in_sec
      DYNAMO_DB_NOTIFICATIONS_TABLE_ARN = try(aws_dynamodb_table.notification_rules[0].name, null)
      DYNAMO_DB_JOBS_TABLE_ARN          = aws_dynamodb_table.jobs.name
      UI_BUCKET_NAME                    = module.ui_bucket.s3_bucket_id
      KMS_KEY_ID                        = aws_kms_key.this.id
      COGNITO_USER_POOL_ID              = aws_cognito_user_pool.this.id
      DYNAMO_DB_CONNECTIONS_TABLE_ARN   = aws_dynamodb_table.connections.name
      WEBSOCKET_API_DOMAIN_NAME         = replace(aws_apigatewayv2_api.websocket.api_endpoint, "wss://", "")
      WEBSOCKET_API_STAGE               = aws_apigatewayv2_stage.websocket_ws.name
      DYNAMO_DB_INTEGRATIONS_TABLE_ARN  = aws_dynamodb_table.integrations.name
    }
  }
  layers = flatten([
    "arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension:18",
    var.enable_lambda_api_tracing ? [
      "arn:aws:lambda:eu-central-1:580247275435:layer:LambdaInsightsExtension:60",
      "arn:aws:lambda:eu-central-1:615299751070:layer:AWSOpenTelemetryDistroJs:9"
  ] : []])
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
