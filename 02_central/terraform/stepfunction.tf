module "alerting_stepfunction" {
  count   = var.create_gitgazer_alerting ? 1 : 0
  source  = "terraform-aws-modules/step-functions/aws"
  version = "~> 5.0"

  name = "${var.name_prefix}-alerting-${terraform.workspace}"
  definition = templatefile("${path.module}/stepfunction_alerting.json", {
    aws_cloudwatch_event_connection_generic_arn = aws_cloudwatch_event_connection.generic[0].arn
    notification_rules_table_name               = aws_dynamodb_table.notification_rules[0].name
    notification_rules_table_index_name         = local.notification_rules_table_index_name
  })
  type                                   = "STANDARD"
  cloudwatch_log_group_kms_key_id        = aws_kms_key.this.arn
  cloudwatch_log_group_retention_in_days = 30

  logging_configuration = {
    level                  = "ALL"
    include_execution_data = true
  }
  service_integrations = {
    dynamodb = {
      dynamodb = [aws_dynamodb_table.notification_rules[0].arn]
    }
  }
  attach_policy_statements = true
  policy_statements = {
    kms = {
      effect    = "Allow",
      actions   = ["kms:Decrypt"],
      resources = [aws_kms_key.this.arn]
    }
    states = {
      effect    = "Allow",
      actions   = ["states:InvokeHTTPEndpoint"],
      resources = ["*"]
    }
    connections = {
      effect    = "Allow",
      actions   = ["events:RetrieveConnectionCredentials"],
      resources = [aws_cloudwatch_event_connection.generic[0].arn]
    }
    secrets = {
      effect = "Allow",
      actions = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      resources = [aws_cloudwatch_event_connection.generic[0].secret_arn]
    }
    dynamodb = {
      effect  = "Allow",
      actions = ["dynamodb:Query"],
      resources = [
        aws_dynamodb_table.notification_rules[0].arn,
        "${aws_dynamodb_table.notification_rules[0].arn}/index/*"
      ]
    }
  }
}
