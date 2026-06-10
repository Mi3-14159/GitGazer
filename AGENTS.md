# AGENTS.md — GitGazer

## Project Overview

GitGazer is a GitHub workflow monitoring and notification system built on AWS serverless architecture. It is a **pnpm monorepo** with `apps/` and `packages/` workspaces.

### Architecture

| Module             | Purpose                                  | Tech Stack                                              |
| ------------------ | ---------------------------------------- | ------------------------------------------------------- |
| `apps/api/`        | AWS Lambda backend (REST API + webhooks) | TypeScript, Node.js 24, AWS Lambda, Drizzle ORM         |
| `apps/web/`        | SPA frontend                             | Vue 3, Radix Vue, Tailwind CSS 4, Pinia, Vite           |
| `packages/db/`     | Shared database schema and types         | Drizzle ORM, TypeScript                                 |
| `packages/import/` | Historical GitHub Actions data backfill  | TypeScript                                              |
| `infra/`           | Infrastructure as code                   | Terraform, AWS (Lambda, API GW, RDS Aurora PG, Cognito) |

### Key Conventions

- **Package manager**: pnpm (monorepo with `pnpm-workspace.yaml`)
- **Path aliases**: Use `@/` for `src/` in both `apps/api` and `apps/web`. Use `@gitgazer/db/*` for shared DB package. **Never** use relative `../../../` imports.
- **Database**: Drizzle ORM with Aurora PostgreSQL Serverless. Row-level security via `withRlsTransaction`.
- **Auth**: AWS Cognito with OAuth, httpOnly cookies — no client-side token storage.
- **Logging**: AWS Powertools Logger (structured logging) in the backend.
- **Testing**: Vitest for backend unit tests. Mock all AWS services — never call real APIs in tests.

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

| Skill                  | File                                           | Use When                                                           |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `refactor`             | `.github/skills/refactor/SKILL.md`             | Improving code structure without changing behavior                 |
| `typescript-magician`  | `.github/skills/typescript-magician/SKILL.md`  | Complex generics, type guards, removing `any`, resolving TS errors |
| `documentation-writer` | `.github/skills/documentation-writer/SKILL.md` | Writing documentation following the Diátaxis framework             |
| `db-migration`         | `.github/skills/db-migration/SKILL.md`         | Adding/altering tables, RLS tenant policies, Drizzle migrations    |
| `new-domain`           | `.github/skills/new-domain/SKILL.md`           | Scaffolding a new backend domain under `apps/api/src/domains/`     |
| `webhook-event`        | `.github/skills/webhook-event/SKILL.md`        | Supporting/debugging a GitHub webhook event in the ingest pipeline |

---

## Module Instructions

Detailed, context-specific instructions are scoped to each module:

| Module   | Instructions File                              | Applies To                    |
| -------- | ---------------------------------------------- | ----------------------------- |
| Backend  | `apps/api/.github/backend.instructions.md`     | `apps/api/**/*.{ts,json}`     |
| Frontend | `apps/web/.github/frontend.instructions.md`    | `apps/web/**/*.{vue,ts,json}` |
| Infra    | `infra/.github/infrastructure.instructions.md` | `infra/**/*.{tf,tfvars}`      |

**Always consult the relevant module instructions before making changes in that area.**

If module-specific instructions conflict with this file, module instructions take precedence for implementation details, but AGENTS.md takes precedence for cross-cutting conventions (path aliases, package manager, auth patterns).

---

## Common Commands

### Backend (`apps/api/`)

```bash
pnpm run dev:api          # Local dev server (port 8080, requires AWS creds)
pnpm run test:unit        # Run Vitest unit tests
pnpm run buildZip         # Build + package Lambda zips to tmp/
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
cd apps/api
npx drizzle-kit generate  # Generate migration from schema changes
npx drizzle-kit migrate   # Run pending migrations
npx drizzle-kit studio    # Open Drizzle Studio GUI
```
