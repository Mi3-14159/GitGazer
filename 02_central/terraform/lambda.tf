module "this" {
  source  = "moritzzimmer/lambda/aws"
  version = "~> 8.0"

  description      = "GitGazers jobs processor"
  filename         = local.artifact
  function_name    = "${var.name_prefix}-jobs-processor-${terraform.workspace}"
  handler          = "02_central/src/index.handler"
  runtime          = "nodejs22.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 15
  publish          = true
  environment = {
    variables = {
      ENVIRONMENT                                 = terraform.workspace
      GRAPHQL_URI                                 = local.aws_appsync_graphql_uris["GRAPHQL"]
      EXPIRE_IN_SEC                               = var.expire_in_sec
      SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX = local.ssm_parameter_gh_webhook_secret_name_prefix
      DYNAMO_DB_NOTIFICATIONS_TABLE_ARN           = try(aws_dynamodb_table.notification_rules[0].name, null)
      DYNAMO_DB_JOBS_TABLE_ARN                    = aws_dynamodb_table.jobs.name
      UI_BUCKET_NAME                              = module.ui_bucket.s3_bucket_id
      KMS_KEY_ID                                  = aws_kms_key.this.id
      COGNITO_USER_POOL_ID                        = element([for each in var.aws_appsync_graphql_api_additional_authentication_providers : each.user_pool_config.user_pool_id if each.authentication_type == "AMAZON_COGNITO_USER_POOLS"], 0)
    }
  }
  kms_key_arn                       = aws_kms_key.this.arn
  cloudwatch_logs_kms_key_id        = aws_kms_key.this.arn
  cloudwatch_logs_retention_in_days = 30
  layers                            = ["arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension:18"]
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
      resources = [for each in var.aws_appsync_graphql_api_additional_authentication_providers : "arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${each.user_pool_config.user_pool_id}" if each.authentication_type == "AMAZON_COGNITO_USER_POOLS"]
    }
  }
}

resource "aws_iam_policy" "this" {
  name   = "${var.name_prefix}-jobs-processor-additional-policy-${terraform.workspace}"
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
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*"
}
