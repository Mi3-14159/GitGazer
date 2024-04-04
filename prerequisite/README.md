<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | ~> 1.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_kms_alias.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_alias) | resource |
| [aws_kms_key.this](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kms_key) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region to deploy the resources | `string` | n/a | yes |
| <a name="input_github_organization"></a> [github\_organization](#input\_github\_organization) | GitHub organization to manage the repositories | `string` | n/a | yes |
| <a name="input_name_prefix"></a> [name\_prefix](#input\_name\_prefix) | Prefix to add to the name of the resources | `string` | `"gitgazer"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_aws_kms_key_id"></a> [aws\_kms\_key\_id](#output\_aws\_kms\_key\_id) | n/a |
| <a name="output_aws_region"></a> [aws\_region](#output\_aws\_region) | n/a |
| <a name="output_github_organization"></a> [github\_organization](#output\_github\_organization) | n/a |
| <a name="output_name_prefix"></a> [name\_prefix](#output\_name\_prefix) | n/a |
<!-- END_TF_DOCS -->