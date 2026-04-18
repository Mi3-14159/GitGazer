# GitGazer Documentation Plan

> Extended plan for two documentation tracks: **Technical Documentation** (how GitGazer works) and **User Guide** (how to use GitGazer). All content targets the `apps/docs/` Docusaurus site at `docs.gitgazer.com`.

---

## Table of Contents

- [Goals & Audience](#goals--audience)
- [Information Architecture](#information-architecture)
- [Track 1 — Technical Documentation](#track-1--technical-documentation)
- [Track 2 — User Guide](#track-2--user-guide)
- [Docusaurus Structure & Sidebar Config](#docusaurus-structure--sidebar-config)
- [Writing Standards](#writing-standards)
- [Content Inventory & Source Mapping](#content-inventory--source-mapping)
- [Execution Phases](#execution-phases)
- [Open Questions](#open-questions)

---

## Goals & Audience

### Goals

1. **Reduce onboarding friction** — a new developer or operator should go from zero to understanding GitGazer's architecture in under 30 minutes.
2. **Enable self-service usage** — a new user should be able to set up an integration, monitor workflows, and configure notifications without asking for help.
3. **Serve as the single source of truth** — consolidate knowledge currently scattered across README files, `docs/` planning documents, and code comments.

### Audiences

| Audience                                       | Needs                                                            | Primary Track  |
| ---------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| **End users** (developers, team leads, DevOps) | How to sign up, connect GitHub, monitor workflows, set up alerts | User Guide     |
| **Platform operators**                         | How to deploy, configure infrastructure, manage secrets          | Technical Docs |
| **Contributors / developers**                  | How the system is built, code conventions, local dev setup       | Technical Docs |

---

## Information Architecture

We follow the [Diátaxis framework](https://diataxis.fr/) to separate documentation by purpose:

| Diátaxis Quadrant | Purpose                                  | GitGazer Examples                                       |
| ----------------- | ---------------------------------------- | ------------------------------------------------------- |
| **Tutorials**     | Learning-oriented, guided experience     | "Set up your first integration"                         |
| **How-to Guides** | Task-oriented, solve a specific problem  | "Configure email notifications for failed jobs"         |
| **Reference**     | Information-oriented, precise & complete | API endpoint reference, database schema, config options |
| **Explanation**   | Understanding-oriented, clarify concepts | Architecture overview, auth flow, webhook pipeline      |

The two tracks map to Diátaxis as follows:

- **Track 1 (Technical Documentation)** → Explanation + Reference
- **Track 2 (User Guide)** → Tutorials + How-to Guides

---

## Track 1 — Technical Documentation

### Purpose

Explain **how GitGazer works internally** — architecture decisions, data flow, infrastructure, and the codebase structure. Target audience: contributors, operators, and architects.

### Proposed Pages

#### 1.1 Architecture Overview

**File**: `docs/technical/architecture-overview.md`
**Sidebar position**: 1

Content outline:

- **System-level diagram** — high-level box diagram showing: GitHub → Webhook Ingress (API Gateway) → REST Lambda → SQS → Worker Lambda → Aurora PostgreSQL, plus the frontend SPA served via CloudFront and the WebSocket API for live updates.
- **Monorepo structure** — table mapping each workspace (`apps/api`, `apps/web`, `packages/db`, `packages/import`, `infra`, `apps/docs`) to its purpose and tech stack.
- **Key technology choices** — brief rationale for each:
    - AWS Lambda (serverless, pay-per-use, no idle cost)
    - Aurora PostgreSQL Serverless (managed, auto-scaling, RLS)
    - Drizzle ORM (type-safe, lightweight, migration tooling)
    - Vue 3 + Radix Vue (modern, accessible, headless components)
    - Terraform (declarative IaC, repeatable deployments)

Source material:

- Root `README.md` (project structure, architecture overview)
- `AGENTS.md` (module table)
- `infra/*.tf` files (service inventory)

---

#### 1.2 Authentication & Authorization

**File**: `docs/technical/authentication.md`
**Sidebar position**: 2

Content outline:

- **Auth flow diagram** — sequence diagram: User → Cognito Hosted UI (GitHub OIDC) → API callback → set httpOnly cookies → redirect to SPA.
- **Token lifecycle** — access token, ID token, refresh token. Cookie names and attributes. Silent refresh via `POST /api/auth/refresh`. Auto-retry in `fetchWithAuth`.
- **Middleware chain** — how `authenticate` middleware extracts cookies, verifies JWTs via `aws-jwt-verify`, upserts the user, and resolves pending org-sync.
- **Public route bypass** — which routes skip authentication and why.
- **Origin check** — CSRF protection via Origin allowlist on state-changing requests.
- **RBAC** — role hierarchy (owner → admin → member → viewer), `requireRole` middleware, permission matrix by route. Reference `docs/rbac-proposal.md` as ADR.
- **WebSocket auth** — signed token generation via `GET /api/auth/ws-token`, token verification on `$connect`.

Source material:

- `apps/api/src/domains/auth/auth.routes.ts`
- `apps/api/src/shared/middleware/authentication.ts`
- `apps/api/src/shared/middleware/origin-check.ts`
- `apps/api/src/shared/middleware/public-routes.ts`
- `apps/web/src/composables/useAuth.ts`
- `infra/cognito.tf`
- `docs/rbac-proposal.md`

---

#### 1.3 Webhook Processing Pipeline

**File**: `docs/technical/webhook-pipeline.md`
**Sidebar position**: 3

Content outline:

- **Two ingress paths**:
    1. **Integration webhooks** (`POST /api/import/:integrationId`) — per-integration secret, signature verification, enqueue to SQS.
    2. **GitHub App webhooks** (`POST /api/github/webhook`) — global app secret, signature verification, app event handler.
- **SQS queue architecture** — main queue + dead-letter queue, retry policy, batch size, concurrency.
- **Worker Lambda** — SQS event source mapping, `batch-processor.ts` pipeline:
    1. Parse SQS record.
    2. Route by `taskType` (org sync vs. webhook event).
    3. Insert/upsert event into database.
    4. Post-commit side effects: WebSocket push for workflow updates, alerting for job events.
    5. Partial batch failure reporting.
- **Event types handled** — `workflow_run`, `workflow_job`, `pull_request`, `pull_request_review`, `installation`, `organization.member_added/removed`, etc.
- **Error handling** — side-effect failures are logged, not retried; core failures trigger SQS retry via partial batch response; DLQ + CloudWatch alarm for persistent failures.

Source material:

- `apps/api/src/domains/webhooks/webhooks.routes.ts`
- `apps/api/src/domains/webhooks/webhooks.middleware.ts`
- `apps/api/src/domains/webhooks/webhooks.controller.ts`
- `apps/api/src/domains/webhooks/worker/batch-processor.ts`
- `apps/api/src/domains/github-app/github-app.routes.ts`
- `apps/api/src/domains/github-app/github-app.middleware.ts`
- `apps/api/src/handlers/worker.ts`
- `infra/sqs_webhook_queue.tf`
- `infra/worker_lambda.tf`

---

#### 1.4 Database Schema & Data Model

**File**: `docs/technical/database.md`
**Sidebar position**: 4

Content outline:

- **Schema namespaces** — `gitgazer` (application data) vs. `github` (GitHub-sourced data).
- **Entity-relationship diagram** — Mermaid or image showing tables and their relationships.
- **Table reference** — for each table: purpose, key columns, relationships, RLS policy.
    - `gitgazer.users` — user identity, Cognito mapping, GitHub profile fields.
    - `gitgazer.ws_connections` — active WebSocket connections for realtime push.
    - `gitgazer.event_log_entries` — audit/event log with read state.
    - `gitgazer.integration_invitations` — pending invitations with token and expiry.
    - `gitgazer.notification_rules` — alerting rules scoped to integration.
    - `github.integrations` — integration config, secrets, GitHub App linkage.
    - `github.user_assignments` — user-to-integration membership with role.
    - `github.events` — raw GitHub event payloads.
    - `github.enterprises`, `github.organizations`, `github.repositories` — GitHub entity hierarchy.
    - `github.workflow_runs`, `github.workflow_jobs` — CI/CD execution data.
    - `github.pull_requests`, `github.pull_request_reviews` — PR data.
    - `github.workflow_run_pull_requests` — join table linking runs to PRs.
    - `github.github_app_installations` — installed GitHub App instances.
    - `github.github_app_webhooks` — app-level webhook events.
    - `github.github_org_members`, `github.pending_org_sync` — org membership sync.
- **Row-level security (RLS)** — how `withRlsTransaction` works, tenant isolation via `SET LOCAL`, role-based policies (writer, reader, analyst).
- **Migrations** — Drizzle Kit workflow: `generate` → `migrate` → `studio`.

Source material:

- `packages/db/src/schema/*.ts`
- `packages/db/src/schema/github/*.ts`
- `apps/api/drizzle/` migration files
- `packages/db/src/schema/app.ts` (roles)

---

#### 1.5 API Reference

**File**: `docs/technical/api-reference.md`
**Sidebar position**: 5

Content outline:

- **OpenAPI spec creation** — write an OpenAPI 3.1 spec (`apps/api/openapi.yaml`) derived from the route files and Zod schemas. This is a prerequisite for auto-generating the reference.
- **Auto-generated reference** — use a Docusaurus OpenAPI plugin (e.g., `docusaurus-plugin-openapi-docs`) to render the spec as interactive API docs.
- **Endpoint table** — grouped by domain, showing method, path, auth required, RBAC role, and description.
- **Domain sections** — for each API domain:
    - Auth (`/api/auth/*`)
    - Event Log (`/api/event-log/*`)
    - GitHub App (`/api/github/*`)
    - Integrations (`/api/integrations/*`)
    - Members (`/api/integrations/:integrationId/members/*`, `/api/invitations/*`)
    - Metrics (`/api/metrics/*`)
    - Notifications (`/api/notifications/*`, `/api/integrations/:integrationId/notifications/*`)
    - Overview (`/api/overview`)
    - Users (`/api/user`, `/api/auth/cognito/*`)
    - Webhooks (`/api/import/:integrationId`)
    - Workflows (`/api/workflows`)
- **Request/response examples** — at minimum for the most-used endpoints.
- **Error response format** — standard error shape, common HTTP status codes.
- **Pagination** — cursor-based pagination pattern used in workflows and event log.
- **Rate limiting / throttling** — if applicable, document any API Gateway throttling.

Source material:

- All `*.routes.ts` files in `apps/api/src/domains/`
- Controller files for request/response shapes
- Zod validation schemas if present

---

#### 1.6 Infrastructure & Deployment

**File**: `docs/technical/infrastructure.md`
**Sidebar position**: 6

Content outline:

- **AWS service map** — table listing every AWS service used, its purpose, and the Terraform file that provisions it:

    | Service                    | Purpose                                     | Terraform File                                 |
    | -------------------------- | ------------------------------------------- | ---------------------------------------------- |
    | API Gateway v2 (HTTP)      | REST API ingress                            | `api_rest.tf`                                  |
    | API Gateway v2 (WebSocket) | Realtime updates                            | `api_websocket.tf`                             |
    | Lambda (REST)              | API request handling                        | `api_rest_lambda.tf`                           |
    | Lambda (WebSocket)         | WS connect/disconnect                       | `api_websocket_lambda.tf`                      |
    | Lambda (Worker)            | Async webhook processing                    | `worker_lambda.tf`                             |
    | Lambda (Org Sync)          | Scheduled org member sync                   | `org_sync_scheduler.tf`                        |
    | Aurora PostgreSQL          | Primary database                            | `rds.tf`                                       |
    | RDS Proxy                  | Connection pooling                          | `rds.tf`                                       |
    | Cognito                    | Authentication                              | `cognito.tf`                                   |
    | SQS                        | Webhook processing queue                    | `sqs_webhook_queue.tf`                         |
    | CloudFront                 | CDN for UI and docs                         | `cloudfront.tf`, `cloudfront_docs.tf`          |
    | S3                         | Static hosting (UI, docs, Lambda artifacts) | `s3_ui.tf`, `s3_docs.tf`, `s3_lambda_store.tf` |
    | Route 53                   | DNS                                         | `route53.tf`                                   |
    | KMS                        | Encryption                                  | `kms.tf`                                       |
    | Secrets Manager            | Secret storage                              | `secrets.tf`                                   |
    | SES                        | Transactional email                         | `ses.tf`                                       |
    | Amazon Bedrock             | AI-powered analytics queries                | `analytics_bedrock.tf`                         |
    | VPC                        | Network isolation                           | `vpc.tf`                                       |
    | EC2 (Bastion)              | Database access                             | `bastion.tf`                                   |

- **Deployment workflow** — step-by-step: build Lambda zips → upload to S3 → `terraform apply` → CloudFront invalidation.
- **Environment variables & secrets** — which env vars each Lambda needs, where secrets are stored.
- **Networking** — VPC layout, subnets, security groups, RDS Proxy connectivity.

Source material:

- All `infra/*.tf` files
- Root `README.md` (deployment section)

---

#### 1.7 Real-time Updates (WebSocket)

**File**: `docs/technical/websocket.md`
**Sidebar position**: 7

Content outline:

- **Architecture** — API Gateway v2 WebSocket API → Lambda (`$connect`, `$disconnect`) → connection stored in `ws_connections` table → Worker pushes updates via API Gateway Management API.
- **Auth** — client fetches signed token via `GET /api/auth/ws-token`, passes as query param on connect.
- **Message types** — what events are pushed (workflow_run updates, workflow_job updates).
- **Client implementation** — how the workflows store (`apps/web/src/stores/workflows.ts`) manages the WebSocket lifecycle, reconnection, and state updates.
- **Scaling considerations** — connection limits, fan-out per integration.

Source material:

- `infra/api_websocket.tf`, `infra/api_websocket_lambda.tf`
- `apps/api/src/handlers/websocket.ts`
- `apps/web/src/stores/workflows.ts`
- `apps/api/src/domains/webhooks/worker/batch-processor.ts` (push side effects)

---

#### 1.8 Local Development Guide

**File**: `docs/technical/local-development.md`
**Sidebar position**: 8

Content outline:

- **Prerequisites** — Node.js 24, pnpm, AWS credentials, hosts file entry.
- **Full local mode** — frontend (Vite on 5173) + backend (Lambda dev server on 8080), Vite proxy config.
- **Hybrid mode** — local frontend proxied to production API, when to use it.
- **Database access** — bastion tunnel for Aurora, Drizzle Studio.
- **Running tests** — `pnpm run test:unit` in `apps/api/`.
- **Common issues & troubleshooting** — CORS, cookie domain, certificate trust, port conflicts.

Source material:

- `docs/local-development.md` (existing, most content migrates here)
- `apps/api/README.md`
- `apps/web/README.md`

---

### Track 1 Summary Table

| #   | Page                           | Diátaxis Type | Est. Length                     | Priority |
| --- | ------------------------------ | ------------- | ------------------------------- | -------- |
| 1.1 | Architecture Overview          | Explanation   | ~1,500 words + diagrams         | P0       |
| 1.2 | Authentication & Authorization | Explanation   | ~2,000 words + sequence diagram | P0       |
| 1.3 | Webhook Processing Pipeline    | Explanation   | ~1,500 words + flow diagram     | P0       |
| 1.4 | Database Schema & Data Model   | Reference     | ~2,500 words + ER diagram       | P1       |
| 1.5 | API Reference                  | Reference     | ~3,000 words + tables           | P1       |
| 1.6 | Infrastructure & Deployment    | Reference     | ~2,000 words + table            | P1       |
| 1.7 | Real-time Updates (WebSocket)  | Explanation   | ~1,000 words + diagram          | P2       |
| 1.8 | Local Development Guide        | How-to        | ~1,500 words                    | P0       |

---

## Track 2 — User Guide

### Purpose

Guide **end users** through using GitGazer — from first sign-in to advanced configuration. Task-oriented, outcome-focused. No architecture details, no code.

### Proposed Pages

#### 2.1 Getting Started

**File**: `docs/user-guide/getting-started.md`
**Sidebar position**: 1

Content outline:

- **What is GitGazer?** — one paragraph: "GitGazer monitors your GitHub Actions workflows in real time, sends you alerts when things break, and gives you analytics to understand your CI/CD health."
- **Signing in** — click "Sign in with GitHub", authorize, redirected to app. Mention Cognito is transparent to the user.
- **First-time experience** — what you see after login: empty state with prompt to create your first integration.
- **Quick orientation** — screenshot-annotated sidebar navigation: Overview, Dashboards, Workflows, Notifications, Event Log, Integrations.

---

#### 2.2 Setting Up Your First Integration

**File**: `docs/user-guide/integrations.md`
**Sidebar position**: 2

Content outline:

- **What is an integration?** — an integration connects GitGazer to a GitHub organization or user account. It's the top-level container for all your monitored workflows.
- **Tutorial: Create an integration**
    1. Navigate to Integrations page.
    2. Click "New Integration".
    3. Enter a name.
    4. Install the GitGazer GitHub App on your org/account.
    5. Select which repositories to grant access to.
    6. Confirm — GitGazer starts receiving webhook events.
- **Managing integrations** — edit, delete, rotate webhook secret.
- **GitHub App vs. manual webhook** — when and why you'd use each approach.
- **Webhook event subscriptions** — which GitHub events GitGazer listens to, how to enable/disable specific event types.
- **Org sync settings** — auto-syncing GitHub org members, configuring default role for synced members.

---

#### 2.3 Monitoring Workflows

**File**: `docs/user-guide/workflows.md`
**Sidebar position**: 3

Content outline:

- **Workflows page overview** — real-time table of workflow runs across all your integrations.
- **Filtering** — by repository, workflow name, status, branch, actor. Explain saved filter views if applicable.
- **Live updates** — runs update in real time via WebSocket. No manual refresh needed.
- **Run details** — expanding a run to see individual jobs, steps, durations, and logs.
- **Infinite scroll** — how pagination works (loads more as you scroll).

---

#### 2.4 Using the Overview Dashboard

**File**: `docs/user-guide/overview.md`
**Sidebar position**: 4

Content outline:

- **What the Overview shows** — high-level health of all your workflows at a glance.
- **Stat cards** — total runs, success rate, failure count, etc.
- **Status distribution** — visual breakdown of run statuses.
- **Recent workflows** — quick-access list of latest runs.
- **Date range filtering** — selecting time windows to scope the data.

---

#### 2.5 Dashboards & Analytics

**File**: `docs/user-guide/dashboards.md`
**Sidebar position**: 5

Content outline:

- **What are dashboards?** — customizable analytics views for CI/CD metrics (DORA/SPACE style).
- **Navigating dashboards** — selecting a dashboard, understanding the dashboard list.
- **Available widgets** — describe each metric/chart type available.
- **Filters** — granularity (daily, weekly, monthly), date range, repository filter, topic filter.
- **Interpreting metrics** — what each metric tells you and what "good" looks like.
- ~~AI-powered analytics~~ — _Bedrock-powered analytics is planned but not yet user-facing. Omit from user guide until feature is exposed._

---

#### 2.6 Configuring Notifications

**File**: `docs/user-guide/notifications.md`
**Sidebar position**: 6

Content outline:

- **What are notification rules?** — automated alerts triggered by GitHub event conditions.
- **Tutorial: Create a notification rule**
    1. Go to Notifications page.
    2. Click "Create Rule".
    3. Select the integration.
    4. Define conditions (e.g., workflow_job failed, specific repository, specific workflow).
    5. Choose notification channel (email via SES).
    6. Save and enable.
- **Managing rules** — edit, delete, enable/disable.
- **Notification channels** — Slack webhook (current primary channel). How to configure a Slack incoming webhook URL. Note on future extensibility for additional channels.
- **Permissions** — which roles can create/edit notification rules.

---

#### 2.7 Event Log

**File**: `docs/user-guide/event-log.md`
**Sidebar position**: 7

Content outline:

- **What is the event log?** — a chronological record of all significant events across your integrations.
- **Reading the event log** — understanding event entries, timestamps, event types.
- **Filtering** — by type, integration, date range.
- **Read/unread state** — marking events as read, "mark all read" action.
- **Event log stats** — the stats summary at the top of the page.

---

#### 2.8 Managing Team Members

**File**: `docs/user-guide/team-management.md`
**Sidebar position**: 8

Content outline:

- **Roles** — owner, admin, member, viewer. What each can do (permission matrix).
- **Inviting members** — via email or shareable invitation link.
- **Changing roles** — promoting/demoting members (admin+ only).
- **Removing members** — revoking access.
- **Leaving an integration** — self-service leave.
- **Accepting an invitation** — walkthrough of the invite acceptance flow.
- **Org member auto-sync** — how GitHub org membership auto-creates GitGazer memberships.

---

### Track 2 Summary Table

| #   | Page                              | Diátaxis Type | Est. Length                | Priority |
| --- | --------------------------------- | ------------- | -------------------------- | -------- |
| 2.1 | Getting Started                   | Tutorial      | ~800 words + screenshots   | P0       |
| 2.2 | Setting Up Your First Integration | Tutorial      | ~1,500 words + screenshots | P0       |
| 2.3 | Monitoring Workflows              | How-to        | ~1,000 words + screenshots | P0       |
| 2.4 | Using the Overview Dashboard      | How-to        | ~800 words + screenshots   | P1       |
| 2.5 | Dashboards & Analytics            | How-to        | ~1,200 words + screenshots | P1       |
| 2.6 | Configuring Notifications         | Tutorial      | ~1,200 words + screenshots | P0       |
| 2.7 | Event Log                         | How-to        | ~600 words                 | P2       |
| 2.8 | Managing Team Members             | How-to        | ~1,000 words               | P1       |

---

## Docusaurus Structure & Sidebar Config

### File Tree

```
apps/docs/docs/
├── index.md                              # Landing page (updated)
├── technical/
│   ├── _category_.json                   # { "label": "Technical Documentation", "position": 2 }
│   ├── architecture-overview.md
│   ├── authentication.md
│   ├── webhook-pipeline.md
│   ├── database.md
│   ├── api-reference.md
│   ├── infrastructure.md
│   ├── websocket.md
│   └── local-development.md
└── user-guide/
    ├── _category_.json                   # { "label": "User Guide", "position": 3 }
    ├── getting-started.md
    ├── integrations.md
    ├── workflows.md
    ├── overview.md
    ├── dashboards.md
    ├── notifications.md
    ├── event-log.md
    └── team-management.md
```

### Sidebar

The current autogenerated sidebar (`{ type: 'autogenerated', dirName: '.' }`) will automatically pick up the folder structure and `_category_.json` positioning. No custom sidebar config changes are needed initially.

### Landing Page (`index.md`) Update

Replace the placeholder content with:

- A brief "What is GitGazer?" paragraph.
- Two card-style links: **User Guide** → "Learn how to use GitGazer" and **Technical Docs** → "Understand how GitGazer works".
- A quick links section pointing to the most important pages.

---

## Writing Standards

### Voice & Tone

- Second person ("you"), present tense, active voice.
- Direct and concise. No filler sentences.
- Technical precision without jargon — define terms on first use.

### Formatting Rules

- Every page has a frontmatter block with `sidebar_position`, `title`, and optional `description`.
- Headings: H1 is the page title (from frontmatter). Body starts with H2.
- Code blocks specify language: ` ```bash `, ` ```typescript `, ` ```sql `.
- Tables for structured comparisons (roles, endpoints, config options).
- Admonitions for callouts: `:::tip`, `:::warning`, `:::info`, `:::danger`.

### Diagrams

- **Use Mermaid for all diagrams.** Install `@docusaurus/theme-mermaid` and enable in `docusaurus.config.ts` (add `themes: ['@docusaurus/theme-mermaid']` and `markdown: { mermaid: true }`).
- Architecture diagrams: C4 level 1 (system context) and level 2 (container).
- Sequence diagrams for auth flow and webhook pipeline.
- Fallback to static images in `static/img/docs/` only if Mermaid can't express a specific diagram.

### Screenshots

- Capture at 1440px width for consistency.
- Store in `static/img/docs/user-guide/` with descriptive names (e.g., `workflows-page-filters.png`).
- Use light theme for screenshots (more readable in docs).
- Add alt text on every image.

### Code Examples

- Every code example must be copy-pasteable and correct.
- For API examples, use `curl` with placeholder values clearly marked (`YOUR_TOKEN`, `YOUR_INTEGRATION_ID`).
- For config examples, show the minimal working config first, then expand.

---

## Content Inventory & Source Mapping

Existing content that should be migrated or referenced:

| Existing Source                         | Target Page                            | Action                           |
| --------------------------------------- | -------------------------------------- | -------------------------------- |
| Root `README.md` (architecture section) | 1.1 Architecture Overview              | Extract and expand               |
| Root `README.md` (deployment section)   | 1.6 Infrastructure & Deployment        | Extract and expand               |
| `docs/local-development.md`             | 1.8 Local Development Guide            | Migrate and restructure          |
| `docs/rbac-proposal.md`                 | 1.2 Authentication (RBAC section)      | Reference as ADR, summarize      |
| `docs/org-member-auto-sync-plan.md`     | 2.8 Team Management (org sync section) | Summarize user-facing behavior   |
| `docs/guided-tour-ux-spec.md`           | 2.1 Getting Started                    | Reference for first-time UX flow |
| `apps/api/README.md`                    | 1.8 Local Development Guide            | Merge backend dev setup          |
| `apps/web/README.md`                    | 1.8 Local Development Guide            | Merge frontend dev setup         |

---

## Execution Phases

### Phase 1 — Foundation (P0 pages)

**Goal**: Cover the critical path — a user can understand what GitGazer is, set it up, and a developer can understand the architecture.

Pages to write:

1. `index.md` — Updated landing page
2. `technical/architecture-overview.md` — System overview with diagrams
3. `technical/authentication.md` — Auth flow end-to-end
4. `technical/webhook-pipeline.md` — Core data pipeline
5. `technical/local-development.md` — Developer onboarding
6. `user-guide/getting-started.md` — User onboarding
7. `user-guide/integrations.md` — First integration setup
8. `user-guide/workflows.md` — Core monitoring feature
9. `user-guide/notifications.md` — Alert configuration

**Deliverables**: 9 pages, estimated ~12,000 words total.

**Prerequisites before writing**:

- Install `@docusaurus/theme-mermaid` and configure Mermaid support in `docusaurus.config.ts`.
- Capture screenshots of current UI for user guide pages.
- Create `static/img/docs/` directory structure.
- Create `docs/archive/` folder for planning documents that will be migrated.

### Phase 2 — Complete Coverage (P1 pages)

**Goal**: Fill in reference material and remaining user guide pages.

Pages to write:

1. `technical/database.md` — Schema reference with ER diagram
2. `technical/api-reference.md` — Full endpoint reference (auto-generated from OpenAPI spec)
3. `technical/infrastructure.md` — AWS service inventory
4. `user-guide/overview.md` — Overview dashboard usage
5. `user-guide/dashboards.md` — Analytics features
6. `user-guide/team-management.md` — Member & role management

**Prerequisites for Phase 2**:

- Write OpenAPI 3.1 spec (`apps/api/openapi.yaml`) covering all API domains.
- Evaluate and install `docusaurus-plugin-openapi-docs` for rendering.

**Post-migration cleanup**:

- Move `docs/rbac-proposal.md` → `docs/archive/rbac-proposal.md`
- Move `docs/org-member-auto-sync-plan.md` → `docs/archive/org-member-auto-sync-plan.md`
- Move `docs/guided-tour-ux-spec.md` → `docs/archive/guided-tour-ux-spec.md`
- Move `docs/local-development.md` → `docs/archive/local-development.md`

**Deliverables**: 6 pages + OpenAPI spec, estimated ~10,500 words total.

### Phase 3 — Polish & Extend (P2 pages)

**Goal**: Complete remaining pages and add quality-of-life improvements.

Pages to write:

1. `technical/websocket.md` — Real-time system deep dive
2. `user-guide/event-log.md` — Event log usage

Enhancements:

- Add search (Algolia or `@cmfcmf/docusaurus-search-local`).
- Add "Edit this page" links (already configured in `docusaurus.config.ts`).
- Review and update `navbar` and `footer` links for new page structure.
- Cross-link between technical and user guide where relevant.

**Deliverables**: 2 pages + site enhancements.

---

## Resolved Decisions

| #   | Question                                                                                       | Decision                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should we install `@docusaurus/theme-mermaid` for inline diagrams, or use pre-rendered images? | **Mermaid** — inline, editable, version-controlled as text. Install `@docusaurus/theme-mermaid`.                                               |
| 2   | Are there additional notification channels beyond email (Slack, webhook) planned?              | **Slack webhook is the current channel.** Document Slack webhook setup. Note extensibility for future channels.                                |
| 3   | Is the Bedrock-powered analytics feature user-facing or internal-only?                         | **Planned but not yet exposed to users.** Omit from user guide for now. Add a placeholder section in technical docs only.                      |
| 4   | Should the API reference be auto-generated (e.g., from OpenAPI spec) or hand-written?          | **Auto-generated from OpenAPI spec.** Requires creating an OpenAPI spec first — add this as a prerequisite task in Phase 2.                    |
| 5   | Do we want to version docs alongside releases, or keep a single "latest" version?              | **Single "latest" version.** No Docusaurus versioning config needed. Simpler to maintain.                                                      |
| 6   | Should the existing `docs/*.md` planning documents remain as-is, or be moved/archived?         | **Migrate relevant content into Docusaurus, then archive.** Move originals to `docs/archive/` after migration. Reference as ADRs where useful. |
