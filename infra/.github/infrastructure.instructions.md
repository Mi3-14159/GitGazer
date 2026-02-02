---
applyTo: "infra/**/*.{tf,tfvars}"
---

# Infrastructure Development Instructions

This module contains the Terraform infrastructure as code for GitGazer's AWS resources.

## Terraform Commands

```bash
cd infra

# Initialize Terraform
terraform init

# Format Terraform files
terraform fmt

# Validate configuration
terraform validate

# Plan changes
terraform plan

# Apply changes
terraform apply

# Apply specific target
terraform apply -target module.lambda_store

# Destroy resources (use with caution)
terraform destroy
```

## Infrastructure Overview

GitGazer uses AWS serverless architecture with the following components:

### Core Services

- **API Gateway**: REST and WebSocket APIs
- **Lambda**: Multiple functions (API, Alerting, WebSocket, Analytics)
- **DynamoDB**: Job data storage with TTL
- **S3**: Lambda artifacts, UI hosting, analytics data
- **Cognito**: User authentication and authorization
- **CloudFront**: CDN for UI distribution
- **Route53**: DNS management
- **Step Functions**: Notification orchestration

### Security

- **KMS**: Encryption keys
- **Secrets Manager**: Sensitive configuration
- **IAM**: Fine-grained permissions

## Terraform Files

- `main.tf`: Provider and backend configuration
- `variables.tf`: Input variables
- `outputs.tf`: Output values
- `*.tf`: Resource-specific modules
  - `api_rest.tf` / `api_rest_lambda.tf`: REST API Gateway and Lambda
  - `api_websocket.tf` / `api_websocket_lambda.tf`: WebSocket API and Lambda
  - `alerting_lambda.tf`: Alerting Lambda function
  - `analytics_lambda.tf`: Analytics Lambda function
  - `cloudfront.tf`: CDN configuration
  - `cognito.tf`: Authentication setup
  - `dynamodb.tf`: Database tables
  - `s3_*.tf`: Storage buckets
  - `kms.tf`: Encryption keys
  - `secrets.tf`: Secrets management
  - `route53.tf`: DNS records

## Development Patterns

### Resource Naming

- Use consistent naming conventions
- Include environment in resource names
- Use tags for resource organization
- Follow AWS naming restrictions

### Terraform Workspaces

- Use workspaces for different environments
- Commands:
  ```bash
  terraform workspace list
  terraform workspace select dev
  terraform workspace new prod
  ```

### State Management

- Remote state in S3 (configured in `main.tf`)
- State locking with DynamoDB
- Never commit state files to git
- Use workspace-specific state

### Module Organization

- Each AWS service in separate file
- Related resources grouped together
- Use locals for computed values
- Keep files focused and maintainable

## Deployment Process

### Initial Setup

1. Create S3 bucket for Lambda artifacts first:

   ```bash
   terraform apply -target module.lambda_store
   ```

2. Build and upload Lambda functions:

   ```bash
   cd ../02_central
   npm ci
   npm run buildZip:api
   aws s3 cp ./dist/lambda.zip s3://<S3_BUCKET_LAMBDA_STORE>/gitgazer-api.zip
   # Repeat for other Lambda functions
   ```

3. Apply remaining infrastructure:

   ```bash
   cd ../infra
   terraform apply
   ```

4. Build and deploy frontend:
   ```bash
   cd ../04_frontend
   npm ci
   npm run build
   aws s3 sync dist/. s3://<UI_BUCKET_NAME>/
   ```

### Updates

- Plan before apply: Always run `terraform plan`
- Review changes carefully
- Apply in stages for large changes
- Test in dev environment first

### Lambda Updates

- Build new Lambda zip
- Upload to S3
- Terraform detects S3 object change
- Lambda function updated automatically

## Best Practices

### Security

- Enable encryption at rest (S3, DynamoDB)
- Use KMS for key management
- Implement least-privilege IAM policies
- Enable CloudTrail logging
- Use VPC where appropriate

### High Availability

- Multi-AZ deployments for DynamoDB
- S3 cross-region replication if needed
- CloudFront for global distribution
- Lambda automatic scaling

### Cost Optimization

- Use DynamoDB TTL for data cleanup
- Implement S3 lifecycle policies
- Right-size Lambda memory
- Monitor CloudWatch costs
- Use reserved capacity strategically

### Monitoring

- CloudWatch Logs for Lambda
- CloudWatch Metrics for all services
- Alarms for critical metrics
- X-Ray for tracing

## Variables and Configuration

### Required Variables

- `aws_region`: Target AWS region
- `environment`: Environment name (dev, staging, prod)
- `domain_name`: Route53 domain
- Others defined in `variables.tf`

### Sensitive Values

- Store in AWS Secrets Manager
- Reference via `data.aws_secretsmanager_secret`
- Never hardcode credentials
- Use environment variables for local dev

## Common Tasks

### Adding New Lambda Function

1. Create Lambda resource in new `.tf` file
2. Define IAM role and policies
3. Configure environment variables
4. Set up CloudWatch log group
5. Link to API Gateway if needed

### Modifying API Gateway

1. Update route definitions
2. Configure authorizers
3. Set up CORS if needed
4. Test with API Gateway console
5. Apply changes with Terraform

### Adding DynamoDB Table

1. Define table resource
2. Configure partition/sort keys
3. Set up GSIs if needed
4. Enable TTL for cleanup
5. Grant Lambda access

### Updating Cognito

1. Modify user pool configuration
2. Update app client settings
3. Configure OAuth flows
4. Update frontend environment variables
5. Test authentication flow

## Troubleshooting

### Terraform Errors

- Check AWS credentials and permissions
- Verify state lock is not stuck
- Review resource dependencies
- Check AWS service quotas
- Validate syntax with `terraform validate`

### Lambda Deployment Issues

- Verify zip file uploaded to S3
- Check Lambda permissions
- Review CloudWatch logs
- Validate environment variables
- Test with Lambda console

### API Gateway Issues

- Check authorizer configuration
- Verify Lambda integration
- Test with API Gateway test feature
- Review CloudWatch logs
- Check CORS configuration

## Linting and Validation

### TFLint

Configuration in `.tflint.hcl`:

```bash
# Install tflint
tflint --init

# Run linting
tflint
```

### Terraform Format

```bash
# Format all files
terraform fmt -recursive

# Check formatting
terraform fmt -check
```

## Important Notes

- Always use remote state with locking
- Test changes in non-production first
- Document complex resource relationships
- Use data sources to avoid hardcoding
- Keep module dependencies minimal
- Plan for disaster recovery
- Implement proper backup strategies
- Monitor costs regularly
- Use tags for resource tracking
- Follow AWS Well-Architected Framework
