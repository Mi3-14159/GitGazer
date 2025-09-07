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
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | ~> 1.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 6.3 |
| <a name="requirement_github"></a> [github](#requirement\_github) | ~> 6.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.10.0 |
| <a name="provider_github"></a> [github](#provider\_github) | 6.6.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_alerting_stepfunction"></a> [alerting\_stepfunction](#module\_alerting\_stepfunction) | terraform-aws-modules/step-functions/aws | ~> 5.0 |
| <a name="module_this"></a> [this](#module\_this) | moritzzimmer/lambda/aws | ~> 8.0 |
| <a name="module_ui_bucket"></a> [ui\_bucket](#module\_ui\_bucket) | terraform-aws-modules/s3-bucket/aws | ~> 5.2 |

## Resources

| Name | Type |
|------|------|
| [aws_apigatewayv2_api.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_api) | resource |
| [aws_apigatewayv2_authorizer.cognito](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_authorizer) | resource |
| [aws_apigatewayv2_integration.lambda](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_integration) | resource |
| [aws_apigatewayv2_route.api_routes](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_route.fe_failover](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_route.import_integration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_route) | resource |
| [aws_apigatewayv2_stage.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage) | resource |
| [aws_cloudfront_distribution.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution) | resource |
| [aws_cloudfront_origin_access_control.ui_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_cloudfront_response_headers_policy.cors_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_response_headers_policy) | resource |
| [aws_cloudwatch_event_connection.generic](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_connection) | resource |
| [aws_cloudwatch_log_group.gw_access_logs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_cognito_identity_provider.github](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_identity_provider) | resource |
| [aws_cognito_user_group.default](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_group) | resource |
| [aws_cognito_user_pool.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool) | resource |
| [aws_cognito_user_pool_client.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool_client) | resource |
| [aws_cognito_user_pool_domain.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool_domain) | resource |
| [aws_dynamodb_table.jobs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [aws_dynamodb_table.notification_rules](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [aws_iam_policy.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_policy) | resource |
| [aws_iam_role.alerting](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.invocation_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.invocation_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_kms_alias.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_key.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |
| [aws_kms_key_policy.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key_policy) | resource |
| [aws_lambda_alias.live](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_alias) | resource |
| [aws_lambda_permission.apigw](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_pipes_pipe.alerting](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/pipes_pipe) | resource |
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
| [aws_iam_policy_document.aws_kms_key_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.invocation_assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.invocation_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.s3_policy_cf_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_kms_secrets.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/kms_secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_apigateway_logging_enabled"></a> [apigateway\_logging\_enabled](#input\_apigateway\_logging\_enabled) | Enable logging of the HTTP API Gateway | `bool` | `true` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy the resources | `string` | n/a | yes |
| <a name="input_callback_uls"></a> [callback\_uls](#input\_callback\_uls) | List of callback URLs for the Cognito User Pool Client | `list(string)` | `[]` | no |
| <a name="input_create_gitgazer_alerting"></a> [create\_gitgazer\_alerting](#input\_create\_gitgazer\_alerting) | Create alerting for the GitGater resources | `bool` | `true` | no |
| <a name="input_create_github_organization_webhook"></a> [create\_github\_organization\_webhook](#input\_create\_github\_organization\_webhook) | Create a webhook in the GitHub organization. Can only be used if the var.github\_owner is an organization. | `bool` | `false` | no |
| <a name="input_create_github_repository_webhooks_repositories"></a> [create\_github\_repository\_webhooks\_repositories](#input\_create\_github\_repository\_webhooks\_repositories) | Create webhooks in the GitHub repositories. Can only be used if the var.github\_owner is a user. | `list(string)` | `[]` | no |
| <a name="input_custom_domain_config"></a> [custom\_domain\_config](#input\_custom\_domain\_config) | Configuration for the custom domain | <pre>object({<br/>    hosted_zone_id  = string<br/>    domain_name     = string<br/>    certificate_arn = string<br/>  })</pre> | `null` | no |
| <a name="input_enabled_pitr"></a> [enabled\_pitr](#input\_enabled\_pitr) | Enable point in time recovery for the DynamoDB table | `bool` | `false` | no |
| <a name="input_expire_in_sec"></a> [expire\_in\_sec](#input\_expire\_in\_sec) | Time in seconds for the jobs to expire | `number` | `86400` | no |
| <a name="input_gh_oauth_app_client_id_encrypted"></a> [gh\_oauth\_app\_client\_id\_encrypted](#input\_gh\_oauth\_app\_client\_id\_encrypted) | GitHub OAuth app client id, encrypted with KMS | `string` | n/a | yes |
| <a name="input_gh_oauth_app_client_secret_encrypted"></a> [gh\_oauth\_app\_client\_secret\_encrypted](#input\_gh\_oauth\_app\_client\_secret\_encrypted) | GitHub OAuth app client secret, encrypted with KMS | `string` | n/a | yes |
| <a name="input_gh_webhook_secret_encrypted"></a> [gh\_webhook\_secret\_encrypted](#input\_gh\_webhook\_secret\_encrypted) | GitHub webhook secret, encrypted with KMS | `string` | n/a | yes |
| <a name="input_github_oauth_scopes"></a> [github\_oauth\_scopes](#input\_github\_oauth\_scopes) | List of additional GitHub OAuth scopes to request | `list(string)` | `[]` | no |
| <a name="input_github_owner"></a> [github\_owner](#input\_github\_owner) | GitHub owner of the repositories, organization or user | `string` | n/a | yes |
| <a name="input_name_prefix"></a> [name\_prefix](#input\_name\_prefix) | Prefix to add to the name of the resources | `string` | `"gitgazer"` | no |
| <a name="input_with_frontend_stack"></a> [with\_frontend\_stack](#input\_with\_frontend\_stack) | Deploy the frontend stack | `bool` | `true` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_cdn_domain_name"></a> [cdn\_domain\_name](#output\_cdn\_domain\_name) | The domain name of the CloudFront distribution. |
<!-- END_TF_DOCS -->
