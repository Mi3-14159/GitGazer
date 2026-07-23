---
sidebar_position: 8
title: Querying Data with AI Assistants
description: Connect VS Code, Claude, or any MCP client to ask questions about your GitGazer data in natural language.
---

# Querying Data with AI Assistants

GitGazer provides a built-in **[Model Context Protocol](https://modelcontextprotocol.io) (MCP)** server, so you can point an AI assistant at your GitGazer data and ask questions in plain English. The assistant translates your question into a read-only query, runs it against your GitHub Actions data, and answers — all scoped to the integrations you have access to.

Works with **VS Code (Copilot)**, **Claude Code**, **Claude Desktop**, and any other MCP-compatible client.

:::note Read-only
The assistant can only **read** your data. It cannot change settings, delete anything, or see other tenants' data or webhook secrets.
:::

## Before you begin

- A GitGazer account that is a member of at least one [integration](./integrations.md).
- Your GitGazer server URL. The MCP endpoint is your GitGazer web address with `/api/mcp` appended — for example `https://<your-gitgazer-domain>/api/mcp`.

You sign in with the same GitHub account you use for the GitGazer web app. No API keys or tokens to copy — the first time you connect, your client opens a browser to sign in.

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

## Ask questions

Once connected, just ask — the assistant discovers the available tables on its own and writes the query for you:

- "Which of my workflows failed most often in the last 7 days?"
- "Show the repositories with the most failed workflow runs this month."
- "How many workflow runs are currently in progress?"
- "List the pull requests linked to failed runs today."
- "What's the average number of jobs per workflow run this week?"

:::tip
If an answer looks off, ask the assistant to "list the tables" or "describe the `workflow_runs` table" first — it will inspect the schema and refine the query.
:::

## What the assistant can and can't see

- ✅ Only the integrations **you** are a member of — the same tenant scope as the web app.
- ✅ GitHub Actions data: workflow runs and jobs, pull requests, repositories, organizations, enterprises, and users.
- ❌ **Not** other tenants' data, webhook secrets, or GitGazer account/personal information.
- ❌ **No** writes — it cannot modify or delete anything.

## Limits

To keep things fast and fair, a few limits apply:

| Limit                   | Value                                    |
| ----------------------- | ---------------------------------------- |
| Query time per hour     | 600 seconds of query time                |
| Rows returned per query | 1000 (results beyond this are truncated) |
| Max time per query      | 20 seconds                               |

Each query "costs" the time it takes to run, drawn from a rolling ~1-hour budget that starts on your first query and refreshes once it elapses. Exploring tables and columns ("list tables", "describe table") is free and does **not** count toward the budget.

## Troubleshooting

- **It keeps asking me to sign in.** Confirm the URL is exactly `https://<your-gitgazer-domain>/api/mcp` and that you signed in with the GitHub account that has access to your integration.
- **"relation does not exist".** Tables live in the `github` schema. Ask the assistant to qualify names (for example `github.workflow_runs`) or to call "list tables" first.
- **"Query quota exceeded".** You've reached the hourly limit; wait for the reset time shown in the message.
- **Empty answers.** You may not be a member of any integration yet, or data hasn't been ingested — check your [integrations](./integrations.md).

For how the server works under the hood — the OAuth flow, the exact tables, and the security model — see the [MCP Server](../technical/mcp-server.md) technical reference.
