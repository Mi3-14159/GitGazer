resource "aws_dynamodb_table" "jobs" {
  name         = "${var.name_prefix}-jobs-${terraform.workspace}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "runId"
  range_key    = "workflowName"
  attribute {
    name = "runId"
    type = "S"
  }

  attribute {
    name = "workflowName"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.this.arn
  }

  point_in_time_recovery {
    enabled = var.enabled_pitr
  }

  ttl {
    attribute_name = "expireAt"
    enabled        = true
  }
}
