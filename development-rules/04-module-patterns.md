# 04 - Module Patterns (NestJS)

## 1. Module per feature

- Each feature folder has its own `*.module.ts` that declares its controllers, providers, and the entities it needs.
- The root module (`<service>.module.ts`) wires global concerns (Config, TypeORM root, queues) and imports feature modules.

```ts
// apps/application-service/src/application/application.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Application])],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
```

## 2. Root module composition

```ts
// apps/application-service/src/application-service.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfigFor('APPLICATION_SERVICE'), redisConfig, applicationServiceConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    HttpModule,
    HealthModule,
    ApplicationModule,
  ],
})
export class ApplicationServiceModule {}
```

- `ConfigModule` is `isGlobal: true` so feature modules do not re-import it.
- `TypeOrmModule.forRootAsync` reads connection and schema from config, never hardcoded values.

## 3. `forRoot` vs `forFeature`

- `forRoot` / `forRootAsync` configures a module once at the root level.
- `forFeature` registers only the entities and repositories a feature needs.

## 4. Exports and encapsulation

- A module is a black box: only `exports` are visible to importers.
- Export the service, not the repository.
- Do not export repositories just so other modules can query your tables directly.

## 5. Global vs feature providers

- Cross-cutting providers use `APP_FILTER`, `APP_INTERCEPTOR`, or `APP_GUARD` in the root module.
- Feature-specific providers stay inside the owning feature module.

## 6. Shared modules

- Reusable Nest building blocks come from `@nexhire/shared`.
- If shared code needs DI wiring, expose a shared module and import it explicitly.

## 7. Dynamic modules

- When runtime options are required, expose `register()` or `registerAsync()` and keep options typed.

## 8. Rules

- No business logic in module files.
- A controller is declared in exactly one module.
- A provider is owned by one module; other modules consume it through imports and exports.
- Keep the import graph acyclic.
