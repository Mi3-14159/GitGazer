resource "aws_iam_role" "alerting" {
  count              = var.create_gitgazer_alerting ? 1 : 0
  name               = "${var.name_prefix}-alerting-pipe-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.alerting_assume_role_policy[0].json
  inline_policy {
    name   = "alerting"
    policy = data.aws_iam_policy_document.alerting_policy[0].json
  }
}

data "aws_iam_policy_document" "alerting_assume_role_policy" {
  count = var.create_gitgazer_alerting ? 1 : 0
  statement {
    actions = [
      "sts:AssumeRole",
    ]
    principals {
      type        = "Service"
      identifiers = ["pipes.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      values   = [data.aws_caller_identity.current.account_id]
      variable = "aws:SourceAccount"
    }
  }
}

data "aws_iam_policy_document" "alerting_policy" {
  count = var.create_gitgazer_alerting ? 1 : 0
  statement {
    actions = [
      "dynamodb:DescribeStream",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
      "dynamodb:ListStreams",
    ]
    resources = [aws_dynamodb_table.jobs.stream_arn]
  }
  statement {
    actions = [
      "states:StartExecution",
    ]
    resources = [module.alerting_stepfunction.state_machine_arn]
  }
}

resource "aws_pipes_pipe" "alerting" {
  count    = var.create_gitgazer_alerting ? 1 : 0
  name     = "${var.name_prefix}-alerting-pipe-${terraform.workspace}"
  role_arn = aws_iam_role.alerting[0].arn
  source   = aws_dynamodb_table.jobs.stream_arn
  target   = module.alerting_stepfunction.state_machine_arn
  source_parameters {
    dynamodb_stream_parameters {
      batch_size        = 1
      starting_position = "LATEST"
    }
  }
}
