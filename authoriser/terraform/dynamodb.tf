resource "aws_dynamodb_table" "tokens" {
  name         = "${local.name_prefix}-tokens"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "type"

  attribute {
    name = "userId"
    type = "N"
  }

  attribute {
    name = "type"
    type = "S"
  }

  ttl {
    attribute_name = "expireAt"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tokens.arn
  }

  point_in_time_recovery {
    enabled = var.enabled_pitr
  }
}
