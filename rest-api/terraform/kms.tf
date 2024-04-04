resource "aws_kms_key" "tokens" {
  description             = "KMS key to encrypt the tokens in the ${local.name_prefix} DynamoDB table"
  deletion_window_in_days = 10
  enable_key_rotation     = true
}

resource "aws_kms_alias" "tokens" {
  name          = "alias/${local.name_prefix}-tokens"
  target_key_id = aws_kms_key.tokens.key_id
}
