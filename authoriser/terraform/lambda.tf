module "this" {
  source  = "moritzzimmer/lambda/aws"
  version = "~> 7.5"

  description      = "authoriser"
  filename         = local.artifact
  function_name    = local.name_prefix
  handler          = "src/index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = filebase64sha256(local.artifact)
  timeout          = 3
  publish          = true
  environment = {
    variables = {
      ENVIRONMENT          = terraform.workspace
      GH_CLIENT_CONFIG_ARN = aws_ssm_parameter.gh_client_config.arn
    }
  }
  ssm = {
      parameter_names = [aws_ssm_parameter.gh_client_config.name]
  }

  cloudwatch_logs_retention_in_days = 90
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "live version"
  function_name    = module.this.arn
  function_version = module.this.version
}
