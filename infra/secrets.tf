data "aws_kms_secrets" "this" {
  secret {
    name    = "gh_oauth_app_client_id"
    payload = var.gh_oauth_app_client_id_encrypted
  }

  secret {
    name    = "gh_oauth_app_client_secret"
    payload = var.gh_oauth_app_client_secret_encrypted
  }

  secret {
    name    = "gh_app_private_key"
    payload = var.gh_app.private_key_encrypted
  }

  secret {
    name    = "gh_app_webhook_secret"
    payload = var.gh_app.webhook_secret_encrypted
  }
}

resource "random_password" "ws_token_secret" {
  length  = 64
  special = false

  lifecycle {
    ignore_changes = [length, special]
  }
}

resource "aws_secretsmanager_secret" "lambda_config" {
  name                    = "${var.name_prefix}-lambda-config-${terraform.workspace}"
  description             = "Application configuration for ${var.name_prefix} Lambda functions (${terraform.workspace})"
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "lambda_config" {
  secret_id = aws_secretsmanager_secret.lambda_config.id
  secret_string = jsonencode({
    environment            = terraform.workspace
    corsOrigins            = local.cors_allowed_origins
    allowedFrontendOrigins = compact(concat(["https://${aws_cloudfront_distribution.this.domain_name}"], local.cors_allowed_origins))
    cognito = {
      userPoolId   = aws_cognito_user_pool.this.id
      clientId     = aws_cognito_user_pool_client.this.id
      clientSecret = aws_cognito_user_pool_client.this.client_secret
      domain       = "${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
      redirectUri  = "https://${var.custom_domain_config != null ? var.custom_domain_config.domain_name : format("%s.execute-api.%s.amazonaws.com", aws_apigatewayv2_api.this.id, var.aws_region)}/api/auth/callback"
    }
    websocket = {
      apiDomainName = replace(aws_apigatewayv2_api.websocket.api_endpoint, "wss://", "")
      apiStage      = aws_apigatewayv2_stage.websocket_ws.name
    }
    uiBucketName  = module.ui_bucket.s3_bucket_id
    importUrlBase = "https://${var.custom_domain_config != null ? var.custom_domain_config.domain_name : format("%s.execute-api.%s.amazonaws.com", aws_apigatewayv2_api.this.id, var.aws_region)}/api/import"
    githubApp = {
      id            = var.gh_app.id
      privateKey    = data.aws_kms_secrets.this.plaintext["gh_app_private_key"]
      webhookSecret = data.aws_kms_secrets.this.plaintext["gh_app_webhook_secret"]
    }
    wsTokenSecret         = random_password.ws_token_secret.result
    webhookQueueUrl       = aws_sqs_queue.webhook_events.url
    httpProxyFunctionName = var.enable_http_proxy ? aws_lambda_function.http_proxy[0].function_name : null
    sesConfig = var.ses_config.enabled ? {
      emailEnabled     = false
      fromEmail        = "${var.ses_config.from_prefix}@${local.ses_domain}"
      configurationSet = aws_ses_configuration_set.this[0].name
      appUrl           = "https://${var.custom_domain_config != null ? var.custom_domain_config.domain_name : aws_cloudfront_distribution.this.domain_name}"
    } : null
  })
}

###############################################################################
# Backfill PAT secrets (managed out-of-band)
#
# The serverless backfill worker resolves a GitHub personal access token per
# integration from Secrets Manager, using the convention:
#
#   ${var.name_prefix}/backfill/${terraform.workspace}/<integrationId>
#
# These secrets are created manually by an operator (one per integration) and
# are intentionally NOT managed by Terraform so tokens never live in state, e.g.:
#
#   aws secretsmanager create-secret \
#     --name "gitgazer/backfill/<workspace>/<integrationId>" \
#     --secret-string "<github-pat>"
#
# IAM access is scoped to the `<prefix>/*` pattern in backfill_queue.tf.
###############################################################################

