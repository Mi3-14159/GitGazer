---
sidebar_position: 2
title: GitHub App
description: Receive workflow runs, jobs and pull requests from GitHub, and manage the webhook secret, event subscriptions, org sync and linked installations.
---

# GitHub App

The **GitHub** app is how data gets into GitGazer. It receives workflow runs, workflow jobs, pull requests and reviews from GitHub, through linked GitHub App installations or a webhook you create yourself. Every new integration has it installed. To connect your first repositories, see [Create an Integration](../integrations.md#create-an-integration).

Its card on the **Apps** tab shows the number of linked installations and the org sync default role. Open the card to manage the app.

## Webhook URL & Secret

- **Copy the webhook URL** using the copy button next to the URL field.
- **View the secret** by clicking the eye icon. Click again to hide it.
- **Copy the secret** using the copy button.

_The webhook URL is visible to everyone in the integration. The secret is visible to **admin** role or higher; other members see that it is hidden._

## Rotate Webhook Secret

If a secret is compromised, rotate it:

1. Click **Rotate** next to the secret.
2. Confirm in the dialog — this action is permanent.
3. Copy the new secret and update it in your GitHub webhook settings.

:::warning
After rotating, your existing GitHub webhook will stop working until you update the secret on the GitHub side.
:::

## Webhook Event Subscriptions

Control which GitHub event types GitGazer receives:

| Event Type            | What It Captures                                     |
| --------------------- | ---------------------------------------------------- |
| `workflow_run`        | Workflow run starts, completions, and status changes |
| `workflow_job`        | Individual job starts, completions, and failures     |
| `pull_request`        | Pull request opens, closes, merges, and updates      |
| `pull_request_review` | Review submissions and state changes                 |

The events are listed per linked installation. Click **Edit** (or one of the event badges), toggle event types on or off, and click **Save**.

All event types are subscribed when an installation is linked.

_Requires **admin** role or higher._

## Org Sync Default Role

When GitHub organization members are auto-synced to GitGazer, they receive a default role. You can set this to:

- **Viewer** — read-only access (default)
- **Member** — can create notification rules
- **Admin** — full access except deleting the integration

_Requires **admin** role or higher._

## Link or Unlink a GitHub App Installation

If no installation is linked yet, click **Install on GitHub** in the GitHub app. Webhook events, org sync, and installations appear once an installation is linked.

To disconnect an installation from the integration:

1. Click **Unlink** next to the installation.
2. Confirm in the dialog.

This removes the link in GitGazer and the webhooks GitGazer created for that installation, but does **not** uninstall the GitHub App from your GitHub account.

_Requires **admin** role or higher._

## Remove the GitHub App

Click **Remove GitHub app** at the bottom of the GitHub app and confirm. GitGazer unlinks every GitHub App installation, removes the webhooks it created, and stops receiving new data for the integration; the webhook URL and secret stop working. Everything already collected — workflow runs, jobs, pull requests, and members — is kept. Installing the app again creates a new secret.

_Requires **admin** role or higher._

## What's Next

- **[Monitor your workflows](../workflows.md)** — see the runs GitGazer receives.
- **[Manage team members](../team-management.md)** — see who joined through org sync.
