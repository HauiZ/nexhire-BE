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
    shared/                 # @nexhire/shared — contracts & cross-cutting (no external systems)
    infra/                  # @nexhire/infra  — adapters to backing systems (DB/Redis/MinIO)
  scripts/
    migrate.sh
    generate.sh
    migration.sh
    init-databases.sql
  docker-compose.yml
  nest-cli.json
  tsconfig.json
  package.json
  Makefile
  .env.example
  development-rules/
```

- `apps/*` = deployable services. `packages/*` = shared libraries (not deployable on their own).
- Never put cross-service code inside an app; it goes in a package.
- **Two packages, two concerns:** `@nexhire/shared` = *what services agree on* (contracts + cross-cutting Nest pieces, framework/IO-agnostic). `@nexhire/infra` = *how services reach backing systems* (TypeORM, Redis, RabbitMQ, MinIO adapters). Dependency direction: `apps → shared` and `apps → infra`; `infra` and `shared` do not import each other.

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
- Service-local reusable pieces (a guard used only in this service) live in `src/common/`. Anything reused across services moves to `@nexhire/shared` (contract/cross-cutting) or `@nexhire/infra` (backing-system adapter).

## 3. Package structure

`@nexhire/shared` — contracts & cross-cutting only (no DB/Redis/MinIO clients):

```
packages/shared/src/
  dto/            # cross-service request/response contracts
  enums/          # UserRole, ApplicationStage, JobStatus...
  decorators/     # @CurrentUser, @Roles, @Public
  guards/         # JwtAuthGuard, InternalAuthGuard, RolesGuard
  filters/        # AllExceptionsFilter
  interceptors/   # ResponseInterceptor
  constants/      # event routing keys, header names, error codes
  interfaces/     # AuthUser, JwtPayload...
  bootstrap/      # setupApp()
  index.ts        # barrel — public surface of the package
```

`@nexhire/infra` — adapters to backing systems:

```
packages/infra/src/
  config/         # registerAs('db'|'redis'|'rabbitmq'|'storage') — shared infra config
  database/       # BaseEntity, buildTypeOrmOptions, buildDataSourceOptions
  redis/          # RedisModule + REDIS_CLIENT token (ioredis) — cache/rate-limit/token
  messaging/      # EventBusModule + EventPublisher (RabbitMQ topic exchange)
  storage/        # StorageModule + StorageService (MinIO)
  index.ts        # barrel
```

- Anything exported for other services must be re-exported from each package's `index.ts`.
- Neither package contains a service's business logic or schema-specific entities.
- `BaseEntity` lives in `infra` (it is ORM-coupled); domain enums live in `shared`. An entity therefore imports its base from `@nexhire/infra` and its enums from `@nexhire/shared`.

## 4. Where things live (quick map)

| Thing | Location |
|-------|----------|
| Business logic | `apps/<service>/src/<feature>/<feature>.service.ts` |
| HTTP routing | `apps/<service>/src/<feature>/<feature>.controller.ts` |
| Validation rules | `apps/<service>/src/<feature>/dto/*.dto.ts` |
| DB tables | `apps/<service>/src/<feature>/entities/*.entity.ts` |
| Service-specific env values | `apps/<service>/src/config/<service>.config.ts` |
| Shared infra env (db/redis/storage) | `packages/infra/src/config/infra.config.ts` |
| Cross-service contract | `packages/shared/src/dto/*` |
| Shared guard/filter | `packages/shared/src/{guards,filters}/*` |
| Entity base class | `packages/infra/src/database/base.entity.ts` |
| DB / Redis / queue / storage adapters | `packages/infra/src/{database,redis,queue,storage}/*` |
