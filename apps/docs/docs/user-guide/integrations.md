---
sidebar_position: 2
title: Setting Up Integrations
description: Connect GitGazer to your GitHub repositories and set up apps, webhook handles, and settings for an integration.
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
4. Open the new integration, go to the **Apps** tab, and open the **GitHub** app.
5. Copy the **Webhook URL** and **Secret**.
6. In GitHub, create a webhook on your repository or organization:
    - **Payload URL**: paste the webhook URL from step 5.
    - **Content type**: `application/json`.
    - **Secret**: paste the secret from step 5.
    - **Events**: select **Workflow runs** and **Workflow jobs** (and optionally **Pull requests** and **Pull request reviews**).

## Open an Integration

The **Integrations** page lists all integrations you belong to. Click one to open its page, which has three tabs:

| Tab          | What It Holds                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Apps**     | The apps installed in the integration and a catalog of apps you can add.                      |
| **Members**  | The people with access and pending invitations. See [Managing Team Members](team-management). |
| **Settings** | Rename, leave, or delete the integration.                                                     |

## Apps

An **app** is a piece of GitGazer you install into an integration. The **Apps** tab shows the installed apps first, then a catalog.

| App         | What It Does                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| **GitHub**  | Receives workflow runs, jobs, and pull requests from GitHub.                                         |
| **Webhook** | Holds named Slack incoming webhooks that notification rules can send alerts to.                      |
| **Slack**   | Sends alerts to Slack channels and mentions the person behind a failure. See [Slack App](slack-app). |

New integrations include the GitHub app automatically. Open an app to see and change its settings.

:::info[Who can see what]

Everyone in the integration can see the installed apps and the names of webhook handles. Only **admins** and **owners** can see secrets and webhook URLs, and install or remove apps and manage handles.

:::

## GitHub App Settings

Open the **GitHub** app to manage how GitGazer receives data from GitHub.

### Webhook URL & Secret

- **Copy the webhook URL** using the copy button next to the URL field.
- **View the secret** by clicking the eye icon. Click again to hide it.
- **Copy the secret** using the copy button.

_Visible to **admin** role or higher._

### Rotate Webhook Secret

If a secret is compromised, rotate it:

1. Click the **rotate** button next to the secret.
2. Confirm in the dialog — this action is permanent.
3. Copy the new secret and update it in your GitHub webhook settings.

:::warning
After rotating, your existing GitHub webhook will stop working until you update the secret on the GitHub side.
:::

### Webhook Event Subscriptions

Control which GitHub event types GitGazer receives:

| Event Type            | What It Captures                                     |
| --------------------- | ---------------------------------------------------- |
| `workflow_run`        | Workflow run starts, completions, and status changes |
| `workflow_job`        | Individual job starts, completions, and failures     |
| `pull_request`        | Pull request opens, closes, merges, and updates      |
| `pull_request_review` | Review submissions and state changes                 |

Click the webhook events section to toggle event types on or off.

All event types are subscribed by default when an installation is linked.

_Requires **admin** role or higher._

### Org Sync Default Role

When GitHub organization members are auto-synced to GitGazer, they receive a default role. You can set this to:

- **Viewer** — read-only access (default)
- **Member** — can create notification rules
- **Admin** — full management access

_Requires **admin** role or higher._

### Link or Unlink a GitHub App Installation

If no installation is linked yet, click **Install the GitHub App** in the GitHub app. Webhook events, org sync, and installations appear once an installation is linked.

To disconnect an installation from the integration:

1. Click the **unlink** button next to the installation.
2. Confirm in the dialog.

This removes the link in GitGazer but does **not** uninstall the GitHub App from your GitHub account.

_Requires **admin** role or higher._

### Remove the GitHub App

Click **Remove GitHub app** at the bottom of the GitHub app and confirm. GitGazer stops receiving new data for the integration and the webhook URL and secret stop working. Everything already collected — workflow runs, jobs, pull requests, and members — is kept. Installing the app again creates a new secret.

_Requires **admin** role or higher._

## Webhook App Settings

The **Webhook** app holds **handles**. A handle is a name plus a Slack incoming webhook URL (starting with `https://hooks.slack.com/`). [Notification rules](notifications) send alerts to handles, so you paste each URL once and reuse it in many rules.

### Add a Handle

1. Open the **Webhook** app on the **Apps** tab. If it isn't installed yet, install it from the catalog.
2. Click **Add handle**.
3. Enter a **Name** (e.g., `#ci-alerts`) and the **Slack webhook URL**.
4. Save.

An app holds up to 20 handles. To get a Slack webhook URL, see [Setting Up a Slack Webhook](notifications#setting-up-a-slack-webhook).

### Move Handles to Slack Channels

If the integration also has a connected [Slack app](slack-app), the Webhook app's settings offer **Move to Slack channels** while handles for that workspace exist. It is the same offer as in the Slack app's settings; see [Move From Webhooks](slack-app#move-from-webhooks).

### Edit or Delete a Handle

Use the actions menu on a handle to change its name or URL, or to delete it. If rules use the handle, the dialog warns you before deleting. Those rules keep existing but show **No destination** and send nothing until you pick another handle.

_Adding, editing, and deleting handles requires **admin** role or higher. Other members see only the handle names._

## Integration Settings

Open the **Settings** tab of an integration to manage the integration itself.

### Rename an Integration

Edit the label and save.

_Requires **admin** role or higher._

### Delete an Integration

1. Click **delete** in the **Settings** tab.
2. Type the exact integration label to confirm.
3. Click **Delete Integration**.

_Requires **owner** role. This action is permanent and removes all associated data._

### Leave an Integration

If you no longer need access, click **Leave** in the **Settings** tab. You'll need an admin to re-invite you if you want access again.

_Available to all members except the owner._

## What's Next

- **[Monitor your workflows](workflows)** — see workflow runs from your connected repositories.
- **[Set up notifications](notifications)** — get alerted when workflows fail.
- **[Manage team members](team-management)** — invite colleagues and assign roles.
