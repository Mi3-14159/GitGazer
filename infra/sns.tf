resource "aws_sns_topic" "cloudwatch_alarms" {
  count = var.enable_cloudwatch_alarm_notifications ? 1 : 0
  name  = "${var.name_prefix}-cloudwatch-alarms-${terraform.workspace}"
}
