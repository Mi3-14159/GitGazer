# GitGazer

<p align="center">
   <img src="./docs/logo.png" alt="GitGazer Logo" width="200" height="auto">
</p>

GitGazer aims to be a monitoring tool for the github workflows. It provides a workflows overview and a notification system.

A demo is available at <https://app.gitgazer.com/>

After login you will need to create an [integraton](https://app.gitgazer.com/integrations) and setup a webhook in github. Afterwards you will recieve github workflow status updates and view those on the [dashboard](https://app.gitgazer.com/dashboard). You can also create a [notification](https://app.gitgazer.com/notifications) rule to get notified in case of a failing workflow. Detailed instructions are down below beginning with bullet point `5.`

## Development

Recommended use of [asdf](https://asdf-vm.com/) to manage your runtime versions.

## Security

GitGazer implements security best practices for authentication:

- **HttpOnly Cookies**: Authentication tokens are stored in httpOnly cookies, preventing JavaScript access and protecting against XSS attacks
- **CSRF Protection**: SameSite=Strict cookie attribute prevents cross-site request forgery
- **Secure Transport**: Cookies use the Secure flag to ensure HTTPS-only transmission in production
- **Token Expiration**: Access tokens expire after 1 hour, refresh tokens after 30 days
- **OAuth 2.0**: GitHub OAuth integration via AWS Cognito for secure authentication

For detailed information about the authentication implementation, see [docs/COOKIE_AUTHENTICATION.md](docs/COOKIE_AUTHENTICATION.md).

## How to install

1. [First you need to create the S3 bucket where the Lambda artifacts are stored](#first-you-need-to-create-the-s3-bucket-where-the-lambda-artifacts-are-stored)
2. [Now build and upload the Lambda functions](#now-build-and-upload-the-lambda-functions)
3. [Apply the rest of the infrastructure](#apply-the-rest-of-the-infrastructure)
4. [Build the frontend and sync it to s3](#build-the-frontend-and-sync-it-to-s3)

### First you need to create the S3 bucket where the Lambda artifacts are stored

```bash
cd infra
terraform init
terraform apply -target module.lambda_store
```

### Now build and upload the Lambda functions

```bash
cd 02_central
npm ci

npm run buildZip:api
aws s3 cp ./dist/lambda.zip s3://<S3_BUCKET_LAMBDA_STORE>/gitgazer-api.zip

npm run buildZip:alerting
aws s3 cp ./dist/lambda.zip s3://<S3_BUCKET_LAMBDA_STORE>/gitgazer-alerting.zip
```

### Apply the rest of the infrastructure

```bash
cd ../infra
terraform apply
```

### Build the frontend and sync it to s3

You first need to set these environment variables in `.env.local`, replace the values with yours.

```bash
➜  04_frontend git:(main) ✗ cat .env.local
VITE_HOST_URL="http://localhost:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/v1/api/import/"
VITE_REST_API_REGION="<API_REGION>"
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
```

Now build and publish the web app.

```bash
npm ci
npm run build
aws s3 sync dist/. s3://<UIS_BUCKET_NAME>/ --cache-control max-age=604800 --exclude "*.html"
aws s3 sync dist/. s3://<UIS_BUCKET_NAME>/ --cache-control max-age=60 --include "*.html"
```

## Setup

1. Go to the application https://<GITGAZER_DOMAIN>/ and login
2. Go to the `Integrations` page and click `Add`
3. Create a webhook on a [repository](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks#creating-a-repository-webhook) or [organisation](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks#creating-an-organization-webhook). Use the `Webhook payload URL` and `Secret` from the created Integration and set the Content Type to `application/json`.
4. If you want notifications about failed jobs, go to `Notifications` in your GitGazer app and click `Add`.
   - Fill out the form and click the Save button
