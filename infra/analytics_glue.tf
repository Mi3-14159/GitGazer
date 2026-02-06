data "aws_iam_policy_document" "glue_resource_policy" {
  statement {
    effect = "Allow"
    principals {
      type = "AWS"
      identifiers = [
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root",
      ]
    }
    actions = [
      "glue:CreateInboundIntegration",
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}",
    ]
  }

  statement {
    effect = "Allow"
    principals {
      type = "Service"
      identifiers = [
        "glue.amazonaws.com",
      ]
    }
    actions = [
      "glue:AuthorizeInboundIntegration",
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}",
    ]
  }
}

resource "aws_glue_resource_policy" "this" {
  policy = data.aws_iam_policy_document.glue_resource_policy.json
}

resource "awscc_glue_integration" "analytics" {
  integration_name              = "${var.name_prefix}-analytics-${terraform.workspace}"
  source_arn                    = aws_dynamodb_table.workflows.arn
  target_arn                    = "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
  additional_encryption_context = {}
  integration_config = {
    refresh_interval = "${60 * 6}" # 6 hours
  }
  description = "GitGazer Glue Integration for Analytics - ${terraform.workspace}"
  kms_key_id  = aws_kms_key.this.arn
  depends_on = [
    awscc_glue_integration_resource_property.analytics,
    null_resource.create_integration_table_properties,
  ]
  lifecycle {
    prevent_destroy = true
  }
}

resource "awscc_glue_integration_resource_property" "analytics" {
  resource_arn = "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}"
  target_processing_properties = {
    role_arn = aws_iam_role.analytics_zero_etl.arn
  }
}

# TODO: replace this with a proper awscc resource once it becomes available
resource "null_resource" "create_integration_table_properties" {
  triggers = {
    region                     = var.aws_region
    account_id                 = data.aws_caller_identity.current.account_id
    s3tables_table_bucket_name = aws_s3tables_table_bucket.analytics.name
    table_name                 = aws_dynamodb_table.workflows.name
    target_table_name          = local.analytics_workflows_tablename
  }

  provisioner "local-exec" {
    command = <<EOT
aws glue create-integration-table-properties \
  --region ${var.aws_region} \
  --resource-arn arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name} \
  --table-name ${aws_dynamodb_table.workflows.name} \
  --target-table-config '${jsonencode({
    UnnestSpec : "FULL",
    TargetTableName : "${local.analytics_workflows_tablename}",
})}'
EOT
}
}

resource "aws_iam_role" "analytics_zero_etl" {
  name               = "${var.name_prefix}-analytics-zero-etl-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.analytics_zero_etl_assume_role_policy.json
}

data "aws_iam_policy_document" "analytics_zero_etl_assume_role_policy" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["glue.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role_policy" "analytics_zero_etl" {
  name   = "${var.name_prefix}-analytics-zero-etl-role-policy-${terraform.workspace}"
  role   = aws_iam_role.analytics_zero_etl.id
  policy = data.aws_iam_policy_document.analytics_zero_etl_role_policy.json
}

data "aws_iam_policy_document" "analytics_zero_etl_role_policy" {
  statement {
    effect = "Allow"
    actions = [
      "glue:CreateTable",
      "glue:GetTable",
      "glue:UpdateTable",
      "glue:GetTableVersion",
      "glue:GetTableVersions",
      "glue:GetResourcePolicy",
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:database/s3tablescatalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/s3tablescatalog/*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values = [
        "AWS/Glue/ZeroETL",
      ]
    }
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      # the log group name is fixed for ZeroETL integrations
      # i suggest you modify the paramters of the loggroup to your liking
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws-glue/zeroETL-integrations/logs",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws-glue/zeroETL-integrations/logs:log-stream:*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "glue:GetDatabase",
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:database/s3tablescatalog",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey"
    ]
    resources = [
      aws_kms_key.this.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3tables:ListTableBuckets",
      "s3tables:GetTableBucket",
      "s3tables:GetTableBucketEncryption",
      "s3tables:GetNamespace",
      "s3tables:CreateNamespace",
      "s3tables:ListNamespaces",
      "s3tables:CreateTable",
      "s3tables:GetTable",
      "s3tables:GetTableEncryption",
      "s3tables:ListTables",
      "s3tables:GetTableMetadataLocation",
      "s3tables:UpdateTableMetadataLocation",
      "s3tables:GetTableData",
      "s3tables:PutTableData"
    ]
    resources = [
      aws_s3tables_table_bucket.analytics.arn,
      "${aws_s3tables_table_bucket.analytics.arn}/table/*",
    ]
  }
}

data "aws_iam_policy_document" "api_runtime_policy" {
  statement {
    effect = "Allow"
    actions = [
      "athena:StartQueryExecution",
    ]
    resources = [
      aws_athena_workgroup.analytics.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [
      module.athena_query_results_bucket.s3_bucket_arn,
      "${module.athena_query_results_bucket.s3_bucket_arn}/*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "lakeformation:GetDataAccess",
      "lakeformation:CreateDataCellsFilter",
      "lakeformation:DeleteDataCellsFilter",
      "lakeformation:GetDataCellsFilter",
      "lakeformation:UpdateDataCellsFilter",
    ]
    resources = [
      "*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "glue:GetDatabase",
      "glue:GetDatabases",
      "glue:GetTable",
      "glue:GetTables",
      "glue:GetPartition",
      "glue:GetPartitions",
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:database/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}/*",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/s3tablescatalog/${aws_s3tables_table_bucket.analytics.name}/*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "kms:Encrypt",
    ]
    resources = [
      aws_kms_key.this.arn,
    ]
  }
}
