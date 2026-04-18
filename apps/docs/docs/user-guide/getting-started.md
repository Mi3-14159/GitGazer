---
sidebar_position: 1
title: Getting Started
description: Sign in to GitGazer and orient yourself in the interface.
---

# Getting Started

GitGazer monitors your GitHub Actions workflows in real time, sends you Slack alerts when things break, and gives you analytics to understand your CI/CD health.

## Sign In

1. Open [app.gitgazer.com](https://app.gitgazer.com).
2. Click **Login with GitHub**.
3. Authorize GitGazer to access your GitHub account.
4. You're redirected to the app — no passwords to remember.

:::tip[Already have an account?]
If you're already signed in, you'll be taken directly to the Overview page.
:::

## First-Time Experience

After signing in for the first time, you'll see an empty state prompting you to create your first integration. An integration connects GitGazer to a GitHub organization or user account — it's the starting point for everything.

Follow the [Setting Up Integrations](integrations) guide to get started.

## Navigating the App

GitGazer uses a top navigation bar with these main sections:

| Tab               | What It Does                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Overview**      | At-a-glance health dashboard — total runs, success rates, failures, and recent activity          |
| **Workflows**     | Real-time table of all workflow runs with filtering, live updates, and job details               |
| **Integrations**  | Manage your connections to GitHub — create integrations, link the GitHub App, configure webhooks |
| **Notifications** | Set up Slack alerts for workflow failures based on repository, branch, or workflow filters       |
| **Dashboards**    | Analytics views with CI/CD metrics (DORA/SPACE style)                                            |
| **Event Log**     | Chronological record of all events across your integrations                                      |

### Header Actions

The header also gives you access to:

- **Theme toggle** — switch between light, dark, and system themes.
- **Guided tour** — restart or resume the interactive product tour at any time via the help menu.
- **Sign out** — ends your session and clears authentication cookies.

## What's Next

- **[Set up your first integration](integrations)** — connect GitGazer to your GitHub repositories.
- **[Monitor workflows](workflows)** — see your CI/CD runs in real time.
- **[Configure notifications](notifications)** — get Slack alerts when workflows fail.
