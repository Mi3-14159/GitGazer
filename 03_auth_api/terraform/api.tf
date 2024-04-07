resource "aws_api_gateway_rest_api" "this" {
  name = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-github-auth-proxy"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

locals {
  routes = [
    {
      path_part     = "public"
      method        = "GET"
      authorization = "NONE"
    },
    {
      path_part     = "user"
      method        = "GET"
      authorization = "NONE"
    },
    {
      path_part     = "token"
      method        = "POST"
      authorization = "NONE"
      #authorization = "COGNITO_USER_POOLS" # TODO: enabled this after testing
      #authorizer_id = aws_api_gateway_authorizer.user_pool.id
    },
    {
      path_part     = "private"
      method        = "GET"
      authorization = "NONE"
    },
  ]
}

resource "aws_api_gateway_resource" "this" {
  for_each    = { for route in local.routes : route.path_part => route }
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = each.value.path_part
  rest_api_id = aws_api_gateway_rest_api.this.id
}

resource "aws_api_gateway_method" "this" {
  for_each      = { for route in local.routes : route.path_part => route }
  authorization = each.value.authorization
  http_method   = each.value.method
  resource_id   = aws_api_gateway_resource.this[each.key].id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  authorizer_id = try(each.value.authorizer_id, null)
}

resource "aws_api_gateway_integration" "this" {
  for_each                = { for route in local.routes : route.path_part => route }
  http_method             = aws_api_gateway_method.this[each.key].http_method
  resource_id             = aws_api_gateway_resource.this[each.key].id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_alias.live.invoke_arn
}

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.this,
      aws_api_gateway_method.this,
      aws_api_gateway_integration.this,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "v1" {
  deployment_id = aws_api_gateway_deployment.this.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = local.api_gateway_stage_name
}

resource "aws_api_gateway_authorizer" "user_pool" {
  name          = "${data.terraform_remote_state.prerequisite.outputs.name_prefix}-authorizer"
  type          = "COGNITO_USER_POOLS"
  rest_api_id   = aws_api_gateway_rest_api.this.id
  provider_arns = [aws_cognito_user_pool.this.arn]
}
