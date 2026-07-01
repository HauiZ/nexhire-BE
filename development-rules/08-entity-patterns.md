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
- Run order follows `scripts/migrate.sh`.

### Workflow

```bash
bash scripts/migration.sh generate auth-service AddPhoneToUser
bash scripts/migration.sh run auth-service
bash scripts/migration.sh revert auth-service
bash scripts/migration.sh show auth-service
bash scripts/migration.sh create auth-service Seed
```

Valid services:
- `auth-service`
- `candidate-service`
- `company-service`
- `job-service`
- `application-service`
- `cv-parsing-service`
- `matching-service`
- `document-storage-service`
