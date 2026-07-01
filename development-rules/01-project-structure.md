# 01 - Project Structure

## 1. Monorepo layout

```text
nexhire-be/
  apps/
    gateway/
    auth-service/
    candidate-service/
    company-service/
    job-service/
    application-service/
    cv-parsing-service/
    matching-service/
    notification-service/
    document-storage-service/
  packages/
    shared/
    infra/
  scripts/
    migrate.js
    generate.js
    migration.js
    init-databases.sql
  docker-compose.yml
  nest-cli.json
  tsconfig.json
  package.json
  Makefile
  .env.example
  development-rules/
```

- `apps/*` = deployable services. `packages/*` = shared libraries.
- Never put cross-service code inside an app; move reusable code to a package.
- Dependency direction: `apps -> shared` and `apps -> infra`.

## 2. Per-service structure

```text
apps/<service>/
  src/
    main.ts
    <service>.module.ts
    config/
      <service>.config.ts
    <feature>/
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.module.ts
      dto/
      entities/
    common/
    migrations/
  data-source.ts
  tsconfig.app.json
  Dockerfile
```

## 3. Where things live

| Thing | Location |
|-------|----------|
| Business logic | `apps/<service>/src/<feature>/<feature>.service.ts` |
| HTTP routing | `apps/<service>/src/<feature>/<feature>.controller.ts` |
| Validation rules | `apps/<service>/src/<feature>/dto/*.dto.ts` |
| DB tables | `apps/<service>/src/<feature>/entities/*.entity.ts` |
| Service-specific env values | `apps/<service>/src/config/<service>.config.ts` |
| Shared infra env | `packages/infra/src/config/infra.config.ts` |
