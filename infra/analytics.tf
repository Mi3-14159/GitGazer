resource "aws_s3tables_table_bucket" "analytics" {
  name = "${var.name_prefix}-analytics-${terraform.workspace}"
  encryption_configuration = {
    sse_algorithm = "aws:kms"
    kms_key_arn   = aws_kms_key.this.arn
  }
  force_destroy = true
}

resource "aws_iam_policy" "api_runtime" {
  name   = "${var.name_prefix}-api-runtime-policy-${terraform.workspace}"
  policy = data.aws_iam_policy_document.api_runtime_policy.json
}
