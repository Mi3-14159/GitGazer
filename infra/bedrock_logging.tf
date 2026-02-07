resource "aws_cloudwatch_log_group" "bedrock_invocation_logs" {
  count             = var.enable_bedrock_invocation_logging ? 1 : 0
  name              = "/aws/bedrock/invocation-logs-${terraform.workspace}"
  retention_in_days = 30
}

resource "aws_iam_role" "bedrock_invocation_logs" {
  count              = var.enable_bedrock_invocation_logging ? 1 : 0
  name               = "${var.name_prefix}-bedrock-invocation-logging-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.bedrock_invocation_logs_trust_relationship.json
}

resource "aws_iam_role_policy" "bedrock_invocation_logs_policy" {
  count  = var.enable_bedrock_invocation_logging ? 1 : 0
  name   = "${var.name_prefix}-bedrock-invocation-logging-policy-${terraform.workspace}"
  role   = aws_iam_role.bedrock_invocation_logs[0].id
  policy = data.aws_iam_policy_document.bedrock_invocation_logs_policy.json
}

data "aws_iam_policy_document" "bedrock_invocation_logs_policy" {
  statement {
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]

    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:${aws_cloudwatch_log_group.bedrock_invocation_logs[0].name}:log-stream:*"]
  }
}

data "aws_iam_policy_document" "bedrock_invocation_logs_trust_relationship" {
  statement {
    principals {
      identifiers = ["bedrock.amazonaws.com"]
      type        = "Service"
    }
    actions = ["sts:AssumeRole"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"]
    }
  }
}

resource "aws_bedrock_model_invocation_logging_configuration" "this" {
  count = var.enable_bedrock_invocation_logging ? 1 : 0
  logging_config {
    embedding_data_delivery_enabled = true
    image_data_delivery_enabled     = true
    text_data_delivery_enabled      = true
    cloudwatch_config {
      log_group_name = aws_cloudwatch_log_group.bedrock_invocation_logs[0].name
      role_arn       = aws_iam_role.bedrock_invocation_logs[0].arn
    }
  }
}
