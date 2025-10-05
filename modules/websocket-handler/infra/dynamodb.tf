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
