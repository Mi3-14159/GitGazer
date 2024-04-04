module "jobs" {
  source  = "terraform-aws-modules/sqs/aws"
  version = "~> 4.1"

  name                                  = local.name_prefix
  kms_master_key_id                     = data.terraform_remote_state.prerequisite.outputs.aws_kms_key.id
  kms_data_key_reuse_period_seconds     = 3600
  create_dlq                            = true
  dlq_kms_master_key_id                 = data.terraform_remote_state.prerequisite.outputs.aws_kms_key.id
  dlq_kms_data_key_reuse_period_seconds = 3600
  dlq_message_retention_seconds         = 1209600
}
