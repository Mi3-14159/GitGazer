resource "aws_athena_data_catalog" "analytics" {
  name        = "${var.name_prefix}-analytics-${terraform.workspace}"
  description = "GitGazer S3Tables Analytics Catalog"
  type        = "GLUE"
  parameters = {
    catalog-id = "s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
  }
}

module "athena_query_results_bucket" {
  source                   = "terraform-aws-modules/s3-bucket/aws"
  version                  = "~> 5.9"
  force_destroy            = true
  bucket                   = "${data.aws_caller_identity.current.account_id}-${var.name_prefix}-athena-query-results-${terraform.workspace}"
  attach_policy            = false
  control_object_ownership = true
  object_ownership         = "BucketOwnerEnforced"
  versioning = {
    enabled = false
  }
  lifecycle_rule = [
    {
      id      = "expire-objects"
      enabled = true

      expiration = {
        days = 30
      }
    }
  ]
  cors_rule = [
    {
      allowed_headers = ["*"]
      allowed_methods = ["GET", "HEAD"]
      allowed_origins = local.cors_allowed_origins
      max_age_seconds = 3000
    }
  ]
  allowed_kms_key_arn               = aws_kms_key.this.arn
  attach_deny_incorrect_kms_key_sse = true
  server_side_encryption_configuration = {
    rule = {
      bucket_key_enabled = true
      apply_server_side_encryption_by_default = {
        sse_algorithm     = "aws:kms"
        kms_master_key_id = aws_kms_key.this.arn
      }
    }
  }
}

resource "aws_athena_workgroup" "analytics" {
  name = "${var.name_prefix}-analytics-${terraform.workspace}"

  configuration {
    bytes_scanned_cutoff_per_query     = 1024 * 1024 * 1024 * 1024 * 1024 # 1 PB
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true
    engine_version {
      selected_engine_version = "AUTO"
    }

    result_configuration {
      output_location = "s3://${module.athena_query_results_bucket.s3_bucket_id}/"
      acl_configuration {
        s3_acl_option = "BUCKET_OWNER_FULL_CONTROL"
      }

      encryption_configuration {
        encryption_option = "SSE_KMS"
        kms_key_arn       = aws_kms_key.this.arn
      }
    }
  }
}
