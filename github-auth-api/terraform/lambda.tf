module "this" {
  source  = "moritzzimmer/lambda/aws"
  version = "~> 7.5"

  description      = "GitGazers github auth api"
  filename         = local.artifact
  function_name    = local.name_prefix
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 5
  publish          = true
  environment = {
    variables = {
      ENVIRONMENT           = terraform.workspace
      GH_CLIENT_CONFIG_NAME = aws_ssm_parameter.gh_client_config.name
      TOKENS_TABLE_NAME     = aws_dynamodb_table.tokens.name
    }
  }
  kms_key_arn                       = data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn
  cloudwatch_logs_retention_in_days = 90
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "live version"
  function_name    = module.this.arn
  function_version = module.this.version
}

#tfsec:ignore:aws-iam-no-policy-wildcards
data "aws_iam_policy_document" "this" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:Get*",
      "dynamodb:List*",
      "dynamodb:Describe*",
      "dynamodb:Batch*",
      "dynamodb:Condition*",
      "dynamodb:PartiQL*",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem",
      "dynamodb:PutItem",
    ]
    resources = [aws_dynamodb_table.tokens.arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:ReEncrypt*",
    ]
    resources = [
      data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "ssm:GetParameter*",
    ]
    resources = [
      aws_ssm_parameter.gh_client_config.arn,
    ]
  }
}

resource "aws_iam_policy" "this" {
  name   = "${local.name_prefix}-additional-policy"
  policy = data.aws_iam_policy_document.this.json
}

resource "aws_iam_role_policy_attachment" "this" {
  role       = module.this.role_name
  policy_arn = aws_iam_policy.this.arn
}
