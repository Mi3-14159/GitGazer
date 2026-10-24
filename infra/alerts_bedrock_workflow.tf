# The worker's subnets have IPv6-only egress and Bedrock Runtime has no IPv6 endpoint, so the worker
# calls this Express workflow over the dual-stack Step Functions endpoint and the workflow calls Bedrock.

locals {
  alert_summary_state_machine_name = "${var.name_prefix}-alert-summary-${terraform.workspace}"
  # The Step Functions Bedrock integration is not documented to accept inference profile IDs, only full ARNs.
  alerts_bedrock_inference_profile_arn = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/${var.alerts_bedrock_inference_profile_id}"
  alerts_bedrock_foundation_model_arn  = "arn:aws:bedrock:eu-*::foundation-model/${trimprefix(var.alerts_bedrock_inference_profile_id, "eu.")}"
}

resource "aws_cloudwatch_log_group" "alert_summary" {
  name              = "/aws/vendedlogs/states/${var.name_prefix}-alert-summary-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "alert_summary_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    # Built from the name rather than the resource's ARN to avoid a dependency cycle.
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:states:${var.aws_region}:${data.aws_caller_identity.current.account_id}:stateMachine:${local.alert_summary_state_machine_name}"]
    }
  }
}

resource "aws_iam_role" "alert_summary" {
  name               = "${var.name_prefix}-alert-summary-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.alert_summary_assume_role.json
}

data "aws_iam_policy_document" "alert_summary" {
  statement {
    effect  = "Allow"
    actions = ["bedrock:InvokeModel"]
    resources = [
      local.alerts_bedrock_inference_profile_arn,
      local.alerts_bedrock_foundation_model_arn,
    ]
  }

  # Vended log delivery APIs do not support resource-level permissions.
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "alert_summary" {
  name   = "${var.name_prefix}-alert-summary-role-${terraform.workspace}"
  role   = aws_iam_role.alert_summary.id
  policy = data.aws_iam_policy_document.alert_summary.json
}

resource "aws_sfn_state_machine" "alert_summary" {
  name     = local.alert_summary_state_machine_name
  type     = "EXPRESS"
  role_arn = aws_iam_role.alert_summary.arn

  definition = jsonencode({
    Comment       = "Summarizes a failed job log with Bedrock for the worker"
    QueryLanguage = "JSONata"
    StartAt       = "InvokeModel"
    States = {
      InvokeModel = {
        Type           = "Task"
        Resource       = "arn:aws:states:::bedrock:invokeModel"
        TimeoutSeconds = 10
        Arguments = {
          ModelId = local.alerts_bedrock_inference_profile_arn
          Body = {
            anthropic_version = "bedrock-2023-05-31"
            max_tokens        = "{% $states.input.maxTokens %}"
            system            = "{% $states.input.system %}"
            messages = [
              {
                role    = "user"
                content = [{ type = "text", text = "{% $states.input.prompt %}" }]
              },
            ]
          }
        }
        Output = {
          text = "{% $exists($states.result.Body.content[type = 'text'][0].text) ? $states.result.Body.content[type = 'text'][0].text : '' %}"
        }
        End = true
      }
    }
  })

  logging_configuration {
    level                  = "ERROR"
    include_execution_data = false
    log_destination        = "${aws_cloudwatch_log_group.alert_summary.arn}:*"
  }

  # The role's log delivery permissions must exist before Step Functions validates the log destination.
  depends_on = [aws_iam_role_policy.alert_summary]
}
