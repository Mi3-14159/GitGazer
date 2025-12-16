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

resource "aws_s3_bucket" "firehose_logs" {
  bucket        = "${data.aws_caller_identity.current.account_id}-${var.name_prefix}-firehose-logs-${terraform.workspace}"
  force_destroy = true
}

resource "aws_cloudwatch_log_group" "firehose_analytics" {
  name              = "/aws/kinesisfirehose/${var.name_prefix}-jobs-stream-${terraform.workspace}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_stream" "firehose_analytics" {
  name           = "DestinationDelivery"
  log_group_name = aws_cloudwatch_log_group.firehose_analytics.name
}

resource "aws_iam_role" "firehose" {
  name = "${var.name_prefix}-firehose-${terraform.workspace}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "firehose.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "firehose" {
  name = "${var.name_prefix}-firehose-policy-${terraform.workspace}"
  role = aws_iam_role.firehose.id

  policy = data.aws_iam_policy_document.firehose_assume_role_policy.json
}

data "aws_iam_policy_document" "firehose_assume_role_policy" {
  statement {
    effect = "Allow"
    actions = [
      "s3tables:GetTable",
      "s3tables:PutTableData",
      "s3tables:GetNamespace",
      "s3tables:GetTableBucket"
    ]
    resources = [
      aws_s3tables_table_bucket.analytics.arn,
      "${aws_s3tables_table_bucket.analytics.arn}/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
      "s3:PutObject"
    ]
    resources = [
      aws_s3_bucket.firehose_logs.arn,
      "${aws_s3_bucket.firehose_logs.arn}/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:GenerateDataKey",
      "kms:Decrypt"
    ]
    resources = [
      aws_kms_key.this.arn
    ]
  }
  statement {
    effect = "Allow"
    actions = [
      "glue:GetTable",
      "glue:GetTableVersion",
      "glue:GetTableVersions",
      "glue:GetDatabase"
    ]
    resources = [
      "*"
    ]
  }
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = [
      aws_cloudwatch_log_group.firehose_analytics.arn,
      "${aws_cloudwatch_log_group.firehose_analytics.arn}:*"
    ]
  }
}

resource "aws_kinesis_firehose_delivery_stream" "jobs" {
  name        = "${var.name_prefix}-jobs-stream-${terraform.workspace}"
  destination = "iceberg"

  iceberg_configuration {
    append_only = false
    # TODO: fetch ARN from a terraform resource
    catalog_arn = "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
    role_arn    = aws_iam_role.firehose.arn

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.firehose_analytics.name
      log_stream_name = aws_cloudwatch_log_stream.firehose_analytics.name
    }

    processing_configuration {
      enabled = true

      processors {
        type = "MetadataExtraction"

        parameters {
          parameter_name  = "JsonParsingEngine"
          parameter_value = "JQ-1.6"
        }
        parameters {
          parameter_name  = "MetadataExtractionQuery"
          parameter_value = "{destinationDatabaseName:\"${aws_s3tables_namespace.gitgazer.namespace}\",destinationTableName:\"${aws_s3tables_table.jobs.name}\"}"
        }
      }
    }

    s3_configuration {
      role_arn   = aws_iam_role.firehose.arn
      bucket_arn = aws_s3_bucket.firehose_logs.arn
      cloudwatch_logging_options {
        enabled         = true
        log_group_name  = aws_cloudwatch_log_group.firehose_analytics.name
        log_stream_name = aws_cloudwatch_log_stream.firehose_analytics.name
      }
    }
  }

  server_side_encryption {
    enabled  = true
    key_type = "CUSTOMER_MANAGED_CMK"
    key_arn  = aws_kms_key.this.arn
  }
}
