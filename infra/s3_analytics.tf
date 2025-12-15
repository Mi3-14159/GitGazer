resource "aws_s3tables_table_bucket" "analytics" {
  name = "${var.name_prefix}-analytics-${terraform.workspace}"
  encryption_configuration = {
    sse_algorithm = "aws:kms"
    kms_key_arn   = aws_kms_key.this.arn
  }
  force_destroy = true
}

resource "aws_s3tables_namespace" "gitgazer" {
  namespace        = var.name_prefix
  table_bucket_arn = aws_s3tables_table_bucket.analytics.arn
}

resource "aws_s3tables_table" "jobs" {
  name             = "jobs"
  namespace        = aws_s3tables_namespace.gitgazer.namespace
  table_bucket_arn = aws_s3tables_table_bucket.analytics.arn
  format           = "ICEBERG"
  encryption_configuration = {
    sse_algorithm = "aws:kms"
    kms_key_arn   = aws_kms_key.this.arn
  }

  metadata {
    iceberg {
      schema {
        field {
          name     = "done_at"
          type     = "timestamptz"
          required = true
        }
        field {
          name     = "integration_id"
          type     = "string"
          required = true
        }
        field {
          name     = "owner"
          type     = "string"
          required = true
        }
        field {
          name     = "repo"
          type     = "string"
          required = true
        }
        field {
          name     = "workflow"
          type     = "string"
          required = true
        }
        field {
          name     = "job"
          type     = "string"
          required = true
        }
        field {
          name     = "status"
          type     = "string"
          required = true
        }
        field {
          name     = "conclusion"
          type     = "string"
          required = true
        }
      }
    }
  }
}

resource "aws_athena_data_catalog" "this" {
  name        = "${var.name_prefix}-analytics-${terraform.workspace}"
  description = "${var.name_prefix} S3 Analytics Data Catalog"
  type        = "GLUE"
  parameters = {
    catalog-id = "s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
  }
}
