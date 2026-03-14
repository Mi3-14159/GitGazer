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
    resources = distinct([
      aws_kms_key.this.arn,
      module.db.cluster_master_user_secret[0].kms_key_id
    ])
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject"
    ]
    resources = ["${module.ui_bucket.s3_bucket_arn}/*"]
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
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [
      "*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "bedrock:GetPrompt",
      "bedrock:RenderPrompt",
    ]
    resources = [
      awscc_bedrock_prompt.query_generation.arn,
      "${awscc_bedrock_prompt.query_generation.arn}:*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "bedrock:ApplyGuardrail",
      "bedrock:GetGuardrail",
    ]
    resources = [
      aws_bedrock_guardrail.query_generation.guardrail_arn,
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:guardrail-profile/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "rds-data:*",
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      module.db.cluster_arn,
      module.db.cluster_master_user_secret[0].secret_arn,
    ]
  }

  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.lambda_config.arn]
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
  handler           = "index.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.api_lambda_function_archive.key
  s3_object_version = data.aws_s3_object.api_lambda_function_archive.version_id
  timeout           = 15
  publish           = true
  memory_size       = 256
  environment {
    variables = {
      AWS_LAMBDA_EXEC_WRAPPER             = var.enable_lambda_tracing ? "/opt/otel-instrument" : null
      OTEL_NODE_DISABLED_INSTRUMENTATIONS = "none"
      ENVIRONMENT                         = terraform.workspace
      POWERTOOLS_LOG_LEVEL                = local.lambda_application_log_level
      POWERTOOLS_LOGGER_LOG_EVENT         = local.lambda_enable_event_logging
      KMS_KEY_ID                          = aws_kms_key.this.id
      AWS_ACCOUNT_ID                      = data.aws_caller_identity.current.account_id
      QUERY_GENERATOR_BEDROCK_MODEL_ID    = awscc_bedrock_prompt.query_generation.arn
      QUERY_GENERATOR_GUARDRAIL_IDENTIFIER = aws_bedrock_guardrail.query_generation.guardrail_id
      QUERY_GENERATOR_GUARDRAIL_VERSION   = "DRAFT"
      RDS_DATABASE                        = "postgres"
      RDS_SECRET_ARN                      = module.db.cluster_master_user_secret[0].secret_arn
      RDS_RESOURCE_ARN                    = module.db.cluster_arn
      CONFIG_SECRET_ARN                   = aws_secretsmanager_secret.lambda_config.arn
      NODE_OPTIONS                        = "--enable-source-maps"
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
