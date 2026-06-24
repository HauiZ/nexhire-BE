# 10 — Config Patterns

## 1. Single source: env → typed config

- All configurable values come from env. **No hardcoded** secrets, URLs, ports, or credentials anywhere in code.
- Never read `process.env.X` scattered around the codebase. Read it once in a typed config and inject `ConfigService`.

## 2. `registerAs` per service

```ts
// apps/auth/src/config/auth.config.ts
export const authConfig = registerAs('auth', () => ({
  port: parseInt(process.env.AUTH_PORT ?? '3001', 10),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10),
  },
  bcryptRounds: 12,
}));
```

- One namespace per service: `auth`, `job`, `cvapp`, `ai`, `notification`, `gateway`.
- Coerce types here (`parseInt`, boolean parsing) — env values are always strings.
- Provide defaults **only** for non-secret, non-critical values (ports, TTLs). Never default a secret.

## 3. Load + access

```ts
// module
ConfigModule.forRoot({ isGlobal: true, load: [authConfig], validationSchema })

// usage
constructor(private readonly config: ConfigService) {}
const ttl = this.config.get<number>('auth.jwt.accessTtl');
```

- `isGlobal: true` so feature modules don't re-import ConfigModule.
- Access via the namespaced key (`auth.jwt.accessTtl`), typed.

## 4. Validate env at startup (fail fast)

- Validate env with a schema (`joi` or a custom validator) in `ConfigModule.forRoot({ validationSchema })`.
- If a required var is missing/malformed, the service must **refuse to boot** with a clear message — never start with invalid config.

```ts
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  AUTH_PORT: Joi.number().default(3001),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  DB_HOST: Joi.string().required(),
  // ...
});
```

## 5. `.env` discipline

- `.env.example` is committed with every variable + safe placeholders — the source of truth for "what exists".
- `.env` is never committed (`.gitignore`).
- Adding a new env var → update `.env.example` in the **same** PR.
- Required-before-run secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SMTP_USER`, `SMTP_PASS`, `GEMINI_API_KEY`.

## 6. Environment-driven behavior

- Differences between environments (CORS strictness, log level, Swagger exposure) are driven by `NODE_ENV` config — not by editing code or commenting things out.

## 7. Inter-service URLs

- Service URLs (`AUTH_SERVICE_URL`, …) come from config and are injected into HTTP clients. Never hardcode `http://localhost:3001`.

## 8. Rules

- A feature never reaches into another service's config namespace.
- Secrets live only in env / the orchestrator's secret store — never in config defaults, code, or committed files.
- Typed getters everywhere: `config.get<number>('...')`, not untyped `config.get('...')`.
