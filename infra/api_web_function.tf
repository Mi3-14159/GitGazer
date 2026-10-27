locals {
  api_web_name = "${var.name_prefix}-api-web-${terraform.workspace}"
  # At most half of Aurora's connections, minus 20 for the other Lambdas, at 5 per environment
  api_web_db_pool_max      = 5
  api_web_max_environments = min(10, floor((var.db_max_connections / 2 - 20) / local.api_web_db_pool_max))
  awscc_default_tags       = [for k, v in local.default_tags : { key = k, value = tostring(v) }]
}

resource "aws_cloudwatch_log_group" "api_web" {
  name              = "/aws/lambda/web/${local.api_web_name}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "api_web_connector" {
  statement {
    effect  = "Allow"
    actions = ["ec2:CreateNetworkInterface"]
    resources = concat(
      ["arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:network-interface/*", aws_security_group.lambda.arn],
      [for id in local.private_subnets : "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:subnet/${id}"],
    )
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:CreateTags"]
    resources = ["arn:aws:ec2:*:*:network-interface/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ManagedResourceOperator"
      values   = ["network-connectors.lambda.amazonaws.com"]
    }
  }

  statement {
    effect = "Allow"
    actions = [
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeVpcs",
    ]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "api_web_connector_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "api_web_connector" {
  name               = "${local.api_web_name}-connector"
  assume_role_policy = data.aws_iam_policy_document.api_web_connector_assume_role.json
}

resource "aws_iam_role_policy" "api_web_connector" {
  name   = "${local.api_web_name}-connector"
  role   = aws_iam_role.api_web_connector.id
  policy = data.aws_iam_policy_document.api_web_connector.json
}

resource "awscc_lambda_network_connector" "api" {
  name = local.api_web_name
  configuration = {
    vpc_egress_configuration = {
      subnet_ids                        = local.private_subnets
      security_group_ids                = [aws_security_group.lambda.id]
      network_protocol                  = "DualStack"
      associated_compute_resource_types = ["WebFunction"]
    }
  }
  operator_role = aws_iam_role.api_web_connector.arn
  tags          = local.awscc_default_tags

  depends_on = [aws_iam_role_policy.api_web_connector]
}

resource "awscc_lambda_web_function" "api" {
  function_name = local.api_web_name
  tags          = local.awscc_default_tags
}

resource "terraform_data" "api_code_version" {
  input = data.aws_s3_object.api_lambda_function_archive.version_id
}

resource "awscc_lambda_web_function_revision" "api" {
  function_name = awscc_lambda_web_function.api.function_name
  build_config = {
    code_config = {
      s3_object = {
        bucket     = module.lambda_store.s3_bucket_id
        key        = data.aws_s3_object.api_lambda_function_archive.key
        version_id = data.aws_s3_object.api_lambda_function_archive.version_id
      }
    }
    runtime_config = {
      runtime = "nodejs24.x"
    }
  }
  service_config = {
    execution_role_arn           = aws_iam_role.api.arn
    egress_network_connector_arn = awscc_lambda_network_connector.api.latest_version_arn
    environment_variables        = merge(local.api_environment, { DB_POOL_MAX = tostring(local.api_web_db_pool_max) })
    timeout_seconds              = 30
    telemetry_config = {
      logging_config = {
        log_group             = aws_cloudwatch_log_group.api_web.name
        application_log_level = local.lambda_application_log_level
        system_log_level      = "INFO"
      }
    }
  }

  depends_on = [aws_s3_bucket_policy.lambda_store, aws_iam_role_policy.api]

  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [terraform_data.api_code_version]
  }
}

resource "awscc_lambda_web_function_endpoint" "api" {
  function_name = awscc_lambda_web_function.api.function_name
  endpoint_name = "default"
  endpoint_type = "HomeRegion"
  auth_type     = "IamAuth"
  revision_weights = [{
    revision_id = awscc_lambda_web_function_revision.api.revision_id
    weight      = 100
  }]
  scaling_config = {
    max_environments = local.api_web_max_environments
  }
}

# Scoped to the endpoint ARN; a statement on the function ARN alone is rejected with 403
data "aws_iam_policy_document" "api_web_resource_policy" {
  statement {
    sid       = "AllowCloudFrontOACAccess"
    effect    = "Allow"
    actions   = ["lambda:InvokeWebFunctionEndpoint"]
    resources = [awscc_lambda_web_function_endpoint.api.endpoint_arn]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "awscc_lambda_resource_policy" "api_web" {
  resource_arn    = awscc_lambda_web_function.api.function_arn
  policy_document = data.aws_iam_policy_document.api_web_resource_policy.json
}
