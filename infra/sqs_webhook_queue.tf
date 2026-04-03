resource "aws_sqs_queue" "webhook_events_dlq" {
  name                       = "${var.name_prefix}-webhook-events-dlq-${terraform.workspace}.fifo"
  fifo_queue                 = true
  message_retention_seconds  = 60 * 60 * 24 * 14 # 14 days
  kms_master_key_id          = aws_kms_key.this.id
  visibility_timeout_seconds = 120
}

resource "aws_sqs_queue" "webhook_events" {
  name                        = "${var.name_prefix}-webhook-events-${terraform.workspace}.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  deduplication_scope         = "messageGroup"
  fifo_throughput_limit       = "perMessageGroupId"
  visibility_timeout_seconds  = local.worker_lambda_timeout_seconds * 1.5
  message_retention_seconds   = 60 * 60 * 24 # 1 day
  receive_wait_time_seconds   = 5            # long polling
  kms_master_key_id           = aws_kms_key.this.id
  max_message_size            = 1024 * 1024

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_events_dlq.arn
    maxReceiveCount     = 1
  })
}

resource "aws_cloudwatch_metric_alarm" "webhook_dlq_depth" {
  alarm_name          = "${var.name_prefix}-webhook-dlq-depth-${terraform.workspace}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Webhook events landing in DLQ — investigate failed event processing"

  dimensions = {
    QueueName = aws_sqs_queue.webhook_events_dlq.name
  }
}
