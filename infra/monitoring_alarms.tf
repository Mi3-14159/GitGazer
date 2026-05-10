resource "aws_sns_topic" "cloudwatch_alarms" {
  count = var.enable_cloudwatch_alarm_notifications ? 1 : 0
  name  = "${var.name_prefix}-cloudwatch-alarms-${terraform.workspace}"
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.monitored_lambda_alarm_config

  alarm_name          = "${var.name_prefix}-lambda-${each.key}-errors-${terraform.workspace}"
  alarm_description   = "Lambda ${each.value.function_name} has invocation errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value.function_name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = local.monitoring_alarm_actions
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each = local.monitored_lambda_alarm_config

  alarm_name          = "${var.name_prefix}-lambda-${each.key}-throttles-${terraform.workspace}"
  alarm_description   = "Lambda ${each.value.function_name} is being throttled"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value.function_name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration_p95" {
  for_each = local.monitored_lambda_alarm_config

  alarm_name          = "${var.name_prefix}-lambda-${each.key}-duration-p95-${terraform.workspace}"
  alarm_description   = "Lambda ${each.value.function_name} p95 duration is approaching timeout"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = each.value.duration_threshold_ms
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value.function_name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "api_http_5xx" {
  alarm_name          = "${var.name_prefix}-http-api-5xx-${terraform.workspace}"
  alarm_description   = "HTTP API is returning 5xx errors"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.this.id
    Stage = aws_apigatewayv2_stage.this.name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "api_http_latency_p95" {
  alarm_name          = "${var.name_prefix}-http-api-latency-p95-${terraform.workspace}"
  alarm_description   = "HTTP API p95 latency is elevated"
  namespace           = "AWS/ApiGateway"
  metric_name         = "Latency"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 3000
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.this.id
    Stage = aws_apigatewayv2_stage.this.name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "api_websocket_5xx" {
  alarm_name          = "${var.name_prefix}-websocket-api-5xx-${terraform.workspace}"
  alarm_description   = "WebSocket API is returning 5xx errors"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.websocket.id
    Stage = aws_apigatewayv2_stage.websocket_ws.name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "webhook_queue_backlog_visible" {
  alarm_name          = "${var.name_prefix}-webhook-queue-backlog-visible-${terraform.workspace}"
  alarm_description   = "Webhook SQS queue backlog is building up"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 100
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.webhook_events.name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "webhook_queue_oldest_message_age" {
  alarm_name          = "${var.name_prefix}-webhook-queue-oldest-message-age-${terraform.workspace}"
  alarm_description   = "Webhook SQS queue oldest message age is elevated"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.webhook_events.name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "aurora_db_connections_high" {
  alarm_name          = "${var.name_prefix}-aurora-db-connections-high-${terraform.workspace}"
  alarm_description   = "Aurora cluster has high database connection count"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = module.db.cluster_id
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "aurora_acu_utilization_high" {
  count = startswith(coalesce(var.db_config.instance_class, ""), "db.serverless") ? 1 : 0

  alarm_name          = "${var.name_prefix}-aurora-acu-utilization-high-${terraform.workspace}"
  alarm_description   = "Aurora Serverless v2 ACU utilization is high"
  namespace           = "AWS/RDS"
  metric_name         = "ACUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 90
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = module.db.cluster_id
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "aurora_deadlocks" {
  alarm_name          = "${var.name_prefix}-aurora-deadlocks-${terraform.workspace}"
  alarm_description   = "Aurora deadlocks detected"
  namespace           = "AWS/RDS"
  metric_name         = "Deadlocks"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBClusterIdentifier = module.db.cluster_id
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "aurora_free_local_storage_low" {
  for_each = module.db.cluster_members

  alarm_name          = "${var.name_prefix}-aurora-free-local-storage-low-${each.value}-${terraform.workspace}"
  alarm_description   = "Aurora instance ${each.value} has low free local storage"
  namespace           = "AWS/RDS"
  metric_name         = "FreeLocalStorage"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 5368709120 # 5 GiB
  comparison_operator = "LessThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = each.value
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_ui_5xx_error_rate" {
  alarm_name          = "${var.name_prefix}-cloudfront-ui-5xx-rate-${terraform.workspace}"
  alarm_description   = "UI CloudFront 5xx error rate is elevated"
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.this.id
    Region         = "Global"
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_docs_5xx_error_rate" {
  count = var.docs_config.enabled ? 1 : 0

  alarm_name          = "${var.name_prefix}-cloudfront-docs-5xx-rate-${terraform.workspace}"
  alarm_description   = "Docs CloudFront 5xx error rate is elevated"
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.docs[0].id
    Region         = "Global"
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
}

resource "aws_cloudwatch_metric_alarm" "org_sync_schedule_failed_invocations" {
  alarm_name          = "${var.name_prefix}-org-sync-schedule-failed-invocations-${terraform.workspace}"
  alarm_description   = "EventBridge org sync schedule has failed invocations"
  namespace           = "AWS/Events"
  metric_name         = "FailedInvocations"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    RuleName = aws_cloudwatch_event_rule.org_sync_schedule.name
  }

  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = local.monitoring_alarm_actions
  insufficient_data_actions = []
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
  datapoints_to_alarm = 1

  dimensions = {
    QueueName = aws_sqs_queue.webhook_events_dlq.name
  }

  treat_missing_data        = "notBreaching"
  alarm_actions             = local.monitoring_alarm_actions
  ok_actions                = local.monitoring_alarm_actions
  insufficient_data_actions = []
}
