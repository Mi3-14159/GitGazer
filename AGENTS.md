# AGENTS.md — GitGazer

## Project Overview

GitGazer is a GitHub workflow monitoring and notification system built on AWS serverless architecture. It is a **pnpm monorepo** with `apps/` and `packages/` workspaces.

### Architecture

| Module                       | Purpose                                       | Tech Stack                                              |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `apps/lambdas/*/`            | One deployable AWS Lambda per app             | TypeScript, Node.js 24, AWS Lambda, tsup                |
| `apps/web/`                  | SPA frontend                                  | Vue 3, Radix Vue, Tailwind CSS 4, Pinia, Vite           |
| `packages/backend-core/`     | Config, logger, AWS/GitHub clients            | TypeScript                                              |
| `packages/backend-services/` | Event log, alerting, org member sync          | TypeScript, Drizzle ORM                                 |
| `packages/github-import/`    | GitHub webhook payload importers              | TypeScript, Drizzle ORM                                 |
| `packages/db/`               | Shared database schema, types and migrations  | Drizzle ORM, TypeScript                                 |
| `packages/import/`           | Historical GitHub Actions data backfill (CLI) | TypeScript                                              |
| `infra/`                     | Infrastructure as code                        | Terraform, AWS (Lambda, API GW, RDS Aurora PG, Cognito) |

The lambda apps are `api`, `websocket`, `worker`, `backfill-worker`, `org-sync-scheduler` and
`http-proxy`. Each has a single `src/index.ts` entrypoint and builds exactly one
`dist/gitgazer-<name>.zip`, which is the S3 key Terraform reads.

### Key Conventions

- **Package manager**: pnpm (monorepo with `pnpm-workspace.yaml`)
- **Path aliases**: Use `@/` for `src/` within an app. Use `@gitgazer/backend-core/*`, `@gitgazer/backend-services/*`, `@gitgazer/github-import` and `@gitgazer/db/*` for shared packages. **Never** use relative `../../../` imports across projects.
- **Database**: Drizzle ORM with Aurora PostgreSQL Serverless. Row-level security via `withRlsTransaction`.
- **Auth**: AWS Cognito with OAuth, httpOnly cookies — no client-side token storage.
- **Logging**: AWS Powertools Logger (structured logging) in the backend.
- **Testing**: Vitest for backend unit tests. Mock all AWS services — never call real APIs in tests.
- **Comments**: Comment sparingly. Only add a comment when it explains a non-obvious _why_ (rationale, constraint, gotcha); don't restate what the code or a well-named symbol already says. Prefer self-documenting names over narration.

---

## Agents

