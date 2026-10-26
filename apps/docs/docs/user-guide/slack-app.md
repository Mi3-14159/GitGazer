---
sidebar_position: 9
title: Slack App
description: Install the GitGazer Slack app to send alerts to Slack channels and mention the person behind a failed job.
---

# Slack App

The **Slack** app sends GitGazer alerts to Slack channels without any webhook URLs, and mentions the person behind a failed job when GitGazer knows who they are in Slack.

## Install the App

_Requires **admin** role or higher._

1. Open the integration and go to the **Apps** tab.
2. On the **Slack** card, click **Install**.
3. In Slack, pick the workspace and allow the app. You're redirected back to GitGazer.

An integration can use one Slack workspace. To switch to another workspace, remove the app first. The app can't be installed org-wide on Enterprise Grid; install it per workspace.

Several integrations can install the app into the same workspace. They share the installation and the links between people, so someone linked once is linked everywhere in that workspace.

## Add Channels

Rules send alerts to **handles**. For the Slack app, a handle is a channel.

1. Open the **Slack** app on the **Apps** tab.
2. Click **Add channel** and pick a channel from the list.
3. The handle name defaults to `#channel-name`. Change it if you like, then save.

Public channels work right away. A private channel appears in the list only after someone runs `/invite @GitGazer` in it. An app holds up to 20 handles.

Rename or delete a handle from its actions menu. Rules that used a deleted handle show **No destination** and send nothing until you pick another one. In the rule editor, choose the **Slack** app, then the channel. See [Destinations](notifications#destinations).

_Adding, renaming, and deleting handles requires **admin** role or higher. Other members see only the handle names._

## Who Gets Mentioned

Every alert sent through the Slack app mentions the person already named in its "by ..." line, the GitHub account that triggered the job, when that account is linked to a Slack user. Mentions don't change which alerts are sent. Alerts sent through the Webhook app never mention anyone.

GitGazer links people only by **exact email match**, never by name. A missed mention is acceptable; a wrong one is not. Deactivated users and bots never match. Links come from:

- **Sign-in.** When someone signs in to GitGazer, their verified GitHub email addresses are looked up in the workspace.
- **Public profile email.** When an alert names someone, GitGazer looks up the public email on their GitHub profile. This works for people who never use GitGazer, but only if the integration has a GitHub App installation.
- **Connect Slack.** People can link themselves (see below).

:::info[No email addresses are stored]

GitGazer looks emails up in Slack while it needs them and keeps only the resulting Slack user ID, or the fact that nobody was found. Members see whether someone is linked, never the Slack ID.

:::

If a lookup fails, the alert is sent without a mention.

## Connect Your Slack Account

If your Slack email differs from your GitHub emails, link yourself:

- **Prompt.** While you aren't linked, the integration page shows **Connect your Slack account to get pinged on your failures**. Click **Connect Slack**, or dismiss it (remembered in your browser).
- **Elsewhere.** The same button is on your own row in the **Members** tab and in the Slack app's settings.

You sign in with Slack and pick the workspace the integration uses. Connecting to a different workspace is rejected. To undo it, click **Disconnect** in the same places. A disconnect sticks: GitGazer won't link you again automatically until you connect again.

Only you can connect or disconnect your own account; admins can't link other people. The Slack app's settings show how many members are linked.

## Move From Webhooks

If the integration has Webhook handles for the same Slack workspace, the Slack app's settings offer **Move to channels** (also offered right after the install).

1. GitGazer lists the Webhook handles whose URL points to the installed workspace. Handles for other workspaces aren't offered.
2. A webhook URL doesn't reveal its channel, so pick the target channel for each handle, or skip it.
3. Confirm. For each handle, GitGazer creates the channel handle, points its rules to it, and deletes the Webhook handle. A handle that fails stays untouched and keeps sending through its webhook.
4. GitGazer ends with a checklist of the old webhooks and a link to Slack's app management page.

:::warning[Remove the old webhooks in Slack]

GitGazer can't delete incoming webhooks in Slack. Until you remove them there, the old URLs still work, but GitGazer no longer uses them.

:::

If no Webhook handles are left, you're offered to remove the Webhook app.

_Requires **admin** role or higher._

## Remove the App

Click **Remove Slack app** in the Slack app's settings and confirm. Its channel handles are deleted, and their rules show **No destination**. If no other integration uses the workspace, GitGazer also revokes its Slack access and deletes the links.

_Requires **admin** role or higher._

## Disconnected State

If the app is removed or revoked in Slack, GitGazer notices when a call fails. The card then shows **Disconnected — reinstall** for every integration using that workspace, and each writes an event log entry. Alerts to its channels fail meanwhile. Reinstalling the app from any of them reconnects all, keeping handles and links. Private channels may need a new `/invite @GitGazer`.

## What's Next

- **[Set up notifications](notifications)** — create rules that send to your channels.
- **[Manage team members](team-management)** — see who is linked to Slack.
