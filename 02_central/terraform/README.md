# Setup

Your token needs the `admin:org_hook` permission, add it to your token. It you are using the gh cli, you can add it by executing this:

```sh
gh auth refresh -h github.com -s admin:org_hook
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | ~> 1.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.0 |
| <a name="requirement_github"></a> [github](#requirement\_github) | ~> 6.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 5.46.0 |
| <a name="provider_github"></a> [github](#provider\_github) | 6.2.1 |
| <a name="provider_template"></a> [template](#provider\_template) | 2.2.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_alerting_stepfunction"></a> [alerting\_stepfunction](#module\_alerting\_stepfunction) | terraform-aws-modules/step-functions/aws | ~> 4.2 |
| <a name="module_jobs"></a> [jobs](#module\_jobs) | terraform-aws-modules/sqs/aws | ~> 4.1 |
| <a name="module_this"></a> [this](#module\_this) | moritzzimmer/lambda/aws | ~> 7.5 |
| <a name="module_ui_bucket"></a> [ui\_bucket](#module\_ui\_bucket) | terraform-aws-modules/s3-bucket/aws | ~> 4.1 |

## Resources

| Name | Type |
|------|------|
| [aws_apigatewayv2_api.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_api) | resource |
| [aws_apigatewayv2_integration.jobs_sqs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_integration) | resource |
| [aws_apigatewayv2_route.import](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_stage.default](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage) | resource |
| [aws_appsync_datasource.jobs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_datasource) | resource |
| [aws_appsync_datasource.notification_rules](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_datasource) | resource |
| [aws_appsync_datasource.users](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_datasource) | resource |
| [aws_appsync_domain_name.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_domain_name) | resource |
| [aws_appsync_domain_name_api_association.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_domain_name_api_association) | resource |
| [aws_appsync_function.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_function) | resource |
| [aws_appsync_graphql_api.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_graphql_api) | resource |
| [aws_appsync_resolver.units](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/appsync_resolver) | resource |
| [aws_cloudfront_distribution.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution) | resource |
| [aws_cloudfront_origin_access_control.ui_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_cloudwatch_event_connection.generic](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_connection) | resource |
| [aws_cloudwatch_log_group.appsync](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cloudwatch_log_group.gw_access_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_dynamodb_table.jobs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [aws_dynamodb_table.notification_rules](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [aws_dynamodb_table.users](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [aws_iam_policy.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_role.alerting](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.api_gw_sqs_integration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.service](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.service](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_kms_alias.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_key.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_kms_key_policy.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key_policy) | resource |
| [aws_lambda_alias.live](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_alias) | resource |
| [aws_pipes_pipe.alerting](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/pipes_pipe) | resource |
| [aws_route53_record.appsync_a](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.appsync_aaaa](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.cf_a](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_route53_record.cf_aaaa](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record) | resource |
| [aws_s3_bucket_policy.ui_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy) | resource |
| [aws_ssm_parameter.gh_webhook_secret](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [github_organization_webhook.imports](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/organization_webhook) | resource |
| [github_repository_webhook.imports](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_webhook) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_cloudfront_cache_policy.managed_caching_disabled](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_cache_policy) | data source |
| [aws_cloudfront_cache_policy.managed_caching_optimized](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_cache_policy) | data source |
| [aws_cloudfront_origin_request_policy.managed_all_viewer_except_host_header](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_origin_request_policy) | data source |
| [aws_iam_policy_document.alerting_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.alerting_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.api_gw_sqs_integration_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.api_gw_sqs_integration_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.aws_kms_key_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.logging_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.s3_policy_cf_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.service](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.service_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_kms_secrets.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/kms_secrets) | data source |
| [template_file.alerting_stepfunction](https://registry.terraform.io/providers/hashicorp/template/latest/docs/data-sources/file) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_api_aws_apigatewayv2_api_logging_enabled"></a> [api\_aws\_apigatewayv2\_api\_logging\_enabled](#input\_api\_aws\_apigatewayv2\_api\_logging\_enabled) | Enable logging of the HTTP API Gateway | `bool` | `true` | no |
| <a name="input_aws_appsync_graphql_api_additional_authentication_providers"></a> [aws\_appsync\_graphql\_api\_additional\_authentication\_providers](#input\_aws\_appsync\_graphql\_api\_additional\_authentication\_providers) | Additional authentication providers for the AppSync GraphQL API | <pre>list(object({<br>    authentication_type = string<br>    user_pool_config = optional(object({<br>      user_pool_id        = string<br>      app_id_client_regex = optional(string)<br>      aws_region          = optional(string)<br>    }))<br>  }))</pre> | `[]` | no |
| <a name="input_aws_appsync_graphql_api_logging_enabled"></a> [aws\_appsync\_graphql\_api\_logging\_enabled](#input\_aws\_appsync\_graphql\_api\_logging\_enabled) | Enable logging of the AppSync GraphQL API | `bool` | `true` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy the resources | `string` | n/a | yes |
| <a name="input_create_gitgazer_alerting"></a> [create\_gitgazer\_alerting](#input\_create\_gitgazer\_alerting) | Create alerting for the GitGater resources | `bool` | `true` | no |
| <a name="input_create_github_organization_webhook"></a> [create\_github\_organization\_webhook](#input\_create\_github\_organization\_webhook) | Create a webhook in the GitHub organization. Can only be used if the var.github\_owner is an organization. | `bool` | `false` | no |
| <a name="input_create_github_repository_webhooks_repositories"></a> [create\_github\_repository\_webhooks\_repositories](#input\_create\_github\_repository\_webhooks\_repositories) | Create webhooks in the GitHub repositories. Can only be used if the var.github\_owner is a user. | `list(string)` | `[]` | no |
| <a name="input_custom_domain_config"></a> [custom\_domain\_config](#input\_custom\_domain\_config) | Configuration for the custom domain | <pre>object({<br>    hosted_zone_id  = string<br>    domain_name     = string<br>    certificate_arn = string<br>  })</pre> | `null` | no |
| <a name="input_enabled_pitr"></a> [enabled\_pitr](#input\_enabled\_pitr) | Enable point in time recovery for the DynamoDB table | `bool` | `false` | no |
| <a name="input_expire_in_sec"></a> [expire\_in\_sec](#input\_expire\_in\_sec) | Time in seconds for the jobs to expire | `number` | `604800` | no |
| <a name="input_gh_webhook_secret_encrypted"></a> [gh\_webhook\_secret\_encrypted](#input\_gh\_webhook\_secret\_encrypted) | GitHub webhook secret, encrypted with KMS | `string` | n/a | yes |
| <a name="input_github_owner"></a> [github\_owner](#input\_github\_owner) | GitHub owner of the repositories, organization or user | `string` | n/a | yes |
| <a name="input_name_prefix"></a> [name\_prefix](#input\_name\_prefix) | Prefix to add to the name of the resources | `string` | `"gitgazer"` | no |
| <a name="input_with_frontend_stack"></a> [with\_frontend\_stack](#input\_with\_frontend\_stack) | Deploy the frontend stack | `bool` | `true` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_aws_appsync_graphql_api_arn"></a> [aws\_appsync\_graphql\_api\_arn](#output\_aws\_appsync\_graphql\_api\_arn) | The ARN of the AppSync GraphQL API. |
| <a name="output_aws_appsync_graphql_uris"></a> [aws\_appsync\_graphql\_uris](#output\_aws\_appsync\_graphql\_uris) | The URIs of the AppSync GraphQL API. |
| <a name="output_aws_dynamodb_table_users_name"></a> [aws\_dynamodb\_table\_users\_name](#output\_aws\_dynamodb\_table\_users\_name) | n/a |
| <a name="output_cdn_domain_name"></a> [cdn\_domain\_name](#output\_cdn\_domain\_name) | The domain name of the CloudFront distribution. |
| <a name="output_jobs_sqs_queue_arn"></a> [jobs\_sqs\_queue\_arn](#output\_jobs\_sqs\_queue\_arn) | The ARN of the SQS queue that jobs are sent to. |
<!-- END_TF_DOCS -->
