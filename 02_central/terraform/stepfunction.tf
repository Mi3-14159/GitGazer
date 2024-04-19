module "alerting_stepfunction" {
  source  = "terraform-aws-modules/step-functions/aws"
  version = "~> 4.2"

  name                                   = "${var.name_prefix}-alerting-${terraform.workspace}"
  definition                             = file("${path.module}/stepfunction.json")
  type                                   = "STANDARD"
  cloudwatch_log_group_kms_key_id        = aws_kms_key.this.arn
  cloudwatch_log_group_retention_in_days = 30
  logging_configuration = {
    level                  = "ALL"
    include_execution_data = true
  }
}
