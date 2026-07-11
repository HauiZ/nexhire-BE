# 11 - Auth & Tenancy

## 1. Roles

- Roles are a single enum in `@nexhire/shared`:

```ts
export enum UserRole {
  CANDIDATE = 'CANDIDATE',
  RECRUITER = 'RECRUITER',
  ADMIN = 'ADMIN',
}
```

- Every protected endpoint declares the roles allowed when role-level authorization applies. Default-deny.

## 2. JWT model

- Short-lived access token (`JWT_ACCESS_TTL=900`) plus long-lived refresh token (`JWT_REFRESH_TTL=604800`).
- Separate secrets for access vs refresh.
- Payload contains only `sub` (userId), `role`, optional `companyId`, and token metadata; no PII or secrets.
- Refresh tokens rotate on use; keep a server-side record (Redis) keyed by user/token id to allow revocation/logout.

## 3. Gateway forwards identity, services enforce

- `gateway` runs `OptionalJwtAuthGuard`: it decodes a valid JWT when present and lets public requests pass through.
- When a user is present, the gateway injects identity headers while proxying internally:
  - `x-user-id`, `x-user-role`, optional `x-company-id`, and `x-request-id`.
- Internal services use `InternalAuthGuard` plus `@Public()` to decide whether the route requires identity.
- Internal services trust gateway-injected headers on the internal network but still enforce role and ownership per endpoint.

## 4. Shared auth building blocks (`@nexhire/shared`)

```ts
@Public()
@Roles(UserRole.RECRUITER)
@CurrentUser() user: AuthUser
```

- `InternalAuthGuard`, `JwtAuthGuard`, `RolesGuard`, `@Public()`, `@Roles()`, and `@CurrentUser()` are defined once in `shared`.
- Register `InternalAuthGuard` and `RolesGuard` as global guards (`APP_GUARD`) in internal services; `@Public()` opts out.
- Use `JwtAuthGuard` only in services that directly own JWT validation. The current gateway uses `OptionalJwtAuthGuard` for proxy identity forwarding.

## 5. Identity comes from the token, never the body

- `userId`/`candidateId`/`companyId` for the acting user is read from `@CurrentUser()`; never from a client-supplied field in the request body.

## 6. Ownership checks (per-row authorization)

- Beyond role, enforce ownership in the service:
  - A candidate may read/modify only their own CVs and applications.
  - A recruiter may manage only their own company's jobs and view applications to those jobs.
- Implement an explicit check that throws `ForbiddenException` when the resource owner id does not match the acting user/company.

```ts
if (job.companyId !== user.companyId) {
  throw new ForbiddenException('You cannot modify another company job');
}
```

## 7. Company tenancy

- Recruiters belong to a company (`companyId` on the user / in the token). All recruiter/company operations are scoped by `companyId`.
- Queries for company-owned resources always filter by the acting user's `companyId`; never return cross-company data.
- `ADMIN` is the only role that may operate across companies, and only on admin endpoints.

## 8. Auth endpoints hardening

- `login`, `register`, `refresh`, `forgot-password`, `reset-password`, and `resend-verification` are `@Public()` but must be rate-limited more strictly than normal endpoints.
- Gateway owns the first HTTP-layer throttle for public auth endpoints; services still own business anti-abuse rules such as resend cooldowns, failed-login lockout, and single-use tokens.
- If an internal service becomes directly internet-exposed, duplicate the relevant endpoint throttle there too.
- Passwords are hashed with bcrypt (`rounds: 12`). Never store/log plaintext or full tokens.
- Email verification and password reset flows use single-use, expiring tokens stored/validated server-side.
- Public account lookup flows should avoid user enumeration unless product requirements explicitly allow it.

## 9. Rules

- No endpoint is implicitly public; it is protected unless `@Public()`.
- No authorization logic duplicated inline; use shared guards plus clear ownership checks in services.
- Tokens, secrets, and password hashes never appear in responses, logs, or DTOs.
