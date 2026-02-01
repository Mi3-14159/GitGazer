resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${var.name_prefix}-authorizer-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "authorizer_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "authorizer" {
  name               = "${var.name_prefix}-authorizer-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.authorizer_assume_role.json
}

data "aws_iam_policy_document" "authorizer" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.name_prefix}-authorizer-${terraform.workspace}:*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
    ]
    resources = [
      aws_kms_key.this.arn,
    ]
  }
}

resource "aws_iam_role_policy" "authorizer" {
  name   = "${var.name_prefix}-authorizer-policy-${terraform.workspace}"
  role   = aws_iam_role.authorizer.id
  policy = data.aws_iam_policy_document.authorizer.json
}

data "aws_s3_object" "authorizer_lambda_function_archive" {
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-authorizer.zip"
}

resource "aws_lambda_function" "authorizer" {
  function_name = "${var.name_prefix}-authorizer-${terraform.workspace}"
  description   = "Lambda authorizer that validates access tokens from HttpOnly cookies"
  role          = aws_iam_role.authorizer.arn
  handler       = "handlers/authorizer.handler"
  runtime       = "nodejs24.x"
  timeout       = 10
  memory_size   = 256

  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.authorizer_lambda_function_archive.key
  s3_object_version = data.aws_s3_object.authorizer_lambda_function_archive.version_id

  environment {
    variables = {
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.this.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.this.id
    }
  }

  layers = local.lambda_layers
  logging_config {
    log_group             = aws_cloudwatch_log_group.authorizer.name
    log_format            = "JSON"
    application_log_level = local.lambda_application_log_level
    system_log_level      = "INFO"
  }
  tracing_config {
    mode = var.enable_lambda_tracing ? "Active" : "PassThrough"
  }
}

resource "aws_lambda_permission" "authorizer_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/authorizers/*"
}

resource "aws_apigatewayv2_authorizer" "authorizer" {
  api_id                            = aws_apigatewayv2_api.this.id
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.authorizer.invoke_arn
  identity_sources                  = ["$request.header.Cookie"]
  name                              = "${var.name_prefix}-lambda-authorizer-${terraform.workspace}"
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
}
