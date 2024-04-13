resource "aws_appsync_graphql_api" "this" {
  name   = "${var.name_prefix}-${terraform.workspace}"
  schema = file("${path.module}/schema.graphql")

  authentication_type = "AWS_IAM"

  dynamic "additional_authentication_provider" {
    for_each = local.appsync_additional_authentication_provider_api_key
    content {
      authentication_type = additional_authentication_provider.value.authentication_type
    }
  }

  dynamic "additional_authentication_provider" {
    for_each = local.appsync_additional_authentication_provider_amazon_cognito_user_pools
    content {
      authentication_type = additional_authentication_provider.value.authentication_type
      user_pool_config {
        user_pool_id        = additional_authentication_provider.value.user_pool_config.user_pool_id
        aws_region          = additional_authentication_provider.value.user_pool_config.aws_region
        app_id_client_regex = additional_authentication_provider.value.user_pool_config.app_id_client_regex
      }
    }
  }

  dynamic "log_config" {
    for_each = var.aws_appsync_graphql_api_logging_enabled ? [1] : []
    content {
      cloudwatch_logs_role_arn = aws_iam_role.logging[0].arn
      field_log_level          = "ALL"
    }

  }
}

data "aws_iam_policy_document" "logging_assume_role" {
  count = var.aws_appsync_graphql_api_logging_enabled ? 1 : 0
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["appsync.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "logging" {
  count              = var.aws_appsync_graphql_api_logging_enabled ? 1 : 0
  name               = "${var.name_prefix}-appsync-logs-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.logging_assume_role[0].json
}

resource "aws_iam_role_policy_attachment" "logging" {
  count      = var.aws_appsync_graphql_api_logging_enabled ? 1 : 0
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs"
  role       = aws_iam_role.logging[0].name
}

data "aws_iam_policy_document" "service_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["appsync.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}
resource "aws_iam_role" "service" {
  name               = "${var.name_prefix}-appsync-service-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.service_assume_role.json
}

data "aws_iam_policy_document" "service" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem"
    ]
    resources = [aws_dynamodb_table.jobs.arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
    ]
    resources = [aws_kms_key.this.arn]

  }
}

resource "aws_iam_role_policy" "service" {
  name   = "${var.name_prefix}-appsync-service-policy-${terraform.workspace}"
  role   = aws_iam_role.service.id
  policy = data.aws_iam_policy_document.service.json
}

resource "aws_appsync_datasource" "dynamodb" {
  api_id           = aws_appsync_graphql_api.this.id
  name             = replace(aws_dynamodb_table.jobs.name, "-", "")
  service_role_arn = aws_iam_role.service.arn
  type             = "AMAZON_DYNAMODB"

  dynamodb_config {
    table_name = aws_dynamodb_table.jobs.name
  }
}

resource "aws_appsync_resolver" "units" {
  for_each = {
    for index, resolver in local.appsync_unit_resolvers :
    resolver.field => resolver
  }
  type           = each.value.type
  api_id         = aws_appsync_graphql_api.this.id
  field          = each.value.field
  kind           = "UNIT"
  code           = file(each.value.code_file_path)
  data_source    = aws_appsync_datasource.dynamodb.name
  max_batch_size = 0
  runtime {
    name            = "APPSYNC_JS"
    runtime_version = "1.0.0"
  }
}
