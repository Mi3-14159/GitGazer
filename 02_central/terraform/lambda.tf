module "this" {
  source  = "moritzzimmer/lambda/aws"
  version = "~> 7.5"

  description      = "GitGazers jobs processor"
  filename         = local.artifact
  function_name    = "${var.name_prefix}-jobs-processor-${terraform.workspace}"
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 15
  publish          = true
  environment = {
    variables = {
      ENVIRONMENT                                 = terraform.workspace
      GRAPHQL_URI                                 = local.aws_appsync_graphql_uris["GRAPHQL"]
      EXPIRE_IN_SEC                               = var.expire_in_sec
      SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX = local.ssm_parameter_gh_webhook_secret_name_prefix
    }
  }
  kms_key_arn                       = aws_kms_key.this.arn
  cloudwatch_logs_kms_key_id        = aws_kms_key.this.arn
  cloudwatch_logs_retention_in_days = 30
  layers                            = ["arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11"]
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "live version"
  function_name    = module.this.arn
  function_version = module.this.version
}

data "aws_iam_policy_document" "this" {
  statement {
    effect = "Allow"
    actions = [
      "appsync:GraphQL",
    ]
    resources = ["${aws_appsync_graphql_api.this.arn}/types/Mutation/fields/putJob"]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [
      aws_kms_key.this.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
    ]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_parameter_gh_webhook_secret_name_prefix}*"]
  }
}

resource "aws_iam_policy" "this" {
  name   = "${var.name_prefix}-jobs-processor-additional-policy${terraform.workspace}"
  policy = data.aws_iam_policy_document.this.json
}

resource "aws_iam_role_policy_attachment" "this" {
  role       = module.this.role_name
  policy_arn = aws_iam_policy.this.arn
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_alias.live.function_name
  qualifier     = aws_lambda_alias.live.name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*"
}
