<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | ~> 1.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 5.43.0 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_dynamodb_table.jobs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [terraform_remote_state.prerequisite](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/data-sources/remote_state) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_enabled_pitr"></a> [enabled\_pitr](#input\_enabled\_pitr) | Enable point in time recovery for the DynamoDB table | `bool` | `false` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_jobs_danymodb_table_arn"></a> [jobs\_danymodb\_table\_arn](#output\_jobs\_danymodb\_table\_arn) | n/a |
| <a name="output_jobs_danymodb_table_name"></a> [jobs\_danymodb\_table\_name](#output\_jobs\_danymodb\_table\_name) | n/a |
<!-- END_TF_DOCS -->