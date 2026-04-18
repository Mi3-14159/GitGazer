---
sidebar_position: 2
title: Setting Up Integrations
description: Connect GitGazer to your GitHub repositories via the GitHub App or manual webhooks.
---

# Setting Up Integrations

An **integration** connects GitGazer to a GitHub organization or user account. It's the top-level container for all your monitored workflows, notification rules, and team members.

## Create an Integration

### Option A: Install the GitHub App (Recommended)

The GitHub App is the simplest way to connect — it handles webhook configuration automatically.

1. Go to the **Integrations** page.
2. Click **Install GitHub App** in the header. This opens GitHub in a new tab.
3. Choose the organization or account to install on.
4. Select **All repositories** or choose specific repositories.
5. Click **Install**. You're redirected back to GitGazer.
6. In the dialog that appears, choose:
    - **Create new integration** — enter a label and click **Create and Link**.
    - **Link to existing integration** — select an unlinked integration from the dropdown.

GitGazer immediately starts receiving webhook events from your selected repositories.

### Option B: Manual Webhook

If you prefer to manage webhooks yourself (e.g., for a single repository):

1. Go to the **Integrations** page.
2. Click **New Integration**.
3. Enter a label (e.g., "My Org") and click **Create**.
4. On the new integration card, copy the **Webhook URL** and **Secret**.
5. In GitHub, create a webhook on your repository or organization:
    - **Payload URL**: paste the webhook URL from step 4.
    - **Content type**: `application/json`.
    - **Secret**: paste the secret from step 4.
    - **Events**: select **Workflow runs** and **Workflow jobs** (and optionally **Pull requests** and **Pull request reviews**).

## Manage Integrations

Each integration appears as a card on the Integrations page.

### Webhook URL & Secret

- **Copy the webhook URL** using the copy button next to the URL field.
- **View the secret** by clicking the eye icon. Click again to hide it.
- **Copy the secret** using the copy button.

### Rotate Webhook Secret

If a secret is compromised, rotate it:

1. Click the **rotate** button on the integration card.
2. Confirm in the dialog — this action is permanent.
3. Copy the new secret and update it in your GitHub webhook settings.

:::warning
After rotating, your existing GitHub webhook will stop working until you update the secret on the GitHub side.
:::

### Rename an Integration

Click the integration label to edit it inline. Press Enter or click away to save.

_Requires **admin** role or higher._

### Delete an Integration

1. Click the **delete** button on the integration card.
2. Type the exact integration label to confirm.
3. Click **Delete Integration**.

_Requires **owner** role. This action is permanent and removes all associated data._

### Leave an Integration

If you no longer need access, click **Leave** on the integration card. You'll need an admin to re-invite you if you want access again.

_Available to all members except the owner._

## GitHub App Settings

When a GitHub App installation is linked to an integration, you can manage:

### Webhook Event Subscriptions

Control which GitHub event types GitGazer receives:

| Event Type            | What It Captures                                     |
| --------------------- | ---------------------------------------------------- |
| `workflow_run`        | Workflow run starts, completions, and status changes |
| `workflow_job`        | Individual job starts, completions, and failures     |
| `pull_request`        | Pull request opens, closes, merges, and updates      |
| `pull_request_review` | Review submissions and state changes                 |

Click the webhook events section to toggle event types on or off.

_Requires **admin** role or higher._

### Org Sync Default Role

When GitHub organization members are auto-synced to GitGazer, they receive a default role. You can set this to:

- **Viewer** — read-only access (default)
- **Member** — can create notification rules
- **Admin** — full management access

_Requires **admin** role or higher._

### Unlink GitHub App

To disconnect the GitHub App installation from an integration:

1. Click the **unlink** button.
2. Confirm in the dialog.

This removes the link in GitGazer but does **not** uninstall the GitHub App from your GitHub account.

## What's Next

- **[Monitor your workflows](workflows)** — see workflow runs from your connected repositories.
- **[Set up notifications](notifications)** — get alerted when workflows fail.
- **[Manage team members](team-management)** — invite colleagues and assign roles.
