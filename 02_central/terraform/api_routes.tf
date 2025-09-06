locals {
  api_resources = {
    "jobs" = {
      methods            = ["GET"]
      authorization_type = "JWT"
      authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
    },
    "notifications" = {
      methods            = ["GET", "POST"]
      authorization_type = "JWT"
      authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
    },
    "integrations" = {
      methods            = ["GET"]
      authorization_type = "JWT"
      authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
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

# Single integration for all lambda routes
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
