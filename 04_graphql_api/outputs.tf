output "jobs_danymodb_table_arn" {
  value = aws_dynamodb_table.jobs.arn
}

output "jobs_danymodb_table_name" {
  value = aws_dynamodb_table.jobs.name
}

output "aws_appsync_graphql_api_arn" {
  value = aws_appsync_graphql_api.this.arn
}
