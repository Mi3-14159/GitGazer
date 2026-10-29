---
sidebar_position: 3
title: Webhook App
description: Keep named Slack incoming webhooks as handles that notification rules send alerts to.
---

# Webhook App

The **Webhook** app holds **handles**. A handle is a name plus a Slack incoming webhook URL (starting with `https://hooks.slack.com/`). [Notification rules](../notifications.md) send alerts to handles, so you paste each URL once and reuse it in many rules.

## Add a Handle

1. Open the **Webhook** app on the **Apps** tab. If it isn't installed yet, click **Install** next to it under **Available**.
2. Click **Add handle**.
3. Enter a **Name** (e.g., `#ci-alerts`) and the **Slack webhook URL**.
4. Click **Add handle**.

An app holds up to 20 handles. To get a Slack webhook URL, see [Setting Up a Slack Webhook](../notifications.md#setting-up-a-slack-webhook).

## Move Handles to Slack Channels

If the integration also has a connected [Slack app](./slack.md), the Webhook app's settings offer **Move to Slack channels** while handles for that workspace exist. It is the same offer as in the Slack app's settings; see [Move From Webhooks](./slack.md#move-from-webhooks).

## Edit or Delete a Handle

Use the actions menu on a handle to change its name or URL, or to delete it. If rules use the handle, the dialog warns you before deleting. Those rules keep existing but show **No destination** and send nothing until you pick another handle.

_Adding, editing, and deleting handles requires **admin** role or higher. Other members see only the handle names._

## Remove the App

Click **Remove Webhook app** in the app's settings and confirm with **Remove app**. All handles and their webhook URLs are deleted. The rules that used them are kept but show **No destination** and send nothing until you pick another handle.

_Requires **admin** role or higher._

## What's Next

- **[Set up notifications](../notifications.md)** — create rules that send to your handles.
- **[Slack App](./slack.md)** — send to Slack channels without webhook URLs.
