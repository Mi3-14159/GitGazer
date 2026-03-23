---
name: refactor
description: 'Surgical code refactoring for the GitGazer pnpm monorepo (Vue 3 + AWS Lambda + Drizzle ORM). Covers extracting functions, improving type safety, breaking down oversized controllers and components, fixing import conventions, enforcing RLS transaction boundaries, and applying project-specific patterns. Use when the user asks to clean up, refactor, or improve code in apps/api, apps/web, or packages/db.'
license: MIT
---

# Refactor — GitGazer

## Overview

Improve code structure and readability without changing external behavior. Refactoring is gradual evolution, not revolution. This skill is tuned to the GitGazer codebase conventions — a pnpm monorepo with a Vue 3 SPA frontend, AWS Lambda backend, and shared Drizzle ORM database package.

## When to Use

- Code is hard to understand or maintain
- Controllers, composables, or components are too large
- Code smells or convention violations need addressing
- User says "clean up", "refactor", "improve this code"

## Refactoring Principles

1. **Behavior is preserved** — refactoring changes how, not what
2. **Small steps** — one change, run tests, commit
3. **Tests come first** — without colocated `*.test.ts` coverage, add tests before refactoring
4. **One concern at a time** — never mix refactoring with feature work
5. **Respect existing architecture** — this codebase is controller-centric; don't invent service layers unless explicitly asked

---

## Project Architecture at a Glance

| Area           | Stack                                          | Key Convention                                                       |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `apps/api/`    | TypeScript, Lambda, Powertools Router, Drizzle | Controller-centric domains, `withRlsTransaction`, `@/` alias imports |
| `apps/web/`    | Vue 3, Radix Vue, Tailwind CSS 4, Pinia, Vite  | `<script setup>`, composables for API logic, `@/` alias imports      |
| `packages/db/` | Drizzle ORM, Aurora PostgreSQL                 | Shared schema, types, runtime guards, RLS helpers                    |

### Import Rules (applies everywhere)

- Use `@/` for `src/` within each app
- Use `@gitgazer/db/*` for the shared DB package
- **Never** use relative paths like `../../../` — always use path aliases

---

## GitGazer-Specific Code Smells & Fixes

### 1. Relative Import Paths

The most common convention violation. Deep relative imports make code fragile and hard to move.

```diff
# BAD
- import { withRlsTransaction } from '../../../packages/db/src/client';
- import { logger } from '../../shared/logger';
- import type { WorkflowRun } from '../../../packages/db/src/types';

# GOOD
+ import { withRlsTransaction } from '@gitgazer/db/client';
+ import { logger } from '@/shared/logger';
+ import type { WorkflowRun } from '@gitgazer/db/types';
```

### 2. God Controller

Backend controllers tend to accumulate logic. When a controller exceeds ~150 lines or handles multiple distinct concerns, break it apart. Keep domain boundaries — extract helpers into the same domain folder, not into new "service" layers.

```diff
# BAD: webhooks.controller.ts doing validation + parsing + DB writes + notifications
- export async function handleWorkflowRunEvent(event: APIGatewayProxyEvent) {
-   // 30 lines: parse webhook payload
-   // 20 lines: validate event type
-   // 40 lines: transform to DB format
-   // 30 lines: upsert workflow run
-   // 25 lines: trigger notifications
- }

# GOOD: Extract helpers within the same domain folder
+ // webhooks.controller.ts — orchestration only
+ export async function handleWorkflowRunEvent(event: APIGatewayProxyEvent) {
+   const payload = parseWebhookPayload(event);
+   const workflowRun = transformWorkflowRun(payload);
+   await upsertWorkflowRun(workflowRun);
+   await triggerNotifications(workflowRun);
+ }

+ // importers/workflow-run.ts — domain-specific transform + persistence
+ export function transformWorkflowRun(payload: WorkflowRunPayload) { /* ... */ }
+ export async function upsertWorkflowRun(run: WorkflowRunInsert) { /* ... */ }
```

### 3. Missing or Misplaced RLS Transaction Boundary

Every tenant-scoped database query must go through `withRlsTransaction`. The boundary should be as early as possible in the call chain — at the controller level, not buried inside helpers.

```diff
# BAD: RLS boundary deep inside a helper
- async function getWorkflows(integrationIds: string[]) {
-   const data = await someHelper(integrationIds); // RLS hidden inside
-   return transform(data);
- }

# BAD: Direct db access without RLS
- const runs = await db.query.workflowRuns.findMany({ where: ... });

# GOOD: RLS at controller boundary, tx passed down
+ export async function getWorkflows(reqCtx: RequestContext) {
+   const integrationIds = reqCtx.user.integrationIds;
+   return withRlsTransaction(integrationIds, async (tx) => {
+     const runs = await tx.query.workflowRuns.findMany({ /* ... */ });
+     return runs;
+   });
+ }
```

### 4. Direct AWS Client Instantiation

