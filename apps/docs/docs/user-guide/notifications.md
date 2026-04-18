---
sidebar_position: 6
title: Configuring Notifications
description: Set up Slack alerts for workflow failures with customizable filter criteria.
---

# Configuring Notifications

Notification rules send Slack alerts when GitHub Actions workflows fail. You define conditions — like a specific repository, branch, or workflow name — and GitGazer automatically matches incoming events against your rules.

## How It Works

1. A `workflow_job` event with `conclusion: failure` arrives via webhook.
2. The worker checks all enabled notification rules for that integration.
3. Rules whose filter criteria match the event trigger a Slack message to the configured webhook URL.
4. The alert includes the workflow name, repository, branch, job name, and a link to the run on GitHub.

:::info[When do alerts fire?]

Alerts fire only for **completed job failures** — not for runs that are in progress or cancelled. This avoids noise from transient states.

:::

## Create a Notification Rule

1. Go to the **Notifications** page.
2. Click **Add Rule**.
3. Fill in the form:

| Field                 | Required | Description                                                                                  |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| **Label**             | Yes      | A name for this rule (max 100 characters)                                                    |
| **Integration**       | Yes      | Which integration this rule applies to                                                       |
| **Slack Webhook URL** | Yes      | The [Slack Incoming Webhook](https://api.slack.com/messaging/webhooks) URL to send alerts to |
| **Enabled**           | —        | Toggle the rule on or off (default: enabled)                                                 |

1. Optionally, set filter criteria to narrow when the rule fires (see [Filter Criteria](#filter-criteria) below).
2. Click **Save**.

The new rule appears as a card on the Notifications page.

## Filter Criteria

All filter fields are optional. Leaving a field blank means "match any value" for that criterion. Only events matching **all** specified criteria trigger the alert.

| Filter                | Description                                                              | Example                |
| --------------------- | ------------------------------------------------------------------------ | ---------------------- |
| **Owner**             | GitHub owner (organization or user)                                      | `my-org`               |
| **Repository name**   | Repository name (without owner prefix)                                   | `my-repo`              |
| **Workflow name**     | The workflow's `name:` field from the YAML                               | `CI Build`             |
| **Head branch**       | The branch that triggered the workflow                                   | `main`                 |
| **Topics**            | Repository topics (matches if the repo has **any** of the listed topics) | `frontend`, `critical` |
| **Ignore Dependabot** | Skip alerts for Dependabot-triggered failures                            | Checked = ignore       |

### Examples

**Alert on all failures in a specific repo:**

- Set **Repository name** to `api-service`. Leave everything else blank.

**Alert only on `main` branch failures:**

- Set **Head branch** to `main`. Leave everything else blank.

**Alert on failures in repos tagged `critical`, ignoring Dependabot:**

- Add `critical` to **Topics**. Check **Ignore Dependabot**.

## Manage Rules

### Edit a Rule

Click the **edit** button on a rule card. The form opens pre-filled with the current values. Make changes and click **Save**.

### Enable or Disable a Rule

Toggle the **Enabled** switch directly on the rule card. Disabled rules are not evaluated when events arrive.

### Delete a Rule

Click the **delete** button on the rule card and confirm in the dialog. This is permanent.

### View Rule Details

Each rule card shows:

- Rule label and integration
- Enabled/Disabled badge
- Channel type (Slack)
- Slack webhook URL (masked — click the eye icon to reveal, copy button to copy)
- Active filter badges showing which criteria are set
- Created and last updated timestamps

## Permissions

Creating, editing, and deleting notification rules requires the **member** role or higher on the integration. Viewers can see existing rules but cannot modify them.

If you don't see the **Add Rule** button, ask an integration admin to upgrade your role. See [Managing Team Members](team-management) for details.

## Setting Up a Slack Webhook

If you don't have a Slack webhook URL yet:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app (or select an existing one).
2. Under **Features → Incoming Webhooks**, toggle webhooks on.
3. Click **Add New Webhook to Workspace** and select the channel to post to.
4. Copy the webhook URL (starts with `https://hooks.slack.com/services/...`).
5. Paste it into the **Slack Webhook URL** field when creating a notification rule.
