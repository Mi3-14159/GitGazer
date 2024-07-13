resource "aws_dynamodb_table" "jobs" {
  name             = "${var.name_prefix}-jobs-${terraform.workspace}"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "job_id"
  stream_enabled   = var.create_gitgazer_alerting
  stream_view_type = "NEW_IMAGE"
  attribute {
    name = "job_id"
    type = "N"
  }

  attribute {
    name = "integrationId"
    type = "S"
  }

  attribute {
    name = "created_at"
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

  global_secondary_index {
    name            = "integrationId-index"
    hash_key        = "integrationId"
    range_key       = "job_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "newest_integration_index"
    hash_key        = "integrationId"
    range_key       = "created_at"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "notification_rules" {
  count        = var.create_gitgazer_alerting ? 1 : 0
  name         = "${var.name_prefix}-notification-rules-${terraform.workspace}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  range_key    = "integrationId"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "integrationId"
    type = "S"
  }

  global_secondary_index {
    hash_key        = "integrationId"
    name            = "integrationId-index"
    projection_type = "ALL"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.this.arn
  }

  point_in_time_recovery {
    enabled = var.enabled_pitr
  }
}
