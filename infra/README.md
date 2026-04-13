# Setup

Your token needs the `admin:org_hook` permission, add it to your token. It you are using the gh cli, you can add it by executing this:

```sh
gh auth refresh -h github.com -s admin:org_hook
```

If you want to enabled API Gateway logging, you will need to setup the global account Cloudwatch Logs role ARN.
Replace `AWS_REGION` in [https://eu-central-1.console.aws.amazon.com/apigateway/main/settings?api=unselected&region=<AWS_REGION>](https://eu-central-1.console.aws.amazon.com/apigateway/main/settings?api=unselected&region=<AWS_REGION>)

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | ~> 1.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 6.3 |
| <a name="requirement_awscc"></a> [awscc](#requirement\_awscc) | ~> 1.0 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.6 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.39.0 |
| <a name="provider_awscc"></a> [awscc](#provider\_awscc) | 1.78.0 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.8.1 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| <a name="module_db"></a> [db](#module\_db) | terraform-aws-modules/rds-aurora/aws | ~> 10.2 |
| <a name="module_docs_bucket"></a> [docs\_bucket](#module\_docs\_bucket) | terraform-aws-modules/s3-bucket/aws | ~> 5.2 |
| <a name="module_lambda_store"></a> [lambda\_store](#module\_lambda\_store) | terraform-aws-modules/s3-bucket/aws | ~> 5.9 |
| <a name="module_rds_proxy"></a> [rds\_proxy](#module\_rds\_proxy) | terraform-aws-modules/rds-proxy/aws | ~> 4.4 |
| <a name="module_ui_bucket"></a> [ui\_bucket](#module\_ui\_bucket) | terraform-aws-modules/s3-bucket/aws | ~> 5.2 |
| <a name="module_vpc"></a> [vpc](#module\_vpc) | terraform-aws-modules/vpc/aws | ~> 6.0 |

## Resources

| Name | Type |
| ---- | ---- |
| [aws_apigatewayv2_api.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_api) | resource |
| [aws_apigatewayv2_api.websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_api) | resource |
| [aws_apigatewayv2_integration.lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_integration) | resource |
| [aws_apigatewayv2_integration.websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_integration) | resource |
| [aws_apigatewayv2_route.api_routes](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_route.fe_failover](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_route.import_integration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_route.websocket_connect](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_route.websocket_disconnect](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_stage.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage) | resource |
| [aws_apigatewayv2_stage.websocket_ws](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage) | resource |
| [aws_bedrock_guardrail.query_generation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrock_guardrail) | resource |
| [aws_bedrock_model_invocation_logging_configuration.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrock_model_invocation_logging_configuration) | resource |
| [aws_cloudfront_distribution.docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution) | resource |
| [aws_cloudfront_distribution.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution) | resource |
| [aws_cloudfront_function.docs_url_rewrite](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_function) | resource |
| [aws_cloudfront_origin_access_control.docs_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_cloudfront_origin_access_control.ui_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_cloudfront_response_headers_policy.cors_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_response_headers_policy) | resource |
| [aws_cloudfront_response_headers_policy.docs_security_headers](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_response_headers_policy) | resource |
| [aws_cloudfront_response_headers_policy.security_headers](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_response_headers_policy) | resource |
| [aws_cloudwatch_event_rule.org_sync_schedule](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.org_sync_scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.api](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.api_gateway_websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.api_gateway_websocket_access_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.api_websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.bedrock_invocation_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.gw_access_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.org_sync_scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.worker](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_metric_alarm.webhook_dlq_depth](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm) | resource |
| [aws_cognito_identity_pool.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_identity_pool) | resource |
| [aws_cognito_identity_pool_roles_attachment.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_identity_pool_roles_attachment) | resource |
| [aws_cognito_identity_provider.github](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_identity_provider) | resource |
| [aws_cognito_user_pool.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool) | resource |
| [aws_cognito_user_pool_client.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool_client) | resource |
| [aws_cognito_user_pool_domain.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool_domain) | resource |
| [aws_iam_instance_profile.bastion](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_instance_profile) | resource |
| [aws_iam_role.api](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.api_websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.bastion](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.bedrock_invocation_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.cognito_authenticated](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.invocation_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.org_sync_scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.worker](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.api](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.api_websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.bedrock_invocation_logs_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.cognito_authenticated_websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.invocation_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.org_sync_scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.worker](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.api_tracing_application_signals](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.api_tracing_lambda_insights](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.api_vpc_access](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.api_websocket_tracing_application_signals](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.api_websocket_tracing_lambda_insights](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.api_websocket_vpc_access](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.bastion_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.bastion_ssm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.org_sync_scheduler_vpc_access](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.worker_tracing_application_signals](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.worker_tracing_lambda_insights](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.worker_vpc_access](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_instance.bastion](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance) | resource |
| [aws_kms_alias.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_key.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_kms_key_policy.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key_policy) | resource |
| [aws_lambda_alias.api_websocket_live](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_alias) | resource |
| [aws_lambda_alias.live](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_alias) | resource |
| [aws_lambda_event_source_mapping.worker_sqs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_lambda_function.api](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_function.api_websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_function.org_sync_scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_function.worker](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.api_websocket_apigw](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.apigw](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_lambda_permission.org_sync_scheduler_eventbridge](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_route53_record.cf_a](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.cf_aaaa](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.docs_a](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.docs_aaaa](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_dkim](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_dmarc](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_mail_from_mx](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_mail_from_spf](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_verification](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_s3_bucket_policy.docs_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_policy.lambda_store](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_policy.ui_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_secretsmanager_secret.lambda_config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret) | resource |
| [aws_secretsmanager_secret_version.lambda_config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/secretsmanager_secret_version) | resource |
| [aws_security_group.bastion](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_security_group.lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_security_group.rds_proxy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_security_group_rule.bastion_to_rds_proxy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group_rule) | resource |
| [aws_security_group_rule.lambda_to_rds_proxy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group_rule) | resource |
| [aws_security_group_rule.rds_proxy_to_aurora](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group_rule) | resource |
| [aws_ses_configuration_set.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ses_configuration_set) | resource |
| [aws_ses_domain_dkim.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ses_domain_dkim) | resource |
| [aws_ses_domain_identity.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ses_domain_identity) | resource |
| [aws_ses_domain_identity_verification.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ses_domain_identity_verification) | resource |
| [aws_ses_domain_mail_from.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ses_domain_mail_from) | resource |
| [aws_sqs_queue.webhook_events](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue.webhook_events_dlq](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [awscc_bedrock_prompt.query_generation](https://registry.terraform.io/providers/hashicorp/awscc/latest/docs/resources/bedrock_prompt) | resource |
| [random_password.ws_token_secret](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/password) | resource |
| [aws_ami.amazon_linux_2023](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami) | data source |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_cloudfront_cache_policy.managed_caching_disabled](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_cache_policy) | data source |
| [aws_cloudfront_cache_policy.managed_caching_optimized](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_cache_policy) | data source |
| [aws_cloudfront_origin_request_policy.managed_all_viewer_except_host_header](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_origin_request_policy) | data source |
| [aws_iam_policy_document.api](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.api_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.api_websocket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.api_websocket_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.aws_kms_key_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.bastion_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.bedrock_invocation_logs_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.bedrock_invocation_logs_trust_relationship](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.invocation_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.invocation_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_store_s3_policy_cf_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.org_sync_scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.org_sync_scheduler_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.s3_policy_cf_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.s3_policy_cf_docs_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.worker](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.worker_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_kms_secrets.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/kms_secrets) | data source |
| [aws_lakeformation_data_lake_settings.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/lakeformation_data_lake_settings) | data source |
| [aws_rds_engine_version.postgresql](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/rds_engine_version) | data source |
| [aws_s3_object.api_lambda_function_archive](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/s3_object) | data source |
| [aws_s3_object.org_sync_scheduler_lambda_archive](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/s3_object) | data source |
| [aws_s3_object.websocket_lambda_function_archive](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/s3_object) | data source |
| [aws_s3_object.worker_lambda_function_archive](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/s3_object) | data source |
| [aws_ssoadmin_instances.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ssoadmin_instances) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_apigateway_logging_enabled"></a> [apigateway\_logging\_enabled](#input\_apigateway\_logging\_enabled) | Enable logging of the HTTP API Gateway | `bool` | `true` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy the resources | `string` | n/a | yes |
| <a name="input_callback_urls"></a> [callback\_urls](#input\_callback\_urls) | List of callback URLs for the Cognito User Pool Client | `list(string)` | `[]` | no |
| <a name="input_custom_domain_config"></a> [custom\_domain\_config](#input\_custom\_domain\_config) | Configuration for the custom domain | <pre>object({<br/>    hosted_zone_id  = string<br/>    domain_name     = string<br/>    certificate_arn = string<br/>  })</pre> | `null` | no |
| <a name="input_db_config"></a> [db\_config](#input\_db\_config) | Configuration for the RDS database | <pre>object({<br/>    engine_version              = optional(string, "17.7")<br/>    engine_mode                 = optional(string, "provisioned")<br/>    instance_class              = optional(string, "db.serverless")<br/>    vpc_id                      = optional(string)<br/>    availability_zones          = optional(list(string))<br/>    subnets                     = optional(list(string))<br/>    cluster_monitoring_interval = optional(number, 0)<br/>    serverlessv2_scaling_configuration = optional(object({<br/>      max_capacity             = number<br/>      min_capacity             = optional(number)<br/>      seconds_until_auto_pause = optional(number)<br/>      }), {<br/>      min_capacity             = 0.5<br/>      max_capacity             = 2<br/>      seconds_until_auto_pause = null<br/>    })<br/>    instances = optional(any, {<br/>      one = {}<br/>    })<br/>    cluster_performance_insights_retention_period = optional(number, 7)<br/>    enable_http_endpoint                          = optional(bool, true)<br/>  })</pre> | n/a | yes |
| <a name="input_docs_config"></a> [docs\_config](#input\_docs\_config) | Configuration for the documentation site (Docusaurus) | <pre>object({<br/>    enabled         = bool<br/>    domain_name     = optional(string)<br/>    certificate_arn = optional(string)<br/>    hosted_zone_id  = optional(string)<br/>  })</pre> | <pre>{<br/>  "enabled": false<br/>}</pre> | no |
| <a name="input_enable_bastion"></a> [enable\_bastion](#input\_enable\_bastion) | Whether to create a bastion host for database access via SSM Session Manager | `bool` | `false` | no |
| <a name="input_enable_bedrock_invocation_logging"></a> [enable\_bedrock\_invocation\_logging](#input\_enable\_bedrock\_invocation\_logging) | Enable logging of Bedrock model invocations | `bool` | `false` | no |
| <a name="input_enable_lambda_tracing"></a> [enable\_lambda\_tracing](#input\_enable\_lambda\_tracing) | Enable AWS X-Ray tracing for the Lambda functions | `bool` | `false` | no |
| <a name="input_gh_app"></a> [gh\_app](#input\_gh\_app) | GitHub App configuration (ID, KMS-encrypted private key and webhook secret) | <pre>object({<br/>    id                       = string<br/>    private_key_encrypted    = string<br/>    webhook_secret_encrypted = string<br/>  })</pre> | n/a | yes |
| <a name="input_gh_oauth_app_client_id_encrypted"></a> [gh\_oauth\_app\_client\_id\_encrypted](#input\_gh\_oauth\_app\_client\_id\_encrypted) | GitHub OAuth app client id, encrypted with KMS | `string` | n/a | yes |
| <a name="input_gh_oauth_app_client_secret_encrypted"></a> [gh\_oauth\_app\_client\_secret\_encrypted](#input\_gh\_oauth\_app\_client\_secret\_encrypted) | GitHub OAuth app client secret, encrypted with KMS | `string` | n/a | yes |
| <a name="input_github_oauth_scopes"></a> [github\_oauth\_scopes](#input\_github\_oauth\_scopes) | List of additional GitHub OAuth scopes to request | `list(string)` | `[]` | no |
| <a name="input_name_prefix"></a> [name\_prefix](#input\_name\_prefix) | Prefix to add to the name of the resources | `string` | `"gitgazer"` | no |
| <a name="input_ses_config"></a> [ses\_config](#input\_ses\_config) | SES configuration for sending invitation emails. Domain defaults to custom\_domain\_config.domain\_name if not set. | <pre>object({<br/>    enabled     = bool<br/>    domain      = optional(string)<br/>    from_prefix = optional(string, "noreply")<br/>  })</pre> | <pre>{<br/>  "enabled": false<br/>}</pre> | no |
| <a name="input_vpc"></a> [vpc](#input\_vpc) | Configuration for the VPC | <pre>object({<br/>    create = bool<br/>    config = optional(object({<br/>      cidr_block         = string<br/>      azs                = list(string)<br/>      public_subnets     = list(string)<br/>      private_subnets    = list(string)<br/>      enable_nat_gateway = optional(bool, true)<br/>      single_nat_gateway = optional(bool, false)<br/>    }))<br/>  })</pre> | <pre>{<br/>  "create": false<br/>}</pre> | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_bastion_instance_id"></a> [bastion\_instance\_id](#output\_bastion\_instance\_id) | Instance ID of the bastion host (use with SSM Session Manager) |
| <a name="output_bastion_ssm_port_forward_command"></a> [bastion\_ssm\_port\_forward\_command](#output\_bastion\_ssm\_port\_forward\_command) | Command to start an SSM port-forwarding session to the RDS Proxy |
| <a name="output_cdn_domain_name"></a> [cdn\_domain\_name](#output\_cdn\_domain\_name) | The domain name of the CloudFront distribution. |
| <a name="output_docs_cdn_domain_name"></a> [docs\_cdn\_domain\_name](#output\_docs\_cdn\_domain\_name) | The domain name of the docs CloudFront distribution |
| <a name="output_docs_s3_bucket_name"></a> [docs\_s3\_bucket\_name](#output\_docs\_s3\_bucket\_name) | The S3 bucket name for the docs site |
| <a name="output_ses_domain_identity_arn"></a> [ses\_domain\_identity\_arn](#output\_ses\_domain\_identity\_arn) | ARN of the SES domain identity for sending emails |
| <a name="output_ses_from_email"></a> [ses\_from\_email](#output\_ses\_from\_email) | The verified sender email address for SES |
| <a name="output_websocket_endpoint"></a> [websocket\_endpoint](#output\_websocket\_endpoint) | The WebSocket API endpoint URL |
<!-- END_TF_DOCS -->
