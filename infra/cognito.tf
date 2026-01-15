resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-${terraform.workspace}"
}

resource "aws_cognito_identity_provider" "github" {
  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Github"
  provider_type = "OIDC"

  provider_details = {
    client_id                     = data.aws_kms_secrets.this.plaintext["gh_oauth_app_client_id"]
    client_secret                 = data.aws_kms_secrets.this.plaintext["gh_oauth_app_client_secret"]
    attributes_request_method     = "GET"
    oidc_issuer                   = "https://github.com"
    authorize_scopes              = local.github_oauth_scopes
    authorize_url                 = "https://github.com/login/oauth/authorize"
    token_url                     = "${aws_apigatewayv2_api.this.api_endpoint}/api/auth/cognito/token"
    attributes_url                = "${aws_apigatewayv2_api.this.api_endpoint}/api/auth/cognito/user"
    jwks_uri                      = "${aws_apigatewayv2_api.this.api_endpoint}/api/auth/cognito/token"
    attributes_url_add_attributes = "false"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
    picture  = "avatar_url"
    nickname = "login"
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${var.name_prefix}-${terraform.workspace}"
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "this" {
  name                                 = "client"
  user_pool_id                         = aws_cognito_user_pool.this.id
  callback_urls                        = distinct(compact(concat(["http://localhost:5173"], var.callback_uls, [try(format("https://%s", var.custom_domain_config.domain_name), null)])))
  logout_urls                          = distinct(compact(concat(["http://localhost:5173"], var.callback_uls, [try(format("https://%s", var.custom_domain_config.domain_name), null)])))
  supported_identity_providers         = [aws_cognito_identity_provider.github.provider_name]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile", "aws.cognito.signin.user.admin"]
}

resource "aws_cognito_identity_pool" "this" {
  identity_pool_name               = "${var.name_prefix}-${terraform.workspace}"
  allow_unauthenticated_identities = false
  allow_classic_flow               = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.this.id
    provider_name           = aws_cognito_user_pool.this.endpoint
    server_side_token_check = false
  }
}

resource "aws_iam_role" "cognito_authenticated" {
  name = "${var.name_prefix}-cognito-authenticated-role-${terraform.workspace}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.this.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "cognito_authenticated_websocket" {
  name = "${var.name_prefix}-cognito-websocket-policy-${terraform.workspace}"
  role = aws_iam_role.cognito_authenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "execute-api:Invoke"
        ]
        Resource = [
          "${aws_apigatewayv2_api.websocket.execution_arn}/${aws_apigatewayv2_stage.websocket_ws.name}/*"
        ]
      }
    ]
  })
}

resource "aws_cognito_identity_pool_roles_attachment" "this" {
  identity_pool_id = aws_cognito_identity_pool.this.id

  roles = {
    "authenticated" = aws_iam_role.cognito_authenticated.arn
  }
}
