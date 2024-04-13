resource "aws_cloudwatch_log_group" "gw_access_logs" {
  count             = var.api_aws_apigatewayv2_api_logging_enabled ? 1 : 0
  name              = "/aws/apigateway/${var.name_prefix}-rest-api-${terraform.workspace}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-rest-api-${terraform.workspace}"
  description   = "GitGazer rest api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  dynamic "access_log_settings" {
    for_each = var.api_aws_apigatewayv2_api_logging_enabled ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.gw_access_logs[0].arn
      format = jsonencode(
        {
          requestId : "$context.requestId",
          ip : "$context.identity.sourceIp",
          requestTime : "$context.requestTime",
          httpMethod : "$context.httpMethod",
          routeKey : "$context.routeKey",
          status : "$context.status",
          protocol : "$context.protocol",
          path : "$context.path",
          responseLength : "$context.responseLength"
          authError : "$context.authorizer.error",
          errorMessage : "$context.error.message",
          integrationErrorMessage : "$context.integrationErrorMessage",
          responseLatency : "$context.responseLatency",
        }
      )
    }
  }

  default_route_settings {
    detailed_metrics_enabled = true
    #logging_level            = "INFO"
    throttling_burst_limit = 5000  # same as account wide limit
    throttling_rate_limit  = 10000 # same as account wide limit
  }

  # Bug in terraform-aws-provider with perpetual diff
  lifecycle {
    ignore_changes = [deployment_id]
  }
}

resource "aws_apigatewayv2_integration" "jobs_sqs" {
  api_id              = aws_apigatewayv2_api.this.id
  credentials_arn     = aws_iam_role.api_gw_sqs_integration.arn
  description         = "Jobs SQS integration"
  integration_type    = "AWS_PROXY"
  integration_subtype = "SQS-SendMessage"

  request_parameters = {
    "QueueUrl"    = module.jobs.queue_url
    "MessageBody" = "$request.body"
  }
}

resource "aws_apigatewayv2_route" "import" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "POST /api/import"
  target    = "integrations/${aws_apigatewayv2_integration.jobs_sqs.id}"
}

resource "aws_iam_role" "api_gw_sqs_integration" {
  name               = "${var.name_prefix}-api-gw-sqs-integration-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.api_gw_sqs_integration_assume_role_policy.json
  inline_policy {
    name   = "api-gw-sqs-integration-role-policy"
    policy = data.aws_iam_policy_document.api_gw_sqs_integration_role_policy.json
  }
}

data "aws_iam_policy_document" "api_gw_sqs_integration_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "api_gw_sqs_integration_role_policy" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [module.jobs.queue_arn]
  }
  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [
      aws_kms_key.this.arn,
    ]
  }
}
