---
sidebar_position: 2
title: Setting Up Integrations
description: Create an integration, connect it to GitHub, and manage its settings.
---

# Setting Up Integrations

An **integration** connects GitGazer to a GitHub organization or user account. It's the top-level container for all your monitored workflows, notification rules, and team members.

## Create an Integration

### Option A: Install the GitHub App (Recommended)

The GitHub App is the simplest way to connect — it handles webhook configuration automatically.

1. Go to the **Integrations** page, click **New Integration**, enter a label and click **Create**.
2. Open the new integration, go to the **Apps** tab, and open the **GitHub** app.
3. Click **Install on GitHub**. This opens GitHub in a new tab.
4. Choose the organization or account to install on.
5. Select **All repositories** or choose specific repositories.
6. Click **Install**. You're redirected back to GitGazer.
7. In the dialog that appears, your integration is already selected. Click **Link to Integration**.

GitGazer immediately starts receiving webhook events from your selected repositories.

The dialog also lets you link the installation to another integration that has the GitHub app and no linked installation, or create a new integration for it.

Only the GitHub user who installed the GitHub App can link the installation. For an installation on a personal account, the account owner can link it too. Linking to an existing integration also requires the **admin** role or higher in it; when you create a new integration from the dialog, you become its owner.

### Option B: Manual Webhook

If you prefer to manage webhooks yourself (e.g., for a single repository):

1. Go to the **Integrations** page.
2. Click **New Integration**.
3. Enter a label (e.g., "My Org") and click **Create**.
4. Open the new integration, go to the **Apps** tab, and open the **GitHub** app.
5. Copy the **Webhook URL** and **Secret** (see [Webhook URL & Secret](apps/github.md#webhook-url--secret)).
6. In GitHub, create a webhook on your repository or organization:
    - **Payload URL**: paste the webhook URL from step 5.
    - **Content type**: `application/json`.
    - **Secret**: paste the secret from step 5.
    - **Events**: select **Workflow runs** and **Workflow jobs** (and optionally **Pull requests** and **Pull request reviews**).

## Open an Integration

The **Integrations** page lists all integrations you belong to. Click one to open its page, which has three tabs:

| Tab          | What It Holds                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Apps**     | The apps installed in the integration and a catalog of apps you can add.                         |
| **Members**  | The people with access and pending invitations. See [Managing Team Members](team-management.md). |
| **Settings** | Rename, leave, or delete the integration.                                                        |

## Apps

An integration's **Apps** tab holds the apps that bring data in (**GitHub**) and send alerts out (**Webhook**, **Slack**). See the [Apps Overview](apps/index.md) and the pages for the [GitHub](apps/github.md), [Webhook](apps/webhook.md) and [Slack](apps/slack.md) apps.

## Integration Settings

Open the **Settings** tab of an integration to manage the integration itself.

### Rename an Integration

Edit the **Name** field and click **Rename**.

_Requires **admin** role or higher._

### Delete an Integration

1. Click **Delete** in the **Settings** tab.
2. Type the exact integration label to confirm.
3. Click **Delete Integration**.

_Requires **owner** role, and only the owner who created the integration can delete it. This action is permanent and removes all associated data._

### Leave an Integration

If you no longer need access, click **Leave** in the **Settings** tab and confirm with **Leave Integration**. To rejoin, an admin has to send you a new invitation.

_Available to all members except the owner._

## What's Next

- **[Monitor your workflows](workflows.md)** — see workflow runs from your connected repositories.
- **[Set up notifications](notifications.md)** — get alerted when workflows fail.
- **[Manage team members](team-management.md)** — invite colleagues and assign roles.
