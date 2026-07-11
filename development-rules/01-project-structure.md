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
  api-docs/
  scripts/
    migrate.js
    generate.js
    migration.js
    test-script.js
    init-databases.sql
  test/
    test-flows/
  docker-compose.yml
  nest-cli.json
  tsconfig.json
  package.json
  Makefile
  .env.example
  development-rules/
```

- `apps/*` are deployable Nest applications.
- `packages/*` are shared libraries.
- Dependency direction is `apps -> shared` and `apps -> infra`.
- App-to-app imports are forbidden.

## 2. Service types

- HTTP gateway: `gateway`.
- DB-owning services: `auth-service`, `candidate-service`, `company-service`, `job-service`, `application-service`, `cv-parsing-service`, `matching-service`, `document-storage-service`.
- Non-DB worker/service: `notification-service`.

## 3. DB-owning service structure

```text
apps/<service>/
  src/
    main.ts
    <service>.module.ts
    config/
      <service>.config.ts
      env.validation.ts
    health/
    <feature>/
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.module.ts
      dto/
      entities/
      test/
    migrations/
    seeds/
  data-source.ts
  tsconfig.app.json
  Dockerfile
```

## 4. Non-DB service structure

```text
apps/<service>/
  src/
    main.ts
    <service>.module.ts
    config/
      <service>.config.ts
      env.validation.ts
    health/
    <feature>/
      <feature>.module.ts
      <feature>.service.ts
      test/
  tsconfig.app.json
  Dockerfile
```

- Non-DB services do not need `data-source.ts` or `migrations/`.

## 5. Where things live

| Thing | Location |
|-------|----------|
| Business logic | `apps/<service>/src/<feature>/<feature>.service.ts` |
| HTTP routing | `apps/<service>/src/<feature>/<feature>.controller.ts` |
| Validation rules | `apps/<service>/src/<feature>/dto/*.dto.ts` |
| DB tables | `apps/<service>/src/<feature>/entities/*.entity.ts` |
| Unit tests | `apps/<service>/src/<feature>/test/*.spec.ts` |
| Service env config | `apps/<service>/src/config/<service>.config.ts` |
| Service env validation | `apps/<service>/src/config/env.validation.ts` |
| FE-facing API contracts | `api-docs/<service>.md` |
| Shared infra config | `packages/infra/src/config/*` |
| Shared contracts | `packages/shared/src/*` |
| Manual API flow tests | `test/test-flows/*.ts` |

## 6. Adding a service

- Register it in `nest-cli.json`.
- Add `start:*` scripts in `package.json`.
- Add service URL/port/env entries in `.env.example`.
- Add config + env validation files.
- Add a health module.
- If DB-owning, add `data-source.ts`, `migrations/`, DB envs, `scripts/init-databases.sql`, and migration script entries.
- If HTTP-exposed, add gateway service config, validation, and proxy route.
- Update `README.md` and `development-rules/README.md`.
