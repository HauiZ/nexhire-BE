# NexHire Backend

Online job-search & recruitment management system (Job Portal + ATS) on a NestJS
microservice architecture, with AI support for CV parsing and CV/JD matching.

> Engineering conventions live in `development-rules/`. Read them before contributing.

## Stack

NestJS (monorepo) - TypeORM - PostgreSQL (database-per-service) - RabbitMQ (event bus) - Redis (cache) - MinIO - Gemini API.

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
| matching-service | 3007 | CV-JD matching and fit score | `matching_service_db` |
| notification-service | 3008 | email and web push notifications | - |
| document-storage-service | 3009 | uploaded documents and object-storage gateway | `document_storage_service_db` |

## Infra (Docker)

| Service | Port | UI / notes |
| ------- | ---- | ---------- |
| PostgreSQL | 5432 | one instance, one database/service |
| RabbitMQ | 5672 / 15672 | management UI at `http://localhost:15672` |
| Redis | 6379 | cache / rate limit / token store |
| MinIO | 9000 / 9001 | console at `http://localhost:9001` |

## Quick start

```bash
cp .env.example .env
# Fill the required secrets in .env:
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   SMTP_USER, SMTP_PASS
#   GEMINI_API_KEY

make dev
npm install
make migrate
npm run start:all
```

> The per-service databases + users are created automatically on a fresh Postgres volume by `scripts/init-databases.sql`.

Then open:

- Swagger UI: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/v1/health`

> Run a single service with `npm run start:document-storage-service` or another `start:*` script from `package.json`.

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
