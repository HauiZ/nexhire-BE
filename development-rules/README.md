# NexHire Backend — Development Rules

> **Mandatory** code-pattern and convention rules for the NexHire Backend project.
> Read the relevant file **before** writing code for that layer. PRs that violate these rules get a request-changes.

## Project context

- **Topic:** Online job-search & recruitment management system (Job Portal + ATS) on a microservice architecture.
- **Focus:** 80% recruitment core (user / company / job / CV / application) + 20% AI support (CV parsing, evaluation, CV↔JD matching).
- **Stack:** NestJS monorepo · TypeORM · PostgreSQL · Redis (BullMQ) · MinIO · Gemini API.

## Services

| Service | Port | Responsibility | DB schema |
|---------|------|----------------|-----------|
| `gateway` | 3000 | API gateway, routing, auth guard, Swagger | — |
| `auth` | 3001 | user, profile, company, authentication | `auth_schema` |
| `job` | 3002 | job posting, job search | `job_schema` |
| `cv-app` | 3003 | CV, application | `cvapp_schema` |
| `ai` | 3004 | parse / evaluate / match (Gemini) | `ai_schema` |
| `notification` | 3005 | email notifications | — |

## Rule index

| File | Content |
|------|---------|
| [01-project-structure.md](01-project-structure.md) | Monorepo layout, per-service folders, where things live |
| [02-naming-conventions.md](02-naming-conventions.md) | Files, classes, variables, DB, routes |
| [03-import-conventions.md](03-import-conventions.md) | Path aliases, import order, barrels, no circular deps |
| [04-module-patterns.md](04-module-patterns.md) | NestJS module composition, providers, exports |
| [05-controller-patterns.md](05-controller-patterns.md) | Thin controllers, routing, Swagger, responses |
| [06-service-patterns.md](06-service-patterns.md) | Business logic, repositories, transactions |
| [07-dto-patterns.md](07-dto-patterns.md) | Request/response DTOs, validation, mapping |
| [08-entity-patterns.md](08-entity-patterns.md) | TypeORM entities, base entity, relations, migrations |
| [09-error-handling.md](09-error-handling.md) | Exceptions, global filter, error codes, envelope |
| [10-config-patterns.md](10-config-patterns.md) | ConfigModule, registerAs, env validation |
| [11-auth-and-tenancy.md](11-auth-and-tenancy.md) | JWT, guards, roles, ownership, company isolation |
| [12-infrastructure-patterns.md](12-infrastructure-patterns.md) | Postgres, Redis/queues, MinIO, HTTP, Gemini client |
| [13-testing-conventions.md](13-testing-conventions.md) | Unit/e2e tests, mocking, coverage |
| [14-code-quality.md](14-code-quality.md) | Lint, format, no-`any`, comments, dead code |

## Priority on conflict

`Security` > `Correctness` > `Project convention` > `Personal preference`.
