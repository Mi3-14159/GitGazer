resource "aws_kms_key" "this" {
  description             = "KMS key to encrypt all ressources in the ${local.name_prefix} project"
  deletion_window_in_days = 10
  enable_key_rotation     = true
}

resource "aws_kms_alias" "this" {
  name          = "alias/${local.name_prefix}"
  target_key_id = aws_kms_key.this.key_id
}