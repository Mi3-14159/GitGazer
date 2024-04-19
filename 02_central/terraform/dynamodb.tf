resource "aws_dynamodb_table" "jobs" {
  name             = "${var.name_prefix}-jobs-${terraform.workspace}"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "run_id"
  range_key        = "workflow_name"
  stream_enabled   = var.create_gitgazer_alerting
  stream_view_type = "NEW_IMAGE"
  attribute {
    name = "run_id"
    type = "N"
  }

  attribute {
    name = "workflow_name"
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
    attribute_name = "expire_at"
    enabled        = true
  }
}
