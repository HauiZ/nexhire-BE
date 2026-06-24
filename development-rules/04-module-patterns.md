# 04 — Module Patterns (NestJS)

## 1. Module per feature

- Each feature folder has its own `*.module.ts` that declares its controllers, providers, and the entities it needs.
- The root module (`<service>.module.ts`) wires global concerns (Config, TypeORM root, queues) and imports feature modules.

```ts
// apps/cv-app/src/application/application.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Application])],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService], // export only what other modules truly need
})
export class ApplicationModule {}
```

## 2. Root module composition

```ts
// apps/cv-app/src/cv-app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [cvappConfig] }),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmFactory, inject: [ConfigService] }),
    HttpModule,
    CvModule,
    ApplicationModule,
  ],
})
export class CvAppModule {}
```

- `ConfigModule` is `isGlobal: true` — no need to re-import in feature modules.
- `TypeOrmModule.forRootAsync` reads connection + `schema` from config (never hardcoded).

## 3. `forRoot` vs `forFeature`

- `forRoot` / `forRootAsync` = configure a module **once** at the root (DB connection, mailer, throttler).
- `forFeature` = register the specific entities/repositories a feature needs. Use it in feature modules, not the root.

## 4. Exports & encapsulation

- A module is a black box: only `exports` are visible to importers. Export the **service**, not the repository.
- Don't export an entity/repository so another module can query your tables directly — that breaks the boundary. Expose a service method instead.
- Never export a provider just "in case". Export the minimum.

## 5. Global vs feature providers

- Truly cross-cutting providers (logger, global filter/interceptor) are registered with `APP_FILTER` / `APP_INTERCEPTOR` / `APP_GUARD` in the root module (or pulled from `shared`).
- Feature-specific providers stay in the feature module.

## 6. Shared modules

- Reusable Nest building blocks (guards, filters, decorators) come from `@nexhire/shared`. If they need DI wiring, expose a `SharedModule` from the package and import it where needed.

## 7. Dynamic modules

- When a module needs runtime options (e.g. a storage module configured with a bucket), expose a static `register()/registerAsync()` returning a `DynamicModule`. Keep options typed.

## 8. Rules

- No business logic in a module file — modules only wire dependencies.
- A controller is declared in exactly one module. A provider is provided by the module that owns it; others import that module.
- Keep the import graph acyclic (see `03-import-conventions.md §4`).
