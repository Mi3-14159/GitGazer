---
sidebar_position: 4
title: Viewing Dashboards
description: Explore built-in DORA and SPACE analytics dashboards, filter and group metrics, and understand how each metric is calculated.
---

# Viewing Dashboards

The **Dashboards** tab turns your workflow and pull request data into CI/CD analytics. GitGazer ships with two built-in dashboards based on industry-standard frameworks:

- **DORA Metrics** — DevOps Research and Assessment metrics for software delivery performance.
- **SPACE Metrics** — a framework for measuring developer productivity and well-being.

Both dashboards are read-only (marked with a **Built-in Dashboard** badge) and available to any role with viewer access or higher.

## Selecting a Dashboard

The Dashboards tab opens to a list of available dashboards. Click a dashboard card to open its detail view, where every widget renders as a chart.

Click **Back to Dashboards** to return to the list. Your current filters and time range are preserved in the URL, so they carry over between views — and you can bookmark or share a link to reproduce the exact same view.

## Time Controls

Two controls in the page header scope every widget on the dashboard:

### Granularity

Choose the bucket size for each data point:

| Option    | Each point represents |
| --------- | --------------------- |
| **Hour**  | One hour              |
| **Day**   | One day (default)     |
| **Week**  | One week              |
| **Month** | One month             |

### Date/Time Range

Use the date/time picker to set the analysis window:

- **Quick presets**: Past 1 hour, Past 24 hours, Past 7 days, Past 30 days
- **Custom range**: Set specific From and To date/time values

:::info[A date range is required]
Widgets only load once a date range is set. Periods with no activity are zero-filled, so the time series stays continuous instead of showing gaps.
:::

## Filters

A filter bar below the header narrows the data feeding every widget. On small screens, tap **Filters** to expand the bar; a badge shows how many filters are active.

| Filter                  | Effect                                                                              | Default          |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------- |
| **Integration**         | Limit metrics to one or more integrations.                                          | All integrations |
| **Repository**          | Limit metrics to specific repositories.                                             | All repositories |
| **Topic**               | Limit metrics to repositories tagged with the selected GitHub topics.               | All topics       |
| **Group By**            | Split each metric into multiple series. See [Grouping](#grouping).                  | Repository       |
| **Default Branch Only** | Count only runs on each repository's default branch (recommended for DORA metrics). | On               |
| **Users Only**          | Exclude bot-triggered activity so metrics reflect human contributors.               | On               |

### Grouping

The **Group By** filter controls how each metric is broken down into series:

| Option          | Result                                         |
| --------------- | ---------------------------------------------- |
| **No grouping** | A single series aggregating all matching data. |
| **Repository**  | One series per repository (default).           |
| **Topic**       | One series per repository topic.               |
| **Integration** | One series per integration.                    |

When grouping is active, widgets render one line or bar per group so you can compare repositories, topics, or integrations side by side.

## DORA Metrics

| Widget                    | What it measures                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Deployment Frequency**  | Number of successful workflow runs per period. Best used with **Default Branch Only** enabled to approximate deployments.        |
| **Lead Time for Changes** | _Coming soon_ — time from commit to production. For now, see **PR Cycle Time** for PR open-to-merge duration.                    |
| **Mean Time to Recovery** | Average elapsed time between a failed workflow run and the next successful run on the same workflow and branch.                  |
| **Change Failure Rate**   | Percentage of completed runs that failed or timed out: `(failed + timed_out) ÷ total completed × 100`. Best with default branch. |

## SPACE Metrics

| Widget                | What it measures                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **PR Merge Rate**     | Percentage of closed pull requests that were merged: `merged ÷ total closed × 100`.                                   |
| **Activity Volume**   | Total workflow runs triggered and pull requests opened per period.                                                    |
| **CI Duration**       | Average CI job execution time from start to completion, excluding queue wait time.                                    |
| **PR Cycle Time**     | Median elapsed time from PR creation to merge, for merged pull requests only.                                         |
| **Contributor Count** | Number of unique contributors who triggered a run or authored a PR during the period.                                 |
| **PR Size**           | Average pull request size (additions + deletions) per period. Smaller PRs are generally reviewed faster.              |
| **PR Review Time**    | Average time from PR creation to the first substantive review (approved or changes requested). Excludes comment-only. |

:::tip[Per-widget calculation details]
Each widget has an info icon that explains exactly how its value is calculated, including which filters most affect it. Hover or tap it when a number looks surprising.
:::

## What's Next

- **[Monitor workflows](workflows)** — drill into individual runs and jobs behind these metrics.
- **[Backfill historical data](backfill)** — load past runs so dashboards reflect activity from before you connected GitGazer.
