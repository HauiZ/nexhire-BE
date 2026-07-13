# 08 - Entity Patterns (TypeORM)

## 1. Database isolation

Each DB-owning service owns its own database:

- `auth_service_db`
- `candidate_service_db`
- `company_service_db`
- `job_service_db`
- `application_service_db`
- `cv_parsing_service_db`
- `matching_service_db`
- `document_storage_service_db`

No shared database and no cross-service ORM relations.

## 2. Cross-service references

- Cross-service references store IDs only.
- Relations are only for entities within the same service database.

## 3. Migrations

- `synchronize: false` always.
- Migrations live in `apps/<service>/src/migrations/`.
- Run order follows `scripts/migrate.js`.
- Any field with a fixed value set must use a typed `enum` (not a free-form `string`) in the entity.
- Reuse shared enums from `@nexhire/shared` for cross-service contracts; keep service-private enums near the owning entities.
- Nullable TypeScript union columns (`string | null`, `Date | null`, etc.) must declare an explicit TypeORM `type`; never rely on reflection inference.
- Name important foreign keys, unique indexes, and lookup indexes in entity metadata so generated migrations stay stable and readable.
- Entity metadata must match existing migrations for defaults and constraint names; otherwise TypeORM will generate noisy drop/re-add diffs.

### Workflow

```bash
npm run db:auth:run
npm run db:auth:show
npm run db:auth:generate -- AddPhoneToUser
npm run db:migration:lint -- auth-service
npm run db:auth:run
npm run db:auth:generate -- CheckNoChanges
npm run db:auth:revert
npm run db:auth:run
npm run db:auth:create -- SeedAuthAuditLog
npm run db:auth:create
```

- `generate` and `create` accept an optional name. If omitted, scripts generate a service-based name such as `AuthServiceSchemaUpdate`.
- Before `generate`, run pending migrations for that service so the local DB represents the current baseline.
- After `generate`, review the migration before running it. It should only include the intended schema changes.
- After running a generated migration, generate again against the same service. The expected result is "No changes in database schema were found"; otherwise entity metadata and migration SQL are not aligned.
- For risky migrations, verify `run -> revert -> run` before merge.
- Use `npm run db:migration:lint -- <service>` to catch common migration issues before review.
- `npm run db:migration:lint` without a service audits every migration and may report older migration debt; PR review should at least lint the touched service.
- Treat unexpected `DROP TABLE`, recreated existing tables, unrelated FK churn, enum churn, or default changes as a failed generate; fix entity metadata or DB baseline, delete that generated file, and generate again.
- Prefer generated migrations for normal entity diffs after the baseline is correct. Use hand-written migrations when generated SQL is unsafe, unreadable, or needs deliberate data movement/backfill.
- Generated migrations are not automatically correct. Review UUID defaults, extension requirements, enum names, constraint names, and destructive statements.
- Prefer the current project UUID pattern for new hand-reviewed migrations: `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` plus `gen_random_uuid()`.

Valid services:

- `auth-service`
- `candidate-service`
- `company-service`
- `job-service`
- `application-service`
- `cv-parsing-service`
- `matching-service`
- `document-storage-service`
