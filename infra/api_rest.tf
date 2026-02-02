locals {
  api_resources = {
    "workflows" = {
      methods = ["GET"]
    },
    "notifications" = {
      methods = ["GET", "POST"]
    },
    "notifications/{id}" = {
      methods = ["DELETE"]
    },
    "integrations" = {
      methods = ["GET", "POST"]
    },
    "integrations/{id}" = {
      methods = ["DELETE"]
    },
    "auth/cognito/public" = {
      methods = ["GET"]
    },
    "auth/cognito/private" = {
      methods = ["GET"]
    },
    "auth/cognito/user" = {
      methods = ["GET"]
    },
    "auth/cognito/token" = {
      methods = ["POST"]
    },
    "auth/callback" = {
      methods = ["GET"]
    },
    "auth/refresh" = {
      methods = ["POST"]
    },
    "auth/ws-token" = {
      methods = ["GET"]
    },
    "user" = {
      methods = ["GET"]
    },
    "analytics/jobs/metrics" = {
      methods = ["POST"]
    },
  }

  # Flatten the structure to create a map of resource-method combinations
  api_resource_methods = {
    for resource_key, resource_config in local.api_resources :
    resource_key => {
      for method in resource_config.methods :
      method => {
        resource_name      = resource_key
        method             = method
        authorization_type = try(resource_config.authorization_type, "NONE")
        authorizer_id      = try(resource_config.authorizer_id, null)
      }
    }
  }

  # Further flatten to create individual entries for each resource-method combination
  api_methods_flat = merge([
    for resource_key, methods in local.api_resource_methods : {
      for method_key, method_config in methods :
      "${resource_key}-${method_key}" => method_config
    }
  ]...)
}

resource "aws_cloudwatch_log_group" "gw_access_logs" {
  count             = var.apigateway_logging_enabled ? 1 : 0
  name              = "/aws/apigatewayv2/${var.name_prefix}-http-api-${terraform.workspace}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-github-http-api-${terraform.workspace}"
  description   = "GitGazer HTTP API"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = true
    allow_headers     = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token", "x-amz-user-agent"]
    allow_methods     = ["*"]
    allow_origins     = local.cors_allowed_origins
    expose_headers    = ["date", "keep-alive", "set-cookie"]
    max_age           = 86400
  }
}

resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    detailed_metrics_enabled = true
  }

  dynamic "access_log_settings" {
    for_each = var.apigateway_logging_enabled ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.gw_access_logs[0].arn
      format = jsonencode({
        requestId      = "$context.requestId"
        ip             = "$context.identity.sourceIp"
        requestTime    = "$context.requestTime"
        httpMethod     = "$context.httpMethod"
        routeKey       = "$context.routeKey"
        status         = "$context.status"
        protocol       = "$context.protocol"
        responseLength = "$context.responseLength"
      })
    }
  }

  depends_on = [aws_cloudwatch_log_group.gw_access_logs]
}

data "aws_iam_policy_document" "invocation_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "invocation_role" {
  name               = "${var.name_prefix}-api-gw-invocation-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.invocation_assume_role.json
}

resource "aws_iam_role_policy" "invocation_policy" {
  name   = "default"
  role   = aws_iam_role.invocation_role.id
  policy = data.aws_iam_policy_document.invocation_policy.json
}

data "aws_iam_policy_document" "invocation_policy" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_alias.live.arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${module.ui_bucket.s3_bucket_arn}/*"]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_alias.live.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api_routes" {
  for_each  = local.api_methods_flat
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "${each.value.method} /api/${each.value.resource_name}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"

  authorization_type = try(each.value.authorization_type, "NONE")
  authorizer_id      = try(each.value.authorizer_id, null)
}

resource "aws_apigatewayv2_route" "import_integration" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "POST /api/import/{integrationId}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "fe_failover" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /${local.frontend_failover_sub_path}/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