AWS clients are pre-configured in `src/shared/clients/`. Instantiating them directly in controllers bypasses central configuration, region settings, and testability.

```diff
# BAD
- import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
- const s3 = new S3Client({ region: 'us-east-1' });

# GOOD
+ import { getSignedUrl } from '@/shared/clients/s3.client';
```

### 5. Oversized Vue Component

When a `.vue` file exceeds ~200 lines of `<script setup>`, the component is likely handling too many concerns. Extract data-fetching and stateful logic into composables; extract visual sub-sections into child components.

```diff
# BAD: WorkflowDetailView.vue with 300+ lines of script setup
- <script setup lang="ts">
- // 40 lines: filter state
- // 60 lines: fetch + transform data
- // 50 lines: chart config
- // 30 lines: pagination logic
- // watchers, lifecycle hooks, etc.
- </script>

# GOOD: Extract into composable + focused child components
+ // composables/useWorkflowDetail.ts
+ export function useWorkflowDetail(workflowId: Ref<string>) {
+   const loading = ref(false);
+   const data = ref<WorkflowRunWithRelations[]>([]);
+   async function fetchRuns() { /* ... */ }
+   return { loading, data, fetchRuns };
+ }

+ // WorkflowDetailView.vue — thin orchestration
+ <script setup lang="ts">
+ import { useWorkflowDetail } from '@/composables/useWorkflowDetail';
+ const { loading, data, fetchRuns } = useWorkflowDetail(workflowId);
+ </script>
```

### 6. Business Logic in Vue Templates

Computed properties and composables exist specifically so templates stay declarative. Move conditional logic, data transforms, and formatting out of templates.

```diff
# BAD
- <span>{{ run.conclusion === 'success' ? 'Passed' : run.conclusion === 'failure' ? 'Failed' : 'Unknown' }}</span>

# GOOD
+ const conclusionLabel = computed(() => {
+   const labels: Record<string, string> = { success: 'Passed', failure: 'Failed' };
+   return labels[run.value.conclusion] ?? 'Unknown';
+ });
+ // template:
+ <span>{{ conclusionLabel }}</span>
```

### 7. Options API or Non-Setup Components

All Vue components must use `<script setup lang="ts">`. Any Options API (`export default { data(), methods{} }`) or non-setup Composition API (`setup()` function) should be migrated.

### 8. Store Logic Leaking into Components

API calls, WebSocket management, and data transformations belong in Pinia stores or composables — not in component `<script setup>` blocks. Components orchestrate; stores and composables own state and side effects.

### 9. Untyped or `any` in Shared Types

The `packages/db/src/types/` module provides runtime guards (`isNotificationRule`, `isWorkflowsRequestParameters`, etc.) and Drizzle-derived types. Use them. Adding `any` here propagates unsafety across both frontend and backend.

### 10. Dead Code and Commented-Out Blocks

Remove unused functions, imports, and commented-out code. Git history preserves everything. This applies especially to barrel exports in `components/ui/index.ts` — if a component is no longer used, remove its export.

---

## Backend Refactoring Patterns

### Breaking Down a Large Controller

The domain pattern is: `<domain>.routes.ts` → `<domain>.controller.ts` → optional helpers/importers.

When a controller grows too large, extract into focused modules within the same domain folder:

```
domains/webhooks/
├── webhooks.routes.ts              # Route definitions only
├── webhooks.controller.ts          # Orchestration — thin dispatch
├── webhooks.middleware.ts          # Signature verification
├── importers/
│   ├── workflow-run.importer.ts    # Transform + persist workflow runs
│   ├── workflow-job.importer.ts    # Transform + persist workflow jobs
│   └── check-suite.importer.ts    # Transform + persist check suites
└── webhooks.middleware.test.ts     # Colocated test
```

### Improving RLS Transaction Usage

Choose the correct role for the operation:

| Role      | Use When                     |
| --------- | ---------------------------- |
| `reader`  | Read-only queries (default)  |
| `writer`  | Inserts, updates, deletes    |
| `analyst` | Custom SQL / metrics queries |

```typescript
// Read
return withRlsTransaction(integrationIds, async (tx) => {
    return tx.query.workflowRuns.findMany({
        /* ... */
    });
});

// Write — specify writer role
return withRlsTransaction(
    integrationIds,
    async (tx) => {
        await tx.insert(notificationRules).values(rule);
    },
    'writer',
);
```

### Extracting Shared Query Logic

When the same Drizzle query pattern appears in multiple controllers, move it to `packages/db/src/queries/`. This is where metrics queries already live.

### Test Mocking Pattern

Tests mock `withRlsTransaction` at the module level and execute the callback with a synthetic `tx`:

```typescript
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: vi.fn(async (_ids, callback) => {
        return callback(mockTx);
    }),
}));
```

When refactoring, preserve this mocking boundary. If you extract a helper that takes `tx` as a parameter, tests become simpler because you can pass `mockTx` directly without module-level mocks.