GitGazer keeps a **small set of advisory/review agents** that benefit from context isolation and restricted tools. Feature implementation is handled by the **default agent**, guided by the module instruction files (see [Module Instructions](#module-instructions)) — not by separate per-stack "developer" personas.

### Software Architect

**File**: `.github/agents/engineering-software-architect.md` · **Tools**: `read, search, edit`

Expert in system design, domain-driven design, architectural patterns, and technical decision-making. Thinks in bounded contexts, trade-off matrices, and ADRs.

**When to use**: Evaluating architectural trade-offs, proposing structural changes, creating ADRs, domain modeling, or deciding between competing design approaches.

---

### Code Reviewer

**File**: `.github/agents/engineering-code-reviewer.md` · **Tools**: `read, search` (read-only)

Expert code reviewer providing constructive, actionable feedback focused on correctness, maintainability, security, and performance.

**When to use**: Reviewing PRs or code changes. Uses priority markers: 🔴 blocker, 🟡 suggestion, 💭 nit. Hands off security-sensitive changes to the Security Engineer.

---

### Security Engineer

**File**: `.github/agents/engineering-security-engineer.md` · **Tools**: `read, search` (read-only)

Application security engineer for the AWS serverless stack: threat modeling, secure code review, and vulnerability assessment.

**When to use**: Security reviews, threat modeling, reviewing auth flows, validating `verifyGithubSign` webhook signatures, checking RLS boundaries and OWASP Top 10 issues.

**Key context**:

- Webhook validation via `verifyGithubSign` middleware
- Cognito OAuth with httpOnly session cookies
- RDS row-level security via `withRlsTransaction`
- KMS encryption, Secrets Manager for sensitive config
- IAM least-privilege policies defined in `infra/`

---

## Skills

| Skill                  | File                                           | Use When                                                               |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `refactor`             | `.github/skills/refactor/SKILL.md`             | Improving code structure without changing behavior                     |
| `typescript-magician`  | `.github/skills/typescript-magician/SKILL.md`  | Complex generics, type guards, removing `any`, resolving TS errors     |
| `documentation-writer` | `.github/skills/documentation-writer/SKILL.md` | Writing documentation following the Diátaxis framework                 |
| `db-migration`         | `.github/skills/db-migration/SKILL.md`         | Adding/altering tables, RLS tenant policies, Drizzle migrations        |
| `new-domain`           | `.github/skills/new-domain/SKILL.md`           | Scaffolding a new backend domain under `apps/lambdas/api/src/domains/` |
| `webhook-event`        | `.github/skills/webhook-event/SKILL.md`        | Supporting/debugging a GitHub webhook event in the ingest pipeline     |

---

## Module Instructions

Detailed, context-specific instructions are scoped to each module:

| Module   | Instructions File                              | Applies To                                                        |
| -------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Backend  | `.github/instructions/backend.instructions.md` | `apps/lambdas/**`, `packages/backend-*`, `packages/github-import` |
| Frontend | `apps/web/.github/frontend.instructions.md`    | `apps/web/**/*.{vue,ts,json}`                                     |
| Infra    | `infra/.github/infrastructure.instructions.md` | `infra/**/*.{tf,tfvars}`                                          |

**Always consult the relevant module instructions before making changes in that area.**

If module-specific instructions conflict with this file, module instructions take precedence for implementation details, but AGENTS.md takes precedence for cross-cutting conventions (path aliases, package manager, auth patterns).

---

## Common Commands

### Build & deploy (all apps)

Every app exposes `build`, which writes an uploadable artifact to `<projectRoot>/dist`. Lambda apps
then expose `upload` (sync the zip to S3) and the static apps expose `deploy` (sync + invalidate).
Each project owns its own definition in the `nx.targets` block of its `package.json` — there is no
shared deploy script. [.github/workflows/ci_cd.yaml](.github/workflows/ci_cd.yaml) runs exactly this
for the affected projects, then calls
[.github/workflows/ci_cd_infra.yaml](.github/workflows/ci_cd_infra.yaml) to `terraform apply` — a
lambda zip only goes live once that apply repoints the pinned `s3_object_version`.

```bash
pnpm nx affected -t build upload deploy   # what CI runs
pnpm run build                            # nx run-many -t build
pnpm run deploy                           # nx run-many -t upload deploy (requires AWS creds + bucket env vars)
```

The bucket names come from the environment: `S3_BUCKET_LAMBDA_STORE` (lambdas), `FRONTEND_S3_BUCKET_NAME`
(web), `DOCS_S3_BUCKET` (docs). A missing one fails the target immediately.

### Backend (`apps/lambdas/<name>/`)

```bash
pnpm run dev:api          # api app only: local dev server (port 8080, requires AWS creds)
pnpm run test:unit        # Run Vitest unit tests
pnpm run build            # Bundle the handler + package dist/gitgazer-<name>.zip
pnpm run lint             # ESLint check
```

### Frontend (`apps/web/`)

```bash
pnpm run dev              # Vite dev server with HMR (port 5173)
pnpm run build            # Production build
vue-tsc --noEmit          # Type checking
```

### Infrastructure (`infra/`)

```bash
terraform init            # Initialize
terraform plan            # Preview changes
terraform apply           # Apply changes
terraform fmt             # Format HCL files
```

### Database (`packages/db/`)

```bash
cd packages/db
npx drizzle-kit generate  # Generate migration from schema changes
npx drizzle-kit migrate   # Run pending migrations
npx drizzle-kit studio    # Open Drizzle Studio GUI
pnpm run migrate          # Apply migrations with the checked runner
```
