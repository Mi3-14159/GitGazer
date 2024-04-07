resource "aws_cognito_user_pool" "this" {
  name = data.terraform_remote_state.prerequisite.outputs.name_prefix
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
    authorize_scopes              = "openid user"
    authorize_url                 = "https://github.com/login/oauth/authorize"
    token_url                     = "${aws_api_gateway_stage.v1.invoke_url}/token"
    attributes_url                = "${aws_api_gateway_stage.v1.invoke_url}/user"
    jwks_uri                      = "${aws_api_gateway_stage.v1.invoke_url}/token"
    attributes_url_add_attributes = "false"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
    picture  = "avatar_url"
  }

  # idp_identifiers = ["Mi3s-orga"]
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = data.terraform_remote_state.prerequisite.outputs.name_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "this" {
  name                                 = "client"
  user_pool_id                         = aws_cognito_user_pool.this.id
  callback_urls                        = ["http://localhost:5173", "https://d3gb42ukfowr07.cloudfront.net"] # TODO: this is just for now to test
  logout_urls                          = ["http://localhost:5173", "https://d3gb42ukfowr07.cloudfront.net"]
  supported_identity_providers         = ["Github"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile", "aws.cognito.signin.user.admin"]
}
