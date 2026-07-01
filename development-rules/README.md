# NexHire Backend - Development Rules

> Mandatory code-pattern and convention rules for the NexHire Backend project.

## Project context

- Topic: online job-search & recruitment management system on a microservice architecture.
- Focus: recruitment core plus AI support for CV parsing, CV-JD matching, and document storage.
- Stack: NestJS monorepo, TypeORM, PostgreSQL, RabbitMQ, Redis, MinIO, Gemini API.

## Services

| Service | Port | Responsibility | Database |
| ------- | ---- | -------------- | -------- |
| `gateway` | 3000 | API gateway, routing, auth guard, Swagger | - |
| `auth-service` | 3001 | authentication, JWT issuing, authorization | `auth_service_db` |
| `candidate-service` | 3002 | candidate profile, CV, saved jobs | `candidate_service_db` |
| `company-service` | 3003 | company profile and HR accounts | `company_service_db` |
| `job-service` | 3004 | job posting lifecycle and categories | `job_service_db` |
| `application-service` | 3005 | application journey and interview stages | `application_service_db` |
| `cv-parsing-service` | 3006 | CV parsing with AI/NLP | `cv_parsing_service_db` |
| `matching-service` | 3007 | CV-JD matching and fit score | `matching_service_db` |
| `notification-service` | 3008 | email and web push notifications | - |
| `document-storage-service` | 3009 | uploaded documents and object-storage gateway | `document_storage_service_db` |

## Shared packages

- `@nexhire/shared` - contracts & cross-cutting only.
- `@nexhire/infra` - adapters to backing systems only.
- Dependency direction: `apps -> shared`, `apps -> infra`.

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
