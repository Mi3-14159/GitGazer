resource "aws_cloudwatch_event_connection" "generic" {
  name               = "${var.name_prefix}-alerting-${terraform.workspace}"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "gitgazer"
      value = "true"
    }
  }
}
