# GitGazer

GitGazer aims to be a monitoring tool for the github workflows. It provides a workflows overview and a notification system.

A demo is available at <https://app.gitgazer.com/>

After login you will need to create an [integraton](https://app.gitgazer.com/integrations) and setup a webhook in github. Afterwards you will recieve github workflow status updates and view those on the [dashboard](https://app.gitgazer.com/dashboard). You can also create a [notification](https://app.gitgazer.com/notifications) rule to get notified in case of a failing workflow. Detailed instructions are down below beginning with bullet point `5.`

## Development

Recommended use of [asdf](https://asdf-vm.com/) to manage your runtime versions.

## How to install

1. you need to create the core.

```bash
cd 02_central
npm ci
npm run buildZip
cd terraform
terraform apply
```

2. this is to update the code settings. Set the `aws_appsync_graphql_api_additional_authentication_providers` variable and apply terraform again.
3. build the frontend and sync it to s3

You first need to set these environment variables in `.env.local`, replace the values with yours.

```bash
➜  04_frontend git:(main) ✗ cat .env.local
VITE_HOST_URL="http://localhost:5173"
VITE_COGNITO_DOMAIN="gitgazer-default.auth.eu-central-1.amazoncognito.com"
VITE_COGNITO_USER_POOL_ID="eu-central-1_BVsGhTzPa"
VITE_COGNITO_USER_POOL_CLIENT_ID="1el0phv4ansjj4f81qik0o0m07"
VITE_GRAPHQL_ENDPOINT="https://api.app.gitgazer.com/graphql"
VITE_GRAPHQL_REGION="eu-central-1"
VITE_IMPORT_URL_BASE="https://app.gitgazer.com/v1/api/import/"
```

Not build and publish the app.

```bash
npm ci
npm run build
aws s3 sync dist/. s3://<UIS_BUCKET_NAME>/ --cache-control max-age=604800 --exclude "*.html"
aws s3 sync dist/. s3://<UIS_BUCKET_NAME>/ --cache-control max-age=60 --include "*.html"
```

5. Go to the application <https://your-domain/> and login
6. Go to the `Integrations` page and click `Add`
7. Create a webhook on a [repository](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks#creating-a-repository-webhook) or [organisation](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks#creating-an-organization-webhook). Use the `Webhook payload URL` and `Secret` from the created Integration and set the Content Type to `application/json`.
8. If you want notifications about failed jobs, go to `Notifications` in your GitGazer app and click `Add`.
   - All `*` Fields are mandatory.
   - GitGazer will send a http request to the specified URL
   - The message must be in a format compatible to the AWS Step-Functions [States.Format](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-intrinsic-functions.html#asl-intrsc-func-generic) function.
   - Only the Workflow Name is passed to the template e.g. `Workflow '{}' failed.'
