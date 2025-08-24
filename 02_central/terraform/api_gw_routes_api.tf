locals {
  api_resources = {
    "jobs" = {
      method = "GET"
    },
    "notifications" = {
      method = "GET"
    },
    "integrations" = {
      method = "GET"
    },
  }
}

resource "aws_api_gateway_resource" "api_resources" {
  for_each    = local.api_resources
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api_root.id
  path_part   = each.key
}

resource "aws_api_gateway_method" "api_resources" {
  for_each      = aws_api_gateway_resource.api_resources
  http_method   = try(local.api_resources[each.key].method, null)
  resource_id   = aws_api_gateway_resource.api_resources[each.key].id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "api_resources" {
  for_each                = aws_api_gateway_method.api_resources
  http_method             = aws_api_gateway_method.api_resources[each.key].http_method
  resource_id             = aws_api_gateway_resource.api_resources[each.key].id
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
