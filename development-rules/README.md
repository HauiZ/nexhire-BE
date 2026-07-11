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

## Rule contract

- These rules are the source of truth for new code and refactors.
- If implementation and rules disagree, do not silently follow either side:
  - prefer security and correctness first,
  - update code when the rule is correct,
  - update rules when the implementation represents the intended architecture.
- Any new project-wide pattern must update this folder in the same change.
- Avoid one-off local conventions inside a feature; promote repeated patterns into these rules.
- "Known follow-up work" describes target architecture that is not fully implemented yet.

## Feature definition of done

- Controller is thin and Swagger-decorated.
- Service owns business logic and returns response DTO/plain response objects.
- DTO validation exists for request bodies, params, and queries.
- Errors use standard `ERROR_CODES` and the global error envelope.
- Protected endpoints use shared auth decorators/guards and ownership checks.
- Schema changes include reviewed migrations.
- Events and headers use shared constants.
- Env changes update `.env.example`, validation schema, and namespaced config.
- Unit tests cover core happy paths and risky error paths.
- `npm run build` and relevant tests pass.

## Operational memory

Use this section as the first quick-read context when starting a new session.

### Current architecture

- This repo is already migrated from the old service layout to the new layout.
- Active deployable apps are:
  - `gateway`
  - `auth-service`
  - `candidate-service`
  - `company-service`
  - `job-service`
  - `application-service`
  - `cv-parsing-service`
  - `matching-service`
  - `notification-service`
  - `document-storage-service`
- Legacy apps `auth`, `job`, `cv-app`, `ai`, and `notification` were removed from `apps/`.

### Domain boundaries

- `auth-service`: login, JWT issuing, Redis-backed refresh token rotation/revocation, logout, password and email flows, authorization primitives.
- `candidate-service`: candidate profile, CVs, saved jobs.
- `company-service`: company profile and HR accounts.
- `job-service`: jobs and job categories.
- `application-service`: applications and interview stage flow.
- `cv-parsing-service`: AI CV parsing.
- `matching-service`: AI CV-JD matching.
- `notification-service`: email and web push notifications.
- `document-storage-service`: uploaded document metadata, upload API, and object-storage gateway.

### Gateway routing map

- `auth/*`, `users/*` -> `auth-service`
- `candidates/*`, `cvs/*`, `saved-jobs/*` -> `candidate-service`
- `companies/*`, `hr-accounts/*` -> `company-service`
- `jobs/*`, `categories/*` -> `job-service`
- `applications/*` -> `application-service`
- `cv-parsing/*` -> `cv-parsing-service`
- `matching/*` -> `matching-service`
- `notifications/*` -> `notification-service`
- `documents/*` -> `document-storage-service`

### Persistence model

- DB-owning services each have their own PostgreSQL database:
  - `auth_service_db`
  - `candidate_service_db`
  - `company_service_db`
  - `job_service_db`
  - `application_service_db`
  - `cv_parsing_service_db`
  - `matching_service_db`
  - `document_storage_service_db`
- `gateway` and `notification-service` do not own a Postgres database in the current layout.
- Cross-service relations must store foreign IDs only, never ORM relations across apps.

### Infra model

- `RabbitMQ` is the async backbone for domain events.
- `Redis` is for cache, token store, and rate limit support.
- `MinIO` is the object storage backend.
- `gateway` applies a global throttle plus stricter route-specific throttles for sensitive public auth endpoints.
- `document-storage-service` is the intended boundary between business services and MinIO/S3.
- Shared reusable adapters live in `@nexhire/infra`.
- Shared contracts and cross-cutting Nest pieces live in `@nexhire/shared`.

### Important implementation notes

- Build currently succeeds with `npm run build`.
- For a new coding session, read these files first before scanning feature code:
  - `development-rules/README.md`
  - `README.md`
  - `nest-cli.json`
  - `package.json`
  - `apps/gateway/src/config/gateway.config.ts`
  - `apps/gateway/src/proxy/proxy.controller.ts`
- When adding a new service:
  - register it in `nest-cli.json`
  - add `start:*` script in `package.json`
  - update `.env.example`
  - update `scripts/migration.js`, `scripts/generate.js`, `scripts/migrate.js`
  - update `scripts/init-databases.sql` if the service owns a DB
  - update gateway config, validation, and proxy routing if it is HTTP-exposed
  - update this file and `README.md`
- Manual live API flow scripts live under `test/test-flows/` and run with:
  - `npm run test:script test\test-flows\test-auth-api.ts`
  - `npm run test:script test\test-flows\test-document-storage-api.ts`
- Every DB-owning app should have:
  - `data-source.ts`
  - `src/<service>.module.ts`
  - `src/config/*`
  - `src/health/*`
  - `src/migrations/`
  - `Dockerfile`
  - `tsconfig.app.json`

### Known follow-up work

- `auth-service` has Redis-backed refresh token rotation/revocation/logout and gateway-level auth endpoint throttles; consider Redis-backed/shared throttler storage before horizontal gateway scaling.
- `cv-parsing-service` and `matching-service` should be checked carefully whenever config namespaces change because their Gemini client wiring is easy to drift.
- `document-storage-service` currently supports upload + metadata persistence; it still needs download/list/delete workflows if product work continues there.
- Some rule files are intentionally shortened summaries; expand them if the team wants stronger prescriptive guidance again.
