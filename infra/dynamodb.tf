resource "aws_dynamodb_table" "workflows" {
  name                        = "${var.name_prefix}-workflows-${terraform.workspace}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "integrationId"
  range_key                   = "id"
  stream_enabled              = true
  stream_view_type            = "NEW_IMAGE"
  deletion_protection_enabled = true

  attribute {
    name = "integrationId"
    type = "S"
  }

  attribute {
    name = "id"
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
    name            = "newest_integration_index"
    hash_key        = "integrationId"
    range_key       = "created_at"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_resource_policy" "workflows" {
  resource_arn = aws_dynamodb_table.workflows.arn
  policy       = data.aws_iam_policy_document.dynamodb_table_resource_policy.json
}

data "aws_iam_policy_document" "dynamodb_table_resource_policy" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:ExportTableToPointInTime",
      "dynamodb:DescribeTable",
      "dynamodb:DescribeExport",
    ]
    resources = [
      "*",
    ]
    principals {
      type        = "Service"
      identifiers = ["glue.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values = [
        data.aws_caller_identity.current.account_id,
      ]
    }
    condition {
      test     = "StringLike"
      variable = "aws:SourceArn"
      values = [
        "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:integration:*"
      ]
    }
  }
}

resource "aws_dynamodb_table" "notification_rules" {
  name                        = "${var.name_prefix}-notification-rules-${terraform.workspace}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  range_key                   = "integrationId"
  deletion_protection_enabled = true

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
    name            = local.notification_rules_table_index_name
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

resource "aws_dynamodb_table" "connections" {
  name                        = "${var.name_prefix}-connections-${terraform.workspace}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "integrationId"
  range_key                   = "connectionId"
  deletion_protection_enabled = true

  attribute {
    name = "integrationId"
    type = "S"
  }

  attribute {
    name = "connectionId"
    type = "S"
  }

  global_secondary_index {
    name            = local.dynamodb_table_connections_connection_id_index
    hash_key        = "connectionId"
    projection_type = "KEYS_ONLY"
  }
}

resource "aws_dynamodb_table" "integrations" {
  name                        = "${var.name_prefix}-integrations-${terraform.workspace}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  deletion_protection_enabled = true

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

resource "aws_dynamodb_table" "user_assignments" {
  name                        = "${var.name_prefix}-user-assignments-${terraform.workspace}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "userId"
  range_key                   = "integrationId"
  deletion_protection_enabled = true

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "integrationId"
    type = "S"
  }

  global_secondary_index {
    name            = "integrationId-index"
    hash_key        = "integrationId"
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

