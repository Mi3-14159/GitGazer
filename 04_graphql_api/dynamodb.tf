resource "aws_dynamodb_table" "jobs" {
  name         = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "workflowName"
  range_key    = "repository"

  attribute {
    name = "workflowName"
    type = "S"
  }

  attribute {
    name = "repository"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn
  }

  point_in_time_recovery {
    enabled = var.enabled_pitr
  }
}
