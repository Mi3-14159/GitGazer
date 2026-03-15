# Components

Reusable, self-contained Vue components organized by feature domain.

## Structure

```
components/
├── ui/               # Primitive UI components (Button, Card, Dialog, etc.)
├── dashboard/        # Overview/dashboard widgets (StatCards, Charts, RecentRuns)
├── workflows/        # Workflow table, rows, toolbar, filters
├── integrations/     # Integration cards, dialogs, webhook editors
├── notifications/    # Notification rule cards, filters, dialogs
├── DateTimeRangePicker.vue   # Shared date range picker
└── ThemeToggle.vue           # Theme switcher
```

Route-level page components live in `views/`, not here. These components are building blocks wired together by page orchestrators.
