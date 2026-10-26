---
sidebar_position: 7
title: Configuring Notifications
description: Set up Slack alerts for workflow failures with customizable filter criteria.
---

# Configuring Notifications

Notification rules send Slack alerts when GitHub Actions workflows fail. You define conditions — like a specific repository, branch, or workflow name — and GitGazer automatically matches incoming events against your rules.

## How It Works

1. A `workflow_job` event with `conclusion: failure` arrives via webhook.
2. The worker checks all enabled notification rules for that integration.
3. Rules whose filter criteria match the event trigger a Slack message to the rule's notification handle.
4. The alert includes the workflow name, repository, branch, job name, and a link to the run on GitHub.

:::info[When do alerts fire?]

Alerts fire only for **completed job failures** — not for runs that are in progress or cancelled. This avoids noise from transient states.

:::

## Create a Notification Rule

1. Go to the **Notifications** page.
2. Click **Add Rule**.
3. Fill in the form:

| Field           | Required | Description                                                                      |
| --------------- | -------- | -------------------------------------------------------------------------------- |
| **Label**       | Yes      | A name for this rule (max 100 characters)                                        |
| **Integration** | Yes      | Which integration this rule applies to                                           |
| **Destination** | Yes      | The **App** and **Handle** to send alerts to (see [Destinations](#destinations)) |
| **Enabled**     | —        | Toggle the rule on or off (default: enabled)                                     |

1. Optionally, set filter criteria to narrow when the rule fires (see [Filter Criteria](#filter-criteria) below).
2. Click **Save**.

The new rule appears as a card on the Notifications page.

## Destinations

A rule doesn't hold a Slack URL itself. It sends to a **handle** that an admin added to one of the integration's apps. In the rule editor, pick the **App**, then one of its **Handle**s:

- **Slack** app: a Slack channel. Alerts also mention the person behind the failure when they're linked to a Slack user. See [Slack App](slack-app).
- **Webhook** app: a named Slack incoming webhook. See [Webhook App Settings](integrations#webhook-app-settings).

If the integration has no handles yet, the editor links to the **Apps** tab, where an admin can add one.

If a handle is deleted, the rules that used it stay but show **No destination** and send nothing until you pick another handle.

When several matching rules share a handle, Slack gets **one message per failed job**, not one per rule.

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

## Log Details

**Include log details** is a checkbox on the rule form. It is not a filter: it never stops a rule from firing. It only controls what a failure alert for this rule contains.

When it is checked, failure alerts also show the error lines from the failed job log and a short AI-generated summary. The verdict (probably flaky or likely a real failure) does not depend on this setting; it is shown whenever the job history is clear enough to decide.

- New rules have it checked. Existing rules keep it unchecked until you opt in.
- Everyone in the Slack channel can read the error lines, so only enable it where that is acceptable.
- It requires the GitGazer GitHub App. Integrations set up with a manual webhook never fetch logs, so their alerts carry no log details.

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
- A **No destination** badge if the rule has no handle
- Active filter badges showing which criteria are set
- Created and last updated timestamps

## Permissions

Creating, editing, and deleting notification rules requires the **member** role or higher on the integration. Viewers can see existing rules but cannot modify them. Adding handles requires the **admin** role.

If you don't see the **Add Rule** button, ask an integration admin to upgrade your role. See [Managing Team Members](team-management) for details.

## Setting Up a Slack Webhook

Handles need a Slack webhook URL. If you don't have one yet:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app (or select an existing one).
2. Under **Features → Incoming Webhooks**, toggle webhooks on.
3. Click **Add New Webhook to Workspace** and select the channel to post to.
4. Copy the webhook URL (starts with `https://hooks.slack.com/services/...`).
5. Add it as a handle in the **Webhook** app (see [Add a Handle](integrations#add-a-handle)), then pick that handle in your notification rule.
