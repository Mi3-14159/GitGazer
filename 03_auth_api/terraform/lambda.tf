module "this" {
  source  = "moritzzimmer/lambda/aws"
  version = "~> 7.5"

  description      = "cognito <-> github auth proxy"
  filename         = local.artifact
  function_name    = local.name_prefix
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 5
  publish          = true
  environment = {
    variables = {
      ENVIRONMENT  = terraform.workspace
      ROUTE_PREFIX = local.api_gateway_stage_name
    }
  }
  kms_key_arn                       = data.aws_kms_key.this.arn
  cloudwatch_logs_retention_in_days = 90
  cloudwatch_logs_kms_key_id        = data.aws_kms_key.this.arn
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "live version"
  function_name    = module.this.arn
  function_version = module.this.version
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = module.this.function_name
  principal     = "apigateway.amazonaws.com"
  qualifier     = aws_lambda_alias.live.name
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*"
}
