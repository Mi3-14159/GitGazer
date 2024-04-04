output "lambda_invoke_name" {
  value = aws_lambda_alias.live.name
}

output "lambda_invoke_arn" {
  value = aws_lambda_alias.live.invoke_arn
}

output "lambda_name" {
  value = module.this.function_name
}
