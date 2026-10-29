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

After signing in for the first time, GitGazer offers a short guided tour (**Welcome to GitGazer!**). Start it or skip it; you can restart it later from the help menu.

If you don't belong to any integration yet, the **Integrations** page shows an empty state with **Create your first integration**. An integration connects GitGazer to a GitHub organization or user account — it's the starting point for everything. If a colleague invited you, or your GitHub organization is synced to an existing integration, you may already be a member of one.

Follow the [Setting Up Integrations](integrations) guide to get started.

## Navigating the App

GitGazer uses a top navigation bar with these main sections:

| Tab               | What It Does                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Overview**      | At-a-glance health dashboard — total runs, success rates, failures, and recent activity    |
| **Workflows**     | Real-time table of all workflow runs with filtering, live updates, and job details         |
| **Integrations**  | Create integrations and manage their apps, members, and settings                           |
| **Notifications** | Set up Slack alerts for workflow failures based on repository, branch, or workflow filters |
| **Dashboards**    | Analytics views with CI/CD metrics (DORA/SPACE style)                                      |
| **Event Log**     | Chronological record of all events across your integrations                                |

### Header Actions

The header also gives you access to:

- **Theme toggle** — switch between light, dark, and system themes.
- **Help menu (?)** — restart or resume the interactive product tour, [connect an AI assistant](ai-assistants) to your GitGazer data, see the keyboard shortcuts, or open this documentation.
- **Sign out** — ends your session and clears authentication cookies.

## What's Next

- **[Set up your first integration](integrations)** — connect GitGazer to your GitHub repositories.
- **[Monitor workflows](workflows)** — see your CI/CD runs in real time.
- **[View dashboards](dashboards)** — explore DORA and SPACE analytics for your delivery performance.
- **[Configure notifications](notifications)** — get Slack alerts when workflows fail.
