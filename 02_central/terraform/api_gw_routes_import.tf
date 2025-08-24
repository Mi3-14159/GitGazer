resource "aws_api_gateway_resource" "import" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api_root.id
  path_part   = "import"
}

resource "aws_api_gateway_resource" "integration" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.import.id
  path_part   = "{integrationId}"
}
resource "aws_api_gateway_method" "this" {
  authorization = "NONE"
  http_method   = "POST"
  resource_id   = aws_api_gateway_resource.integration.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
}

resource "aws_api_gateway_integration" "this" {
  http_method             = aws_api_gateway_method.this.http_method
  resource_id             = aws_api_gateway_resource.integration.id
  rest_api_id             = aws_api_gateway_rest_api.this.id
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_alias.live.invoke_arn
}
