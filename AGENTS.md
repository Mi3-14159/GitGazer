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

### Frontend Developer

**File**: `.github/agents/engineering-frontend-developer.md`

Expert Vue.js frontend developer specializing in modern web technologies, Composition API, Radix Vue headless components, Tailwind CSS 4, and Apache ECharts for data visualization.

**When to use**: Building or modifying UI components, views, composables, stores, or anything under `apps/web/`. Performance optimization, accessibility, responsive design.

**Key context**:

- Vue 3 Composition API with `<script setup>` syntax only
- UI primitives in `src/components/ui/` (Button, Input, Card, Dialog, etc.)
- Pinia stores in `src/stores/` using Composition API style
- Lucide Vue Next for icons
- Cookie-based auth (no client-side tokens)
- Detailed instructions in `apps/web/.github/frontend.instructions.md`

---

### Backend Architect

**File**: `.github/agents/engineering-backend-architect.md`

Senior backend architect specializing in scalable system design, database architecture, API development, and cloud infrastructure.

**When to use**: Designing new API endpoints, database schema changes, system architecture decisions, scaling strategies, or AWS service integration patterns.

**Key context**:

- Custom router via `@aws-lambda-powertools/event-handler/http`
- Middleware chain: `compress` → `cors` → `authenticate` → `originCheck` → handlers
- Routes in `src/domains/<domain>/<domain>.routes.ts`
- AWS clients centralized in `src/shared/clients/`
- Drizzle ORM with `withRlsTransaction` for database access
- Detailed instructions in `apps/api/.github/backend.instructions.md`

---

### Senior Developer

**File**: `.github/agents/engineering-senior-developer.md`

Premium full-stack implementation specialist. Masters Vue.js, Tailwind CSS, AWS Lambda, and Drizzle ORM. Focuses on crafting sophisticated, user-centric interfaces and seamless backend integrations.

**When to use**: Implementing features end-to-end across frontend and backend. When both polish and correctness matter — connecting API endpoints to Vue views, building complete user flows.

---

### Software Architect

**File**: `.github/agents/engineering-software-architect.md`

Expert in system design, domain-driven design, architectural patterns, and technical decision-making. Thinks in bounded contexts, trade-off matrices, and ADRs.

**When to use**: Evaluating architectural trade-offs, proposing structural changes, creating ADRs, domain modeling, or deciding between competing design approaches.

---

### Code Reviewer

**File**: `.github/agents/engineering-code-reviewer.md`

Expert code reviewer providing constructive, actionable feedback focused on correctness, maintainability, security, and performance.

**When to use**: Reviewing PRs or code changes. Uses priority markers: 🔴 blocker, 🟡 suggestion, 💭 nit.

---

### Security Engineer

**File**: `.github/agents/engineering-security-engineer.md`

Application security engineer specializing in threat modeling, vulnerability assessment, secure code review, and security architecture for web and cloud-native applications.

**When to use**: Security reviews, threat modeling, vulnerability assessment, reviewing auth flows, validating webhook signature verification, checking for OWASP Top 10 issues.

**Key context**:

- Webhook validation via `verifyGithubSign` middleware
- Cognito OAuth with httpOnly session cookies
- RDS row-level security via `withRlsTransaction`
- KMS encryption, Secrets Manager for sensitive config
- IAM least-privilege policies defined in `infra/`

---

### UI Designer

**File**: `.github/agents/design-ui-designer.md`

Expert UI designer specializing in visual design systems, component libraries, and pixel-perfect interface creation. Creates consistent, accessible user interfaces.

**When to use**: Design system work, component library refinement, visual consistency reviews, creating new UI patterns, accessibility compliance.

---

### UX Architect

**File**: `.github/agents/design-ux-architect.md`

Technical architecture and UX specialist who provides developers with solid foundations, CSS systems, and clear implementation guidance.

**When to use**: Establishing CSS architecture, layout frameworks, information architecture, responsive strategies, and developer-ready UX foundations.

---

## Skills

| Skill                  | File                                           | Use When                                                           |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `refactor`             | `.github/skills/refactor/SKILL.md`             | Improving code structure without changing behavior                 |
| `refactor-plan`        | `.github/skills/refactor-plan/SKILL.md`        | Planning multi-file refactors with sequencing and rollback         |
| `typescript-magician`  | `.github/skills/typescript-magician/SKILL.md`  | Complex generics, type guards, removing `any`, resolving TS errors |
| `documentation-writer` | `.github/skills/documentation-writer/SKILL.md` | Writing documentation following the Diátaxis framework             |

---

## Module Instructions

Detailed, context-specific instructions are scoped to each module:

| Module   | Instructions File                              | Applies To                    |
| -------- | ---------------------------------------------- | ----------------------------- |
| Backend  | `apps/api/.github/backend.instructions.md`     | `apps/api/**/*.{ts,json}`     |
| Frontend | `apps/web/.github/frontend.instructions.md`    | `apps/web/**/*.{vue,ts,json}` |
| Infra    | `infra/.github/infrastructure.instructions.md` | `infra/**/*.{tf,tfvars}`      |

**Always consult the relevant module instructions before making changes in that area.**

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
