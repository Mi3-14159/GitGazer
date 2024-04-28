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

resource "aws_dynamodb_table" "notification_rules" {
  count        = var.create_gitgazer_alerting ? 1 : 0
  name         = "${var.name_prefix}-notification-rules-${terraform.workspace}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.this.arn
  }

  point_in_time_recovery {
    enabled = var.enabled_pitr
  }
}
resource "aws_dynamodb_table" "users" {
  name         = "${var.name_prefix}-users-${terraform.workspace}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.this.arn
  }

  point_in_time_recovery {
    enabled = var.enabled_pitr
  }
}
