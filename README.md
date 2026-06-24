# NexHire Backend

Online job-search & recruitment management system (Job Portal + ATS) on a NestJS
microservice architecture, with AI support (CV parsing, evaluation, CV/JD matching).

> Engineering conventions live in [`development-rules/`](development-rules/). Read them before contributing.

## Stack

NestJS (monorepo) - TypeORM - PostgreSQL - Redis (BullMQ) - MinIO - Gemini API.

## Services

| Service      | Port | Responsibility                           | DB schema      |
| ------------ | ---- | ---------------------------------------- | -------------- |
| gateway      | 3000 | API gateway, routing, JWT auth, Swagger  | -              |
| auth         | 3001 | user, profile, company, authentication   | `auth_schema`  |
| job          | 3002 | job posting, job search                  | `job_schema`   |
| cv-app       | 3003 | CV, application                          | `cvapp_schema` |
| ai           | 3004 | parse / evaluate / match (Gemini)        | `ai_schema`    |
| notification | 3005 | email notifications                      | -              |

## Infra (Docker)

| Service    | Port | UI                                |
| ---------- | ---- | --------------------------------- |
| PostgreSQL | 5432 | -                                 |
| Redis      | 6379 | -                                 |
| MinIO      | 9000 | console at http://localhost:9001  |

## Quick start

```bash
cp .env.example .env
# Fill the required secrets in .env:
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET  (32+ random chars each)
#   SMTP_USER, SMTP_PASS
#   GEMINI_API_KEY

make dev             # start postgres + redis + minio
make migrate-schema  # create the 4 schemas
npm install
make migrate         # run TypeORM migrations (auth -> job -> cv-app -> ai)
npm run start:all    # start all services
```

Then open:

- Swagger UI:  http://localhost:3000/api/docs
- Health:      http://localhost:3000/api/v1/health

> Run a single service: `npm run start:auth` (or `:gateway`, `:job`, `:cv-app`, `:ai`, `:notification`).
> Each service also serves its own Swagger at `http://localhost:<port>/api/docs` in development.

## Project layout

```
apps/               # 6 deployable services (gateway + 5 domain services)
packages/shared/    # @nexhire/shared - contracts & cross-cutting (enums, dto, guards, filters)
packages/infra/     # @nexhire/infra  - backing-system adapters (typeorm, redis, queue, storage)
scripts/            # migrate.sh, create-schemas.sql
development-rules/  # mandatory conventions
docker-compose.yml  # infra only (postgres / redis / minio)
```

## Architecture notes

- **Schema-per-service** on one PostgreSQL instance; services never touch another
  service's schema - they call its API.
- **Gateway** is the only entry point; it decodes the JWT (if present) and injects
  `x-user-id` / `x-user-role` to internal services. Internal services enforce auth
  (role + ownership), so public routes still pass through.
- **Async work** (AI parsing/matching, email) goes through Redis/BullMQ queues,
  not blocking requests.
- `synchronize` is always off - schema changes go through migrations.

## Notes

- `postgres:18-alpine` and `redis:7-alpine` may already be cached locally; only
  `minio/minio:latest` typically needs pulling.
- On Windows, run `make` targets from Git Bash, or use the underlying `npm run` /
  `docker compose` commands directly.
