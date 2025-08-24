locals {
  api_resources = {
    "jobs" = {
      methods = ["GET"]
    },
    "notifications" = {
      methods = ["GET", "PUT"]
    },
    "integrations" = {
      methods = ["GET"]
    },
  }

  # Flatten the structure to create a map of resource-method combinations
  api_resource_methods = {
    for resource_key, resource_config in local.api_resources :
    resource_key => {
      for method in resource_config.methods :
      method => {
        resource_name = resource_key
        method        = method
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

resource "aws_api_gateway_resource" "api_resources" {
  for_each    = local.api_resources
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api_root.id
  path_part   = each.key
}

resource "aws_api_gateway_method" "api_resources" {
  for_each      = local.api_methods_flat
  http_method   = each.value.method
  resource_id   = aws_api_gateway_resource.api_resources[each.value.resource_name].id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "api_resources" {
  for_each                = aws_api_gateway_method.api_resources
  http_method             = aws_api_gateway_method.api_resources[each.key].http_method
  resource_id             = aws_api_gateway_method.api_resources[each.key].resource_id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_alias.live.invoke_arn
}

#### OPTIONS

resource "aws_api_gateway_method" "api_resources_options" {
  for_each      = aws_api_gateway_resource.api_resources
  authorization = "NONE"
  http_method   = "OPTIONS"
  resource_id   = aws_api_gateway_resource.api_resources[each.key].id
  rest_api_id   = aws_api_gateway_rest_api.this.id
}

resource "aws_api_gateway_integration" "api_resources_options" {
  for_each    = aws_api_gateway_method.api_resources_options
  http_method = aws_api_gateway_method.api_resources_options[each.key].http_method
  resource_id = aws_api_gateway_resource.api_resources[each.key].id
  rest_api_id = aws_api_gateway_rest_api.this.id
  type        = "MOCK"
  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_method_response" "api_resources_options" {
  for_each    = aws_api_gateway_method.api_resources_options
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.api_resources[each.key].id
  http_method = aws_api_gateway_method.api_resources_options[each.key].http_method
  status_code = "200"
}

resource "aws_api_gateway_integration_response" "api_resources_options" {
  for_each    = aws_api_gateway_method.api_resources_options
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.api_resources[each.key].id
  http_method = aws_api_gateway_method.api_resources_options[each.key].http_method
  status_code = aws_api_gateway_method_response.api_resources_options[each.key].status_code
}
