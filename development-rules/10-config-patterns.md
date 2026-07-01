# 10 - Config Patterns

## 1. Config flow

Configuration flows in this order:

1. `.env`
2. `env.validation.ts`
3. `<service>.config.ts` with `registerAs(...)`
4. `ConfigService.get(...)`

Never bypass this flow for runtime configuration.

## 2. Namespaces

One service namespace per app:

- `gateway`
- `authService`
- `candidateService`
- `companyService`
- `jobService`
- `applicationService`
- `cvParsingService`
- `matchingService`
- `notificationService`
- `documentStorageService`

Shared infra config stays in `@nexhire/infra`.

## 3. Env rules

- Every configurable value comes from env.
- Every env var must be listed in `.env.example`.
- Every env var used by a service must be validated in that service's `env.validation.ts`.
- Required secrets must not have production-looking defaults.
- Local defaults are allowed for ports, hostnames, TTLs, queue names, and development infra.
- Service URLs come from config, never hardcoded.

## 4. Access rules

- Access config via namespaced keys such as `authService.jwt.accessTtl`.
- Keep repeated config reads behind a small private helper when a service uses a group of related values.
- Do not read `process.env` directly outside config files, data-source bootstrap files, or scripts.

## 5. Adding config

- Add env key to `.env.example`.
- Add validation to `env.validation.ts`.
- Add namespaced value to `<service>.config.ts`.
- Use `ConfigService.get(...)` from the namespace.
- Update README/rules if it changes developer workflow.
