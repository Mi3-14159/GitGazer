resource "aws_appsync_graphql_api" "this" {
  name                = data.terraform_remote_state.prerequisite.outputs.name_prefix
  authentication_type = "API_KEY"

  additional_authentication_provider {
    authentication_type = "AWS_IAM"
  }

  schema = file("${path.module}/schema.graphql")

  log_config {
    cloudwatch_logs_role_arn = aws_iam_role.logging.arn
    field_log_level          = "ALL"
  }
}

data "aws_iam_policy_document" "logging_assume_role" {
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
  name               = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-appsync-logs"
  assume_role_policy = data.aws_iam_policy_document.logging_assume_role.json
}

resource "aws_iam_role_policy_attachment" "logging" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs"
  role       = aws_iam_role.logging.name
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
  name               = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-appsync-service"
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
    resources = [data.terraform_remote_state.prerequisite.outputs.aws_kms_key.arn]

  }
}

resource "aws_iam_role_policy" "service" {
  name   = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-appsync-service-policy"
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
