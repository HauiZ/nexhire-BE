# NexHire Backend

Online job-search & recruitment management system (Job Portal + ATS) on a NestJS
microservice architecture, with AI support (CV parsing, evaluation, CV/JD matching).

> Engineering conventions live in [`development-rules/`](development-rules/). Read them before contributing.

## Stack

NestJS (monorepo) - TypeORM - PostgreSQL (database-per-service) - RabbitMQ (event bus) - Redis (cache) - MinIO - Gemini API.

## Services

| Service      | Port | Responsibility                           | Database       |
| ------------ | ---- | ---------------------------------------- | -------------- |
| gateway      | 3000 | API gateway, routing, JWT auth, Swagger  | -              |
| auth         | 3001 | user, profile, company, authentication   | `auth_db`      |
| job          | 3002 | job posting, job search                  | `job_db`       |
| cv-app       | 3003 | CV, application                          | `cvapp_db`     |
| ai           | 3004 | parse / evaluate / match (Gemini)        | `ai_db`        |
| notification | 3005 | email notifications                      | -              |

## Infra (Docker)

| Service    | Port        | UI / notes                          |
| ---------- | ----------- | ----------------------------------- |
| PostgreSQL | 5432        | one instance, one database/service  |
| RabbitMQ   | 5672 / 15672| management UI at http://localhost:15672 |
| Redis      | 6379        | cache / rate limit / token store    |
| MinIO      | 9000 / 9001 | console at http://localhost:9001    |

## Quick start

```bash
cp .env.example .env
# Fill the required secrets in .env:
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET  (32+ random chars each)
#   SMTP_USER, SMTP_PASS
#   GEMINI_API_KEY

make dev             # start postgres (auto-creates the 4 databases) + rabbitmq + redis + minio
npm install
make migrate         # run TypeORM migrations per service (auth -> job -> cv-app -> ai)
npm run start:all    # start all services
```

> The per-service databases + users are created automatically on a fresh Postgres volume (`scripts/init-databases.sql`). To re-apply on an existing volume: `make migrate-db`.

Then open:

- Swagger UI:  http://localhost:3000/api/docs
- Health:      http://localhost:3000/api/v1/health

> Run a single service: `npm run start:auth` (or `:gateway`, `:job`, `:cv-app`, `:ai`, `:notification`).
> Each service also serves its own Swagger at `http://localhost:<port>/api/docs` in development.

## Project layout

```
apps/               # 6 deployable services (gateway + 5 domain services)
packages/shared/    # @nexhire/shared - contracts & cross-cutting (enums, dto, guards, filters)
packages/infra/     # @nexhire/infra  - backing-system adapters (typeorm, redis, messaging, storage)
scripts/            # migrate.sh, generate.sh, migration.sh, init-databases.sql
development-rules/  # mandatory conventions
docker-compose.yml  # infra (postgres / rabbitmq / redis / minio)
```

## Architecture notes

- **Database-per-service**: one PostgreSQL instance, but each service owns its own
  database + user (no shared db, no cross-database access — enforced by the engine).
- **Gateway** is the only entry point; it decodes the JWT (if present) and injects
  `x-user-id` / `x-user-role` to internal services. Internal services enforce auth
  (role + ownership), so public routes still pass through.
- **Async work** (AI parsing/matching, email) is **event-driven via RabbitMQ**
  (topic exchange), not blocking requests. Redis is cache / rate-limit / token store.
- Cross-service data: store IDs only; resolve via API call or by reacting to events
  (eventual consistency / saga, not cross-service transactions).
- `synchronize` is always off - schema changes go through migrations.

## Notes

- `postgres:18-alpine` and `redis:7-alpine` may already be cached locally; only
  `minio/minio:latest` typically needs pulling.
- On Windows, run `make` targets from Git Bash, or use the underlying `npm run` /
  `docker compose` commands directly.
