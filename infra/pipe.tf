resource "aws_iam_role" "alerting" {
  name               = "${var.name_prefix}-alerting-pipe-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.alerting_assume_role_policy.json
}

resource "aws_iam_role_policy" "alerting" {
  name   = "${var.name_prefix}-alerting-pipe-${terraform.workspace}"
  role   = aws_iam_role.alerting.id
  policy = data.aws_iam_policy_document.alerting_policy.json
}

data "aws_iam_policy_document" "alerting_assume_role_policy" {
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
      "states:StartSyncExecution",
    ]
    resources = [module.alerting_stepfunction.state_machine_arn]
  }
  statement {
    actions = [
      "kms:Decrypt",
    ]
    resources = [aws_kms_key.this.arn]
  }
}

resource "aws_pipes_pipe" "alerting" {
  name     = "${var.name_prefix}-alerting-pipe-${terraform.workspace}"
  role_arn = aws_iam_role.alerting.arn
  source   = aws_dynamodb_table.jobs.stream_arn
  target   = module.alerting_stepfunction.state_machine_arn

  log_configuration {
    level                  = "OFF"
    include_execution_data = []
  }

  source_parameters {
    dynamodb_stream_parameters {
      batch_size                    = 1
      starting_position             = "LATEST"
      maximum_record_age_in_seconds = -1
      maximum_retry_attempts        = -1
    }
    filter_criteria {
      filter {
        pattern = jsonencode({
          "$or" : [
            {
              "dynamodb.NewImage.workflow_event.M.workflow_job.M.conclusion.S" : [
                {
                  "equals-ignore-case" : "failure"
                }
              ]
            },
            {
              "dynamodb.NewImage.workflow_event.M.workflow_run.M.conclusion.S" : [
                {
                  "equals-ignore-case" : "failure"
                }
              ]
            }
          ]
        })
      }
    }
  }
  target_parameters {
    step_function_state_machine_parameters {
      invocation_type = "FIRE_AND_FORGET"
    }
  }
}
