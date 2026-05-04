resource "aws_cloudwatch_log_group" "http_proxy" {
  count             = var.enable_http_proxy ? 1 : 0
  name              = "/aws/lambda/${var.name_prefix}-http-proxy-${terraform.workspace}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.this.arn
}

data "aws_iam_policy_document" "http_proxy_assume_role" {
  count = var.enable_http_proxy ? 1 : 0
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "http_proxy" {
  count              = var.enable_http_proxy ? 1 : 0
  name               = "${var.name_prefix}-http-proxy-role-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.http_proxy_assume_role[0].json
}

data "aws_iam_policy_document" "http_proxy" {
  count = var.enable_http_proxy ? 1 : 0
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      "${aws_cloudwatch_log_group.http_proxy[0].arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "http_proxy" {
  count  = var.enable_http_proxy ? 1 : 0
  name   = "${var.name_prefix}-http-proxy-role-${terraform.workspace}"
  role   = aws_iam_role.http_proxy[0].id
  policy = data.aws_iam_policy_document.http_proxy[0].json
}

data "aws_s3_object" "http_proxy_lambda_function_archive" {
  count  = var.enable_http_proxy ? 1 : 0
  bucket = module.lambda_store.s3_bucket_id
  key    = "${var.name_prefix}-http-proxy.zip"
}

resource "aws_lambda_function" "http_proxy" {
  count             = var.enable_http_proxy ? 1 : 0
  description       = "HTTP proxy for IPv4-only external services (GitHub, Slack)"
  function_name     = "${var.name_prefix}-http-proxy-${terraform.workspace}"
  role              = aws_iam_role.http_proxy[0].arn
  handler           = "index.handler"
  runtime           = "nodejs24.x"
  s3_bucket         = module.lambda_store.s3_bucket_id
  s3_key            = data.aws_s3_object.http_proxy_lambda_function_archive[0].key
  s3_object_version = data.aws_s3_object.http_proxy_lambda_function_archive[0].version_id
  timeout           = 30
  publish           = true
  memory_size       = 128

  environment {
    variables = {
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  logging_config {
    log_group             = aws_cloudwatch_log_group.http_proxy[0].name
    log_format            = "JSON"
    application_log_level = local.lambda_application_log_level
    system_log_level      = "INFO"
  }

  # No VPC config — this Lambda needs native IPv4 internet access
  # to proxy requests to IPv4-only services (GitHub, Slack)
}

# IAM policy that allows invoking the proxy Lambda
resource "aws_iam_policy" "invoke_http_proxy" {
  count = var.enable_http_proxy ? 1 : 0
  name  = "${var.name_prefix}-invoke-http-proxy-${terraform.workspace}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.http_proxy[0].arn
    }]
  })
}

# Attach to each Lambda role that needs to call external IPv4 services
resource "aws_iam_role_policy_attachment" "api_invoke_http_proxy" {
  count      = var.enable_http_proxy ? 1 : 0
  role       = aws_iam_role.api.id
  policy_arn = aws_iam_policy.invoke_http_proxy[0].arn
}

resource "aws_iam_role_policy_attachment" "worker_invoke_http_proxy" {
  count      = var.enable_http_proxy ? 1 : 0
  role       = aws_iam_role.worker.id
  policy_arn = aws_iam_policy.invoke_http_proxy[0].arn
}

resource "aws_iam_role_policy_attachment" "org_sync_invoke_http_proxy" {
  count      = var.enable_http_proxy ? 1 : 0
  role       = aws_iam_role.org_sync_scheduler.id
  policy_arn = aws_iam_policy.invoke_http_proxy[0].arn
}
