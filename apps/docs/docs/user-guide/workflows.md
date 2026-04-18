---
sidebar_position: 3
title: Monitoring Workflows
description: View, filter, and inspect GitHub Actions workflow runs in real time.
---

# Monitoring Workflows

The Workflows page gives you a real-time view of all GitHub Actions workflow runs across your integrations. Runs update live via WebSocket — no manual refresh needed.

## Workflows Table

The table displays one row per workflow run. Each row shows:

| Column         | Description                                                       | Visible by Default |
| -------------- | ----------------------------------------------------------------- | ------------------ |
| **Workflow**   | Workflow name and run attempt number                              | Yes                |
| **Repository** | Repository name                                                   | Yes                |
| **Branch**     | Head branch that triggered the run                                | Yes                |
| **Status**     | Run status/conclusion badge (success, failure, in progress, etc.) | Yes                |
| **Jobs**       | Count of successful jobs vs. total jobs                           | Yes                |
| **Actor**      | The user or bot that triggered the run                            | Yes                |
| **Duration**   | Time from run start to last update                                | Yes                |
| **Created**    | When the run was created (relative time)                          | Yes                |
| **Started**    | When the run started (relative time)                              | No                 |
| **Commit**     | Commit message                                                    | No                 |
| **Run #**      | Run attempt number                                                | No                 |
| **Topics**     | Repository topic badges                                           | No                 |

### Show or Hide Columns

Click the **column chooser** button in the toolbar to toggle which columns are visible. The button shows how many columns are currently displayed.

## Filtering

### Date/Time Range

Use the date/time picker in the page header to scope the time window:

- **Quick presets**: Past 1 hour, Past 24 hours, Past 7 days, Past 30 days
- **Custom range**: Set specific From and To date/time values
- Click **Apply** to update, or **Clear** to reset

### Column Filters

Click the filter icon on any supported column header to open a filter popover:

- **Searchable**: Type to find specific values in the checklist.
- **Multi-select**: Check multiple values to include them.
- **Clear**: Remove the filter for that column.

Filterable columns: Workflow, Repository, Branch, Status, Actor, Topics.

### Saved Views

Save your current filter and column configuration as a named view:

1. Set up your desired filters and column visibility.
2. Click **Save as new view** in the toolbar.
3. Give it a name (e.g., "Failed runs on main branch").

Switch between saved views using the view selector in the toolbar. You can update or delete custom views at any time.

## Viewing Run Details

Click any row to expand it and reveal the individual **jobs** within that run.

### Job Rows

Each job row shows:

- Job name (indented under the parent run)
- Runner group
- Job status badge
- Job duration
- Job created and started times

### Job Details Dialog

Click a job row to open the full details dialog, which shows:

- Job name and run attempt context
- Status and duration
- Runner information
- Started time
- **Workflow context**: repository, branch, workflow name, actor, commit message
- **View on GitHub** button — opens the run directly on GitHub

## Live Updates

Workflow runs update in real time as GitHub sends webhook events. When a run starts, progresses, or completes, you'll see:

- Status badges change (e.g., from "in progress" to "success" or "failure")
- Job counts update
- Duration recalculates

This happens automatically via WebSocket — the page stays current without refreshing.

## Infinite Scroll

The table loads workflows in pages. As you scroll down, more runs load automatically. The status bar at the bottom shows:

- **Loading more workflows...** — fetching the next page
- **x of y workflows loaded** — current progress
- **No workflows match current filters** — when filters exclude all results