---

## Frontend Refactoring Patterns

### Extracting a Composable

Move reusable fetch + state logic from components into `src/composables/useX.ts`:

```typescript
// composables/useMetric.ts
export function useMetric() {
    const {fetchWithAuth} = useAuth();
    const loading = ref(false);
    const metrics = ref<MetricsSummary | null>(null);

    async function fetchMetrics(filters: MetricsFilters) {
        loading.value = true;
        try {
            const res = await fetchWithAuth(`${API_ENDPOINT}/metrics`, {
                method: 'POST',
                body: JSON.stringify(filters),
            });
            const data = await res.json();
            if (isMetricsSummaryResponse(data)) metrics.value = data;
        } finally {
            loading.value = false;
        }
    }

    return {loading, metrics, fetchMetrics};
}
```

Key conventions:

- Name: `useX` matching the domain concept
- Use `useAuth().fetchWithAuth` for authenticated requests
- Use runtime guards from `@gitgazer/db/types` to validate API responses
- Expose `loading` ref + data ref + action functions

### Extracting Vue Sub-Components

Split when a component has multiple visual sections, each with their own state or event handling:

```
components/dashboard/
├── DashboardView.vue           # Layout + orchestration
├── StatusDistributionChart.vue # ECharts pie/bar
├── RecentRunsTable.vue         # Table with pagination
└── DashboardFilters.vue        # Filter controls
```

Each child receives data via props and emits events upward. The parent view composes them.

### Cleaning Up Pinia Stores

Stores should use the Composition API pattern (`defineStore` with setup function). If a store has grown large, consider splitting into focused stores or extracting internal helpers:

```typescript
// stores/workflows.ts
export const useWorkflowsStore = defineStore('workflows', () => {
    // State
    const runs = ref<WorkflowRunWithRelations[]>([]);
    const cursor = ref<string | null>(null);
    const filters = ref<WorkflowFilters>(defaultFilters);

    // Actions — keep focused
    async function fetchRuns() {
        /* ... */
    }
    function applyFilter(key: string, value: unknown) {
        /* ... */
    }

    // Only expose what consumers need
    return {runs, cursor, filters, fetchRuns, applyFilter};
});
```

---

## Refactoring Steps

### Safe Process

1. **Prepare** — ensure colocated `*.test.ts` files cover the code; if missing, write tests first
2. **Identify** — pinpoint the smell; read the module instruction file for the area (`apps/api/.github/backend.instructions.md` or `apps/web/.github/frontend.instructions.md`)
3. **Refactor** — small steps; run `pnpm run test:unit` (backend) or `vue-tsc --noEmit` (frontend) after each change
4. **Verify** — all tests pass, no new type errors, import aliases correct

---

## Refactoring Checklist

### Backend (`apps/api/`)

- [ ] All imports use `@/` or `@gitgazer/db/*` — no relative `../` paths
- [ ] Controllers < 150 lines; large ones decomposed into domain helpers
- [ ] All tenant-scoped queries use `withRlsTransaction` with correct role
- [ ] AWS clients from `@/shared/clients/` — no direct SDK instantiation
- [ ] Structured logging via Powertools Logger — no raw `console.log`
- [ ] Colocated `*.test.ts` with mocked AWS/DB boundaries
- [ ] No `any` types without explicit justification

### Frontend (`apps/web/`)

- [ ] `<script setup lang="ts">` on every component
- [ ] Components < 200 lines of script; large ones use composables
- [ ] API logic in composables (`useX.ts`), not in component scripts
- [ ] Pinia stores use Composition API style
- [ ] UI primitives from `@/components/ui/` — not custom one-off implementations
- [ ] Icons from `lucide-vue-next` — no inline SVGs
- [ ] No business logic in templates — use computed properties

### Shared (`packages/db/`)

- [ ] Types and guards exported from `packages/db/src/types/`
- [ ] Shared queries in `packages/db/src/queries/`
- [ ] Schema changes reflected in Drizzle migrations

---

## Common Refactoring Operations

| Operation             | GitGazer Context                                                   |
| --------------------- | ------------------------------------------------------------------ |
| Extract helper        | Move logic from controller into same domain folder                 |
| Extract composable    | Move fetch + state from component into `composables/useX.ts`       |
| Extract sub-component | Split large `.vue` into parent + children in same component group  |
| Fix imports           | Replace relative paths with `@/` or `@gitgazer/db/*` aliases       |
| Add RLS boundary      | Wrap raw db queries in `withRlsTransaction`                        |
| Add type guard        | Create runtime guard in `packages/db/src/types/` for shared type   |
| Extract store         | Move component-local state to Pinia store when shared across views |
| Extract query         | Move repeated Drizzle patterns to `packages/db/src/queries/`       |
| Remove dead code      | Delete unused exports, commented blocks, orphaned components       |
| Fix barrel exports    | Update `index.ts` barrel files after adding/removing modules       |
