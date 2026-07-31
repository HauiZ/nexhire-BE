# NexHire Backend

Online job-search & recruitment management system (Job Portal + ATS) on a NestJS
microservice architecture, with AI support for CV parsing and CV/JD matching.

> Engineering conventions live in `development-rules/`. Read them before contributing.

## Stack

NestJS monorepo plus Python/FastAPI for matching - TypeORM/SQLAlchemy - PostgreSQL (database-per-service) - RabbitMQ (event bus) - Redis (cache) - MinIO - Gemini API.

## Services

| Service | Port | Responsibility | Database |
| ------- | ---- | -------------- | -------- |
| gateway | 3000 | API gateway, routing, JWT auth, Swagger | - |
| auth-service | 3001 | login, JWT issuing, refresh token, authorization | `auth_service_db` |
| candidate-service | 3002 | candidate profile, CV, saved jobs | `candidate_service_db` |
| company-service | 3003 | company profile, HR accounts | `company_service_db` |
| job-service | 3004 | job posting lifecycle, job categories | `job_service_db` |
| application-service | 3005 | application journey, interview stage flow | `application_service_db` |
| cv-parsing-service | 3006 | CV parsing with AI/NLP | `cv_parsing_service_db` |
| matching-service | 3007 | CV-JD matching request queue and fit score (Python/FastAPI) | `matching_service_db` |
| notification-service | 3008 | email and web push notifications | - |
| document-storage-service | 3009 | uploaded documents and object-storage gateway | `document_storage_service_db` |

## Infra (Docker)

| Service | Port | UI / notes |
| ------- | ---- | ---------- |
| PostgreSQL | 5436 | one instance, one database/service; container port is 5432 |
| RabbitMQ | 5672 / 15672 | management UI at `http://localhost:15672` |
| Redis | 6379 | cache / rate limit / token store |
| MinIO | 9000 / 9001 | console at `http://localhost:9001` |

## Quick start

```bash
cp .env.example .env
# Fill the required secrets in .env:
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   MAILTRAP_SMTP_USER, MAILTRAP_SMTP_PASS
#   GEMINI_API_KEY

make dev
npm install
npm run matching:venv
npm run matching:install
npm run db:all:run
npm run matching:migrate
npm run start:all
```

> The per-service databases + users are created automatically on a fresh Postgres volume by `scripts/init-databases.sql`.

Then open:

- Swagger UI: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/v1/health`

> Run a single service with `npm run start:document-storage-service` or another `start:*` script from `package.json`.

## Migration shortcuts

- Run all DB migrations: `npm run db:all:run`
- Generate DB migrations for all services: `npm run db:all:generate` or `npm run db:all:generate -- AddAuditFields`
- Run one service migration: `npm run db:auth:run`
- Show one service migration status: `npm run db:auth:show`
- Revert one service migration: `npm run db:auth:revert`
- Create empty migration: `npm run db:auth:create` or `npm run db:auth:create -- CreateAuthAuditLog`
- Generate migration from entity diff: `npm run db:auth:generate` or `npm run db:auth:generate -- AddPhoneToUsers`
- Seed auth roles: `npm run db:auth:seed`
- Run a seed file by path: `npm run seed -- scripts/seeds/demo-company-job.seed.ts`
- Available service scopes: `auth`, `candidate`, `company`, `job`, `application`, `cv-parsing`, `matching`, `document-storage`

The demo company/job seed creates approved demo companies, linked recruiter users, and published jobs for public home/search pages. Demo recruiter emails use the `@nexhire.demo` domain and share the password `Password@123`.

Run pending migrations for a service before generating a new one, then review the generated file for unrelated drops, FK churn, enum churn, or recreated existing tables.

## Auth email verification

- Registration creates a short-lived email verification token and publishes an email-delivery event.
- Verification is OTP-style via `email + token`, not a magic link requirement.
- Anti-spam resend policy is controlled by:
  - `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS`
  - `EMAIL_VERIFICATION_MAX_RESENDS`
  - `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES`

## Mailtrap

- `notification-service` uses `@nestjs-modules/mailer`, which runs on top of `nodemailer`.
- For local/dev email delivery, set `MAILTRAP_SMTP_USER` and `MAILTRAP_SMTP_PASS` in `.env`.
- Auth verification emails are published to RabbitMQ and consumed by `notification-service`.

## Project layout

```text
apps/               # 10 deployable services (gateway + 9 domain services)
packages/shared/    # @nexhire/shared - contracts & cross-cutting
packages/infra/     # @nexhire/infra  - backing-system adapters
scripts/            # migration and bootstrap helpers
development-rules/  # mandatory conventions
docker-compose.yml  # infra (postgres / rabbitmq / redis / minio)
```

## Architecture notes

- Database-per-service: each domain service owns its own PostgreSQL database.
- Gateway is the only public entry point and forwards identity headers internally.
- Document uploads should go through `document-storage-service`, which wraps object storage access.
- Long-running AI and notification flows should be event-driven via RabbitMQ.
- Cross-service data exchange should use IDs, HTTP calls, or events; not shared tables.
- `synchronize` stays off; schema changes go through migrations.
