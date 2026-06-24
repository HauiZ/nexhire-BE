# 11 — Auth & Tenancy

## 1. Roles

- Roles are a single enum in `@nexhire/shared`:

```ts
export enum UserRole {
  CANDIDATE = 'CANDIDATE',
  RECRUITER = 'RECRUITER',
  ADMIN = 'ADMIN',
}
```

- Every protected endpoint declares the roles allowed. Default-deny.

## 2. JWT model

- Short-lived **access token** (`JWT_ACCESS_TTL=900`) + long-lived **refresh token** (`JWT_REFRESH_TTL=604800`).
- **Separate secrets** for access vs refresh.
- Payload contains only `sub` (userId), `role`, and token metadata — no PII, no secrets.
- Refresh tokens **rotate** on use; keep a server-side record (Redis) keyed by user/token id to allow revocation/logout.

## 3. Gateway validates, services trust

- `gateway` runs `JwtAuthGuard`, validates the token, and injects identity headers when proxying internally:
  - `x-user-id`, `x-user-role` (and `x-request-id`).
- Internal services trust these headers (internal network) but **still enforce role + ownership** per endpoint.

## 4. Shared auth building blocks (`@nexhire/shared`)

```ts
@Public()                              // skip auth for this route
@Roles(UserRole.RECRUITER)             // restrict by role
@CurrentUser() user: AuthUser          // typed identity from request
```

- `JwtAuthGuard`, `RolesGuard`, `@Public()`, `@Roles()`, `@CurrentUser()` are defined once in `shared` and reused. No copy-paste per service.
- Register `JwtAuthGuard` as a global guard (`APP_GUARD`); `@Public()` opts out.

## 5. Identity comes from the token, never the body

- `userId`/`candidateId`/`companyId` for the acting user is read from `@CurrentUser()` — **never** from a client-supplied field in the request body. A candidate cannot pass someone else's id.

## 6. Ownership checks (per-row authorization)

- Beyond role, enforce ownership in the service:
  - A candidate may read/modify only **their own** CVs and applications.
  - A recruiter may manage only **their own company's** jobs and view applications to those jobs.
- Implement as an explicit check that throws `ForbiddenException` when the resource's owner id ≠ the acting user/company.

```ts
if (job.companyId !== user.companyId) {
  throw new ForbiddenException('You cannot modify another company\'s job');
}
```

## 7. Company tenancy

- Recruiters belong to a company (`companyId` on the user / in the token). All recruiter/company operations are scoped by `companyId`.
- Queries for company-owned resources always filter by the acting user's `companyId`; never return cross-company data.
- `ADMIN` is the only role that may operate across companies, and only on admin endpoints.

## 8. Auth endpoints hardening

- `login` / `register` / `refresh` are `@Public()` but rate-limited more strictly than normal endpoints (slow brute force).
- Passwords hashed with bcrypt (`rounds: 12`). Never store/log plaintext or full tokens.
- Email verification + password reset flows use single-use, expiring tokens (stored/validated server-side).

## 9. Rules

- No endpoint is implicitly public — it's protected unless `@Public()`.
- No authorization logic duplicated inline; use the shared guards + a clear ownership check in the service.
- Tokens, secrets, and password hashes never appear in responses, logs, or DTOs.
