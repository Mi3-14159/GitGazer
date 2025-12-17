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

  # in order to create a table, at least one field is required
  # everything else if managed via scripts
  metadata {
    iceberg {
      schema {
        field {
          name     = "integration_id"
          type     = "string"
          required = true
        }
      }
    }
  }
}

resource "aws_s3_bucket" "firehose_backup" {
  bucket        = "${data.aws_caller_identity.current.account_id}-${var.name_prefix}-firehose-backup-${terraform.workspace}"
  force_destroy = true
}

resource "aws_cloudwatch_log_group" "firehose_analytics" {
  name              = "/aws/kinesisfirehose/${var.name_prefix}-jobs-stream-${terraform.workspace}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_stream" "firehose_analytics_delivery" {
  name           = "DestinationDelivery"
  log_group_name = aws_cloudwatch_log_group.firehose_analytics.name
}

resource "aws_cloudwatch_log_stream" "firehose_analytics_backup" {
  name           = "BackupDelivery"
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

data "aws_iam_policy_document" "firehose_policy" {
  statement {
    # TODO: check glue permissions and restrict if possible
    effect = "Allow"
    actions = [
      "glue:GetTable",
      "glue:GetTableVersion",
      "glue:GetTableVersions",
      "glue:GetDatabase",
      "glue:UpdateTable"
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/*",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:database/*",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/*/*"
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
      aws_s3_bucket.firehose_backup.arn,
      "${aws_s3_bucket.firehose_backup.arn}/*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "lakeformation:GetDataAccess"
    ]
    resources = [
      "*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey"
    ]
    resources = [aws_kms_key.this.arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:PutLogEvents"
    ]
    resources = [
      "${aws_cloudwatch_log_group.firehose_analytics.arn}:log-stream:${aws_cloudwatch_log_stream.firehose_analytics_delivery.name}",
      "${aws_cloudwatch_log_group.firehose_analytics.arn}:log-stream:${aws_cloudwatch_log_stream.firehose_analytics_backup.name}"
    ]
  }

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
}

resource "aws_iam_role_policy" "firehose" {
  name   = "${var.name_prefix}-firehose-policy-${terraform.workspace}"
  role   = aws_iam_role.firehose.id
  policy = data.aws_iam_policy_document.firehose_policy.json
}

# At the time of writing, Terraform AWS Provider had a bug that prevented
# creating Lake Formation permissions for S3Tables catalogs.
# https://github.com/hashicorp/terraform-provider-aws/issues/40724
# resource "aws_lakeformation_permissions" "firehose_table_access" {
#   principal   = aws_iam_role.firehose.arn
#   permissions = ["SUPER"]
#   database {
#     catalog_id = "${data.aws_caller_identity.current.account_id}:s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
#     name       = aws_s3tables_namespace.gitgazer.namespace
#   }
# }

# This is a workaround using a null_resource and local-exec provisioner
# to run the AWS CLI command to grant Lake Formation permissions.
resource "null_resource" "lf_grant_firehose_jobs_db" {
  triggers = {
    catalog_id    = local.s3tables_catalog_id
    database_name = aws_s3tables_namespace.gitgazer.namespace
    principal_arn = aws_iam_role.firehose.arn
  }

  provisioner "local-exec" {
    command = <<EOT
aws lakeformation grant-permissions \
  --region ${var.aws_region} \
  --cli-input-json '{
    "Principal": { "DataLakePrincipalIdentifier": "${aws_iam_role.firehose.arn}" },
    "Resource": {
      "Database": {
        "CatalogId": "${local.s3tables_catalog_id}",
        "Name": "${aws_s3tables_namespace.gitgazer.namespace}"
      }
    },
    "Permissions": ["ALL"]
  }'
EOT
  }
  depends_on = [aws_iam_role_policy.firehose]
}

resource "null_resource" "lf_grant_firehose_jobs_table" {
  triggers = {
    catalog_id    = local.s3tables_catalog_id
    database_name = aws_s3tables_namespace.gitgazer.namespace
    table_name    = aws_s3tables_table.jobs.name
    principal_arn = aws_iam_role.firehose.arn
  }

  provisioner "local-exec" {
    command = <<EOT
aws lakeformation grant-permissions \
  --region ${var.aws_region} \
  --cli-input-json '{
    "Principal": { "DataLakePrincipalIdentifier": "${aws_iam_role.firehose.arn}" },
    "Resource": {
      "Table": {
        "CatalogId": "${local.s3tables_catalog_id}",
        "DatabaseName": "${aws_s3tables_namespace.gitgazer.namespace}",
        "Name": "${aws_s3tables_table.jobs.name}"
      }
    },
    "Permissions": ["ALL"]
  }'
EOT
  }
  depends_on = [aws_iam_role_policy.firehose]
}

resource "aws_kinesis_firehose_delivery_stream" "jobs" {
  name        = "${var.name_prefix}-jobs-stream-${terraform.workspace}"
  destination = "iceberg"

  depends_on = [null_resource.lf_grant_firehose_jobs_table]

  iceberg_configuration {
    catalog_arn        = "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
    role_arn           = aws_iam_role.firehose.arn
    buffering_interval = 60
    buffering_size     = 1

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.firehose_analytics.name
      log_stream_name = aws_cloudwatch_log_stream.firehose_analytics_delivery.name
    }
    destination_table_configuration {
      database_name = aws_s3tables_namespace.gitgazer.namespace
      table_name    = aws_s3tables_table.jobs.name
    }
    s3_configuration {
      role_arn   = aws_iam_role.firehose.arn
      bucket_arn = aws_s3_bucket.firehose_backup.arn
      cloudwatch_logging_options {
        enabled         = true
        log_group_name  = aws_cloudwatch_log_group.firehose_analytics.name
        log_stream_name = aws_cloudwatch_log_stream.firehose_analytics_backup.name
      }
    }
  }

  server_side_encryption {
    enabled  = true
    key_type = "CUSTOMER_MANAGED_CMK"
    key_arn  = aws_kms_key.this.arn
  }
}
