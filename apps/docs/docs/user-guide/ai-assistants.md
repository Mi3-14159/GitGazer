---
sidebar_position: 8
title: Querying Data with AI Assistants
description: Connect VS Code, Claude, or any MCP client to ask questions about your GitGazer data in natural language.
---

# Querying Data with AI Assistants

GitGazer provides a built-in **[Model Context Protocol](https://modelcontextprotocol.io) (MCP)** server, so you can point an AI assistant at your GitGazer data and ask questions in plain English. The assistant translates your question into a read-only query, runs it against your GitHub Actions data, and answers — all scoped to the integrations you have access to. If you choose, it can also change your notification rules.

Works with **VS Code (Copilot)**, **Claude Code**, **Claude Desktop**, and any other MCP-compatible client.

:::note Read only or read & write
You choose what each connection may do when you sign in. A **read-only** session can only read your data. A **read & write** session can additionally create, change and delete [notification rules](./notifications.md). Neither can see other tenants' data or webhook secrets.
:::

## Before you begin

- A GitGazer account that is a member of at least one [integration](./integrations.md).
- Your GitGazer server URL. The MCP endpoint is your GitGazer web address with `/api/mcp` appended — for example `https://<your-gitgazer-domain>/api/mcp`.

You sign in with the same GitHub account you use for the GitGazer web app. No API keys or tokens to copy — the first time you connect, your client opens a browser to sign in. Only this sign-in works: a token taken from the web app is not accepted.

:::tip Get your endpoint from the app
In the GitGazer web app, open the **help menu (?) → Connect an AI assistant**. It shows your exact MCP endpoint and a copy-paste config for each client below, so you never have to assemble the URL by hand.
:::

## Connect VS Code

1. Create (or open) `.vscode/mcp.json` in your workspace and add:

    ```json
    {
        "servers": {
            "gitgazer": {
                "type": "http",
                "url": "https://<your-gitgazer-domain>/api/mcp"
            }
        }
    }
    ```

2. VS Code detects the server and prompts you to start it. On first use it opens a browser to **sign in with GitHub**.
3. Once connected, open Copilot Chat and ask a question about your data (see [Ask questions](#ask-questions)).

## Connect Claude Code

1. Add the server:

    ```bash
    claude mcp add --transport http gitgazer https://<your-gitgazer-domain>/api/mcp
    ```

2. In a Claude Code session, run `/mcp` and choose **Authenticate** for the `gitgazer` server. A browser opens for GitHub sign-in.
3. Ask away.

## Connect Claude Desktop

1. Open **Settings → Connectors → Add custom connector**.
2. Paste your MCP URL: `https://<your-gitgazer-domain>/api/mcp`.
3. Click **Connect** and sign in with GitHub when prompted.

## Choose a session type

Whenever a client signs in, GitGazer first shows a **Connect an MCP client** page with the question **Choose what this client may do**:

| Option           | Description                                      | Button                        |
| ---------------- | ------------------------------------------------ | ----------------------------- |
| **Read only**    | Query workflows, PRs and configuration           | **Allow read access**         |
| **Read & write** | Everything above, plus change notification rules | **Allow read & write access** |

**Read only** is selected by default. Pick an option, click the button, and sign in with GitHub as usual. The page is valid for 10 minutes; if it has expired, start the connection from your client again.

Connections you set up before this choice existed stay **read only**, and refreshing a connection never adds write access. To get **read & write**, sign in again: remove and re-add the server in your client, or sign out of it there (in Claude Code, run `/mcp` and choose **Authenticate**), then pick **Read & write**.

## Ask questions

Once connected, just ask — the assistant discovers the available tables on its own (with the `list_tables` and `describe_table` tools) and runs the query for you with `run_sql`:

- "Which of my workflows failed most often in the last 7 days?"
- "Show the repositories with the most failed workflow runs this month."
- "How many workflow runs are currently in progress?"
- "List the pull requests linked to failed runs today."
- "What's the average number of jobs per workflow run this week?"

:::tip
If an answer looks off, ask the assistant to "list the tables" or "describe the `workflow_runs` table" first — it will inspect the schema and refine the query.
:::

## Change notification rules

In a **read & write** session the assistant has three more tools: `create_notification_rule`, `update_notification_rule` and `delete_notification_rule`. For example:

- "Create a rule that notifies the `ops-alerts` handle when a workflow on `main` fails in `acme/api`."
- "Disable the rule called 'nightly builds'."
- "Delete the notification rule I created yesterday."

The assistant looks up rule and handle ids itself with `run_sql`. You need the **member** role (or higher) in the integration; for integrations where you are a viewer, the change is refused. Each change shows up in the event log marked **via MCP**, for example `A notification rule was deleted via MCP`.

## What the assistant can and can't see

- ✅ Only the integrations **you** are a member of — the same tenant scope as the web app.
- ✅ GitHub Actions data: workflow runs and jobs, pull requests, repositories, organizations, enterprises, and users.
- ✅ Your integrations' GitGazer configuration (apps, notification rules and handles, members, pending and expired invitations and the event log), as your role allows: invitations from member up; webhook secrets and URLs, email addresses of members and invitees, and invite tokens only for admins and owners.
- ❌ **Not** other tenants' data or Slack bot tokens.
- ❌ **No** writes in a read-only session. A read & write session can only change notification rules, never anything else.

## Limits

To keep things fast and fair, a few limits apply:

| Limit                   | Value                                      |
| ----------------------- | ------------------------------------------ |
| Query time per hour     | 600 seconds of query time                  |
| Rows returned per query | 1000 (results beyond this are truncated)   |
| Max time per query      | 20 seconds                                 |
| Result size per query   | 128 KB (results beyond this are truncated) |

Each query "costs" the time it takes to run, drawn from a rolling ~1-hour budget that starts on your first query and refreshes once it elapses. Exploring tables and columns ("list tables", "describe table") is free and does **not** count toward the budget.

## Troubleshooting

- **The assistant says it has no tool to create or change notification rules.** The connection is read only. Sign in again and choose **Read & write**, see [Choose a session type](#choose-a-session-type).
- **It asks me to sign in again after an update.** The MCP server only accepts tokens issued for it, so connections set up before that change must sign in once more. In Claude Code, run `/mcp` and choose **Authenticate**; other clients ask you to sign in again.
- **It keeps asking me to sign in.** Confirm the URL is exactly `https://<your-gitgazer-domain>/api/mcp` and that you signed in with the GitHub account that has access to your integration.
- **"relation does not exist".** GitHub tables live in the `github` schema and configuration views in `gitgazer`. Ask the assistant to qualify names (for example `github.workflow_runs` or `gitgazer.notification_rules_view`) or to call "list tables" first.
- **"Query quota exceeded".** You've reached the hourly limit; wait for the reset time shown in the message.
- **Empty answers.** You may not be a member of any integration yet, or data hasn't been ingested — check your [integrations](./integrations.md).

For how the server works under the hood — the OAuth flow, the exact tables, and the security model — see the [MCP Server](../technical/mcp-server.md) technical reference.
