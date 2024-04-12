module "jobs" {
  source                                = "terraform-aws-modules/sqs/aws"
  version                               = "~> 4.1"
  name                                  = "${var.name_prefix}-jobs-${terraform.workspace}"
  kms_master_key_id                     = aws_kms_key.this.arn
  kms_data_key_reuse_period_seconds     = 3600
  create_dlq                            = true
  dlq_kms_master_key_id                 = aws_kms_key.this.arn
  dlq_kms_data_key_reuse_period_seconds = 3600
  dlq_message_retention_seconds         = 1209600
}
