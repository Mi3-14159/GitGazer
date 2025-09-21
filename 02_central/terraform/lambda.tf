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
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:PutParameter",
      "ssm:DeleteParameter",
    ]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_parameter_gh_webhook_secret_name_prefix}*"]
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
}

resource "aws_iam_role_policy" "api" {
  name   = "${var.name_prefix}-jobs-processor-role-${terraform.workspace}"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_lambda_function" "api" {
  description      = "GitGazers jobs processor"
  filename         = local.artifact
  function_name    = "${var.name_prefix}-jobs-processor-${terraform.workspace}"
  role             = aws_iam_role.api.arn
  handler          = "02_central/src/index.handler"
  runtime          = "nodejs22.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 15
  publish          = true
  memory_size      = 256
  environment {
    variables = {
      ENVIRONMENT                                 = terraform.workspace
      EXPIRE_IN_SEC                               = var.expire_in_sec
      SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX = local.ssm_parameter_gh_webhook_secret_name_prefix
      DYNAMO_DB_NOTIFICATIONS_TABLE_ARN           = try(aws_dynamodb_table.notification_rules[0].name, null)
      DYNAMO_DB_JOBS_TABLE_ARN                    = aws_dynamodb_table.jobs.name
      UI_BUCKET_NAME                              = module.ui_bucket.s3_bucket_id
      KMS_KEY_ID                                  = aws_kms_key.this.id
      COGNITO_USER_POOL_ID                        = aws_cognito_user_pool.this.id
      PINO_LOG_LEVEL                              = "info"
    }
  }
  layers = ["arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension:18"]
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
