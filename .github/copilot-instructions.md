# GitGazer Copilot Instructions

> **Source of truth:** Project architecture, conventions, agents, and skills live in [AGENTS.md](../AGENTS.md). Read it first. This file only adds GitHub Copilot **coding-agent** task guidance that AGENTS.md does not cover — it intentionally avoids duplicating architecture details.

GitGazer is a GitHub workflow monitoring and notification system on AWS serverless (a pnpm monorepo). For the tech stack, path aliases (`@/`, `@gitgazer/db/*`), auth model, database (Drizzle + row-level security), and per-module patterns, see:

- [AGENTS.md](../AGENTS.md) — project overview, cross-cutting conventions, agents & skills
- [apps/api/.github/backend.instructions.md](../apps/api/.github/backend.instructions.md) — backend (Lambda, Drizzle, router, middleware)
- [apps/web/.github/frontend.instructions.md](../apps/web/.github/frontend.instructions.md) — frontend (Vue 3, Radix Vue, Tailwind, Pinia)
- [infra/.github/infrastructure.instructions.md](../infra/.github/infrastructure.instructions.md) — Terraform / AWS

## Working with the Copilot Coding Agent

### Writing good issues / tasks

1. **Be specific** — state the problem, desired outcome, and acceptance criteria.
2. **Provide context** — reference the relevant files, functions, or modules.
3. **Include examples** — show expected behavior or error messages.
4. **Scope tightly** — one feature or bug per issue.
5. **List dependencies** — note any prerequisite tasks.

✅ "Add email validation to the notification rule form in `apps/web`. Validate against a standard email regex and show an error on invalid input."

✅ "Fix webhook signature verification failing for payloads over 1 MB. See the `verifyGithubSign` middleware."

❌ "Make the app better" (too vague) · ❌ "Rewrite the entire authentication system" (too broad)

### Well-suited tasks

Adding API endpoints/routes, creating or updating Vue components, writing Vitest unit tests, updating documentation, fixing bugs with a clear reproduction, adding type guards, form validation, and code-quality refactors.

### Always require human review

- Security-sensitive code (authentication, authorization, encryption)
- Infrastructure changes (Terraform resources)
- Database schema migrations
- API contract changes affecting multiple clients
- Performance-critical code paths

> For non-trivial security-sensitive changes, hand off to the **Security Engineer** agent (see [AGENTS.md](../AGENTS.md#agents)).
