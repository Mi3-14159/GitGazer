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

resource "aws_cloudwatch_log_group" "appsync" {
  count             = var.aws_appsync_graphql_api_logging_enabled ? 1 : 0
  name              = "/aws/appsync/apis/${aws_appsync_graphql_api.this.id}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
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
    resources = compact([
      aws_dynamodb_table.jobs.arn,
      "${aws_dynamodb_table.jobs.arn}/*", # indeces
      try(aws_dynamodb_table.notification_rules[0].arn, null),
      try("${aws_dynamodb_table.notification_rules[0].arn}/*", null) # indeces
    ])
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
    ]
    resources = [aws_kms_key.this.arn]
  }

  dynamic "statement" {
    for_each = var.create_gitgazer_alerting ? [1] : []
    content {
      effect = "Allow"
      actions = [
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
      ]
      resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_parameter_gh_webhook_secret_name_prefix}*"]
    }
  }
}

resource "aws_iam_role_policy" "service" {
  name   = "${var.name_prefix}-appsync-service-policy-${terraform.workspace}"
  role   = aws_iam_role.service.id
  policy = data.aws_iam_policy_document.service.json
}

resource "aws_appsync_datasource" "notification_rules" {
  count            = var.create_gitgazer_alerting ? 1 : 0
  api_id           = aws_appsync_graphql_api.this.id
  name             = replace(aws_dynamodb_table.notification_rules[0].name, "-", "_")
  service_role_arn = aws_iam_role.service.arn
  type             = "AMAZON_DYNAMODB"

  dynamodb_config {
    table_name = aws_dynamodb_table.notification_rules[0].name
  }
}

resource "aws_appsync_datasource" "jobs" {
  api_id           = aws_appsync_graphql_api.this.id
  name             = replace(aws_dynamodb_table.jobs.name, "-", "_")
  service_role_arn = aws_iam_role.service.arn
  type             = "AMAZON_DYNAMODB"

  dynamodb_config {
    table_name = aws_dynamodb_table.jobs.name
  }
}

resource "aws_appsync_datasource" "none" {
  api_id = aws_appsync_graphql_api.this.id
  name   = "none"
  type   = "NONE"
}


resource "aws_appsync_datasource" "ssm" {
  count            = var.create_gitgazer_alerting ? 1 : 0
  api_id           = aws_appsync_graphql_api.this.id
  name             = "ssm"
  type             = "HTTP"
  service_role_arn = aws_iam_role.service.arn
  http_config {
    endpoint = "https://ssm.${var.aws_region}.amazonaws.com/"
    authorization_config {
      authorization_type = "AWS_IAM"
      aws_iam_config {
        signing_region       = var.aws_region
        signing_service_name = "ssm"
      }
    }
  }
}

resource "aws_appsync_resolver" "this" {
  for_each = {
    for index, resolver in local.appsync_resolvers :
    "${resolver.type}_${resolver.field}" => resolver
  }
  type           = each.value.type
  api_id         = aws_appsync_graphql_api.this.id
  field          = each.value.field
  kind           = each.value.kind
  code           = try(file(each.value.code_file_path), null)
  data_source    = try(each.value.data_source, null)
  max_batch_size = 0
  runtime {
    name            = "APPSYNC_JS"
    runtime_version = "1.0.0"
  }
  dynamic "pipeline_config" {
    for_each = try(each.value.pipeline_config, null) != null ? [1] : []
    content {
      functions = each.value.pipeline_config.functions
    }
  }
  depends_on = [aws_appsync_function.this]
}

resource "aws_appsync_domain_name" "this" {
  domain_name     = "api.${var.custom_domain_config.domain_name}"
  certificate_arn = var.custom_domain_config.certificate_arn
}

resource "aws_appsync_domain_name_api_association" "this" {
  api_id      = aws_appsync_graphql_api.this.id
  domain_name = aws_appsync_domain_name.this.domain_name
}

resource "aws_appsync_function" "this" {
  for_each = {
    for index, function in local.appsync_functions :
    function.name => function
  }
  api_id      = aws_appsync_graphql_api.this.id
  data_source = each.value.data_source
  name        = each.value.name
  code        = file(each.value.code_file_path)
  runtime {
    name            = "APPSYNC_JS"
    runtime_version = "1.0.0"
  }
}
