# 10 - Config Patterns

## 1. registerAs namespaces

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

## 2. Rules

- All configurable values come from env.
- Access config via typed namespaced keys.
- `.env.example` must be updated with every new env var.
- Service URLs come from config, never hardcoded.
