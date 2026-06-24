# 01 — Project Structure

## 1. Monorepo layout

```
nexhire-be/
  apps/
    gateway/
    auth/
    job/
    cv-app/
    ai/
    notification/
  packages/
    shared/                 # @nexhire/shared — cross-service code
  scripts/
    migrate.sh
    create-schemas.sql
  docker-compose.yml
  nest-cli.json
  tsconfig.json
  package.json
  Makefile
  .env.example
  development-rules/
```

- `apps/*` = deployable services. `packages/*` = shared libraries (not deployable on their own).
- Never put cross-service code inside an app; it goes in `packages/shared`.

## 2. Per-service structure

```
apps/<service>/
  src/
    main.ts                  # bootstrap only
    <service>.module.ts      # root module — wires everything
    config/
      <service>.config.ts    # registerAs(...)
    <feature>/               # one folder per feature (domain area)
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.module.ts
      dto/
      entities/              # entities owned by this feature
    common/                  # service-local guards/filters/interceptors
    migrations/              # *.ts (services with a DB)
  data-source.ts             # TypeORM DataSource (services with a DB)
  tsconfig.app.json
  Dockerfile
```

- **Group by feature, not by type.** A feature owns its controller + service + dto + entities together. Do not create global `controllers/`, `services/` buckets.
- `main.ts` only bootstraps (create app, pipes, prefix, listen). No business logic.
- Service-local reusable pieces (a guard used only in this service) live in `src/common/`. Anything reused across services moves to `packages/shared`.

## 3. `packages/shared` structure

```
packages/shared/src/
  dto/            # cross-service request/response contracts
  enums/          # UserRole, ApplicationStage, JobStatus...
  decorators/     # @CurrentUser, @Roles, @Public
  guards/         # JwtAuthGuard, RolesGuard
  filters/        # AllExceptionsFilter
  interceptors/   # ResponseInterceptor
  constants/      # queue names, header names, error codes
  index.ts        # barrel — public surface of the package
```

- Anything exported for other services must be re-exported from `index.ts`.
- `shared` must NOT contain a single service's business logic or schema-specific entities.

## 4. Where things live (quick map)

| Thing | Location |
|-------|----------|
| Business logic | `apps/<service>/src/<feature>/<feature>.service.ts` |
| HTTP routing | `apps/<service>/src/<feature>/<feature>.controller.ts` |
| Validation rules | `apps/<service>/src/<feature>/dto/*.dto.ts` |
| DB tables | `apps/<service>/src/<feature>/entities/*.entity.ts` |
| Env values | `apps/<service>/src/config/<service>.config.ts` |
| Cross-service contract | `packages/shared/src/dto/*` |
| Shared guard/filter | `packages/shared/src/{guards,filters}/*` |
