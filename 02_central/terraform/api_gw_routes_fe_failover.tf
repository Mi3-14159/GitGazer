resource "aws_api_gateway_resource" "frontend_failover" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = local.frontend_failover_sub_path
}

resource "aws_api_gateway_resource" "frontend_proxy" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.frontend_failover[0].id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "frontend_proxy_get" {
  count         = var.with_frontend_stack ? 1 : 0
  authorization = "NONE"
  http_method   = "GET"
  resource_id   = aws_api_gateway_resource.frontend_proxy[0].id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_integration" "frontend_proxy" {
  count                   = var.with_frontend_stack ? 1 : 0
  http_method             = aws_api_gateway_method.frontend_proxy_get[0].http_method
  resource_id             = aws_api_gateway_resource.frontend_proxy[0].id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS"
  integration_http_method = "GET"
  cache_key_parameters = [
    "method.request.path.proxy",
  ]
  credentials = aws_iam_role.invocation_role.arn
  uri         = "arn:aws:apigateway:${var.aws_region}:s3:path/${module.ui_bucket.s3_bucket_id}/index.html"
}

resource "aws_api_gateway_method_response" "frontend_proxy_200" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Content-Length" = false
    "method.response.header.Content-Type"   = false
    "method.response.header.Timestamp"      = false
    "method.response.header.Cache-Control"  = false
  }
}

resource "aws_api_gateway_method_response" "frontend_proxy_400" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = "400"
}

resource "aws_api_gateway_method_response" "frontend_proxy_500" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = "500"
}

resource "aws_api_gateway_integration_response" "frontend_proxy_200" {
  count       = var.with_frontend_stack ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this.id
  resource_id = aws_api_gateway_resource.frontend_proxy[0].id
  http_method = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code = aws_api_gateway_method_response.frontend_proxy_200[0].status_code
  response_parameters = {
    "method.response.header.Content-Length" = "integration.response.header.Content-Length"
    "method.response.header.Content-Type"   = "integration.response.header.Content-Type"
    "method.response.header.Timestamp"      = "integration.response.header.Date"
    "method.response.header.Cache-Control"  = "integration.response.header.Cache-Control"
  }
  depends_on = [aws_api_gateway_integration.frontend_proxy]
}

resource "aws_api_gateway_integration_response" "frontend_proxy_4xx" {
  count             = var.with_frontend_stack ? 1 : 0
  rest_api_id       = aws_api_gateway_rest_api.this.id
  resource_id       = aws_api_gateway_resource.frontend_proxy[0].id
  http_method       = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code       = aws_api_gateway_method_response.frontend_proxy_400[0].status_code
  selection_pattern = "4\\d{2}"
  depends_on        = [aws_api_gateway_integration.frontend_proxy]
}

resource "aws_api_gateway_integration_response" "frontend_proxy_5xx" {
  count             = var.with_frontend_stack ? 1 : 0
  rest_api_id       = aws_api_gateway_rest_api.this.id
  resource_id       = aws_api_gateway_resource.frontend_proxy[0].id
  http_method       = aws_api_gateway_method.frontend_proxy_get[0].http_method
  status_code       = aws_api_gateway_method_response.frontend_proxy_500[0].status_code
  selection_pattern = "5\\d{2}"
  depends_on        = [aws_api_gateway_integration.frontend_proxy]
}
