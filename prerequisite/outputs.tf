output "github_organization" {
  value = var.github_organization
}

output "aws_region" {
  value = var.aws_region
}

output "name_prefix" {
  value = local.name_prefix
}

output "aws_kms_key_id" {
  value = aws_kms_key.this.id
}
