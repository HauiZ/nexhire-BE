# Auth Service API Docs

Base path through gateway: `/api/v1/auth`

Responsibility: authentication, JWT issuing, refresh-token rotation/revocation, email verification, password flows.

Account identity rules:

- `users.email` is unique, so the same email cannot create two separate accounts.
- `user_roles.user_id` is unique, so one account has exactly one role assignment in this system.
- If a user registered as `CANDIDATE`, logging in or Google-linking as `RECRUITER` is rejected with `AUTH.LOGIN_ROLE_NOT_ALLOWED`.
- Login email is account identity. Company public email belongs in company-service `contactEmail`.

## Common response objects

### Auth response data

```json
{
  "user": {
    "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
    "email": "candidate@nexhire.vn",
    "fullName": "Nguyen Van A",
    "phone": "0901234567",
    "role": "CANDIDATE",
    "companyId": null,
    "emailVerified": false
  },
  "tokens": {
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token",
    "accessTokenExpiresIn": 900,
    "refreshTokenExpiresIn": 604800
  }
}
```

## Endpoints

### `POST /api/v1/auth/register`

Summary: Register a candidate or recruiter account and send email verification. `ADMIN` cannot self-register.

Auth:

- Public

Request body:

| Field      | Type   | Required | Note                                            |
| ---------- | ------ | -------- | ----------------------------------------------- |
| `email`    | string | Yes      | Valid email, max 255                            |
| `password` | string | Yes      | 8-128 chars                                     |
| `fullName` | string | Yes      | 2-255 chars                                     |
| `phone`    | string | Yes      | 8-30 chars                                      |
| `role`     | enum   | Yes      | `CANDIDATE` or `RECRUITER`; `ADMIN` is rejected |

```json
{
  "email": "candidate@nexhire.vn",
  "password": "StrongPassword123!",
  "fullName": "Nguyen Van A",
  "phone": "0901234567",
  "role": "CANDIDATE"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
      "email": "candidate@nexhire.vn",
      "fullName": "Nguyen Van A",
      "phone": "0901234567",
      "role": "CANDIDATE",
      "emailVerified": false
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token",
      "accessTokenExpiresIn": 900,
      "refreshTokenExpiresIn": 604800
    }
  }
}
```

Errors:

| Status | Code                                 | Meaning                                        |
| ------ | ------------------------------------ | ---------------------------------------------- |
| 409    | `AUTH.EMAIL_ALREADY_REGISTERED`      | Email already registered                       |
| 409    | `AUTH.REGISTRATION_ROLE_NOT_ALLOWED` | Role cannot self-register                      |
| 409    | `AUTH.ROLE_NOT_PROVISIONED`          | Requested role is missing in seed/provisioning |
| 422    | validation error                     | Invalid request body                           |

### `POST /api/v1/auth/login`

Summary: Login with email, password, and required role context. FE can have separate candidate/recruiter login pages, but both call this same endpoint and send the matching `role` in body.

For recruiter login/refresh, auth-service reads its local `recruiter_company_links` table, synced from company-service event `company.posting-snapshot-changed`, and includes `companyId` in both the auth response and JWT payload when the recruiter owns a company. Gateway forwards this as `x-company-id`.

Auth:

- Public

Request body:

| Field      | Type   | Required | Note                                      |
| ---------- | ------ | -------- | ----------------------------------------- |
| `email`    | string | Yes      | Valid email, max 255                      |
| `password` | string | Yes      | 8-128 chars                               |
| `role`     | enum   | Yes      | Login context: `CANDIDATE` or `RECRUITER` |

```json
{
  "email": "candidate@nexhire.vn",
  "password": "StrongPassword123!",
  "role": "CANDIDATE"
}
```

Recruiter login page should send:

```json
{
  "email": "hr@company.vn",
  "password": "StrongPassword123!",
  "role": "RECRUITER"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
      "email": "candidate@nexhire.vn",
      "fullName": "Nguyen Van A",
      "phone": "0901234567",
      "role": "CANDIDATE",
      "companyId": null,
      "emailVerified": true
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token",
      "accessTokenExpiresIn": 900,
      "refreshTokenExpiresIn": 604800
    }
  }
}
```

Errors:

| Status | Code                              | Meaning                                        |
| ------ | --------------------------------- | ---------------------------------------------- |
| 401    | `AUTH.INVALID_CREDENTIALS`        | Email or password is invalid                   |
| 403    | `AUTH.LOGIN_ROLE_NOT_ALLOWED`     | Account does not have the requested login role |
| 403    | `AUTH.EMAIL_NOT_VERIFIED`         | Email has not been verified yet                |
| 423    | `AUTH.ACCOUNT_TEMPORARILY_LOCKED` | Account is temporarily locked                  |
| 422    | validation error                  | Invalid request body                           |

### `POST /api/v1/auth/google/login`

Summary: Login or signup with Google. FE uses Google Identity Services to get a Google ID token, then sends that token to BE. BE verifies the token with Google, checks `aud` against the configured Google client id(s), links the Google identity, and returns the same auth response shape as password login.

Auth:

- Public

Recommended setup:

- Current web app only needs `GOOGLE_CLIENT_ID`.
- `GOOGLE_CLIENT_IDS` is only for future multi-client setup, such as web + mobile + staging.
- `GOOGLE_TOKEN_INFO_URL` is optional and normally should be left as the default Google endpoint.

Backend config:

| Env                     | Required | Note                                                    |
| ----------------------- | -------- | ------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`      | Yes      | Single Google OAuth web client id used by FE            |
| `GOOGLE_CLIENT_IDS`     | No       | Comma-separated ids when FE has multiple Google clients |
| `GOOGLE_TOKEN_INFO_URL` | No       | Defaults to `https://oauth2.googleapis.com/tokeninfo`   |

FE flow:

1. Load Google Identity Services with the same client id as `GOOGLE_CLIENT_ID`.
2. User selects a Google account.
3. FE receives `credential` from Google. Treat this as `idToken`.
4. FE calls `POST /api/v1/auth/google/login` with `{ idToken, role }`.
5. Store `accessToken` and `refreshToken` exactly like password login.

Request body:

| Field     | Type   | Required | Note                                                                  |
| --------- | ------ | -------- | --------------------------------------------------------------------- |
| `idToken` | string | Yes      | Google ID token from Google Identity Services `credential` response   |
| `role`    | enum   | Yes      | Login/signup context: `CANDIDATE` or `RECRUITER`; `ADMIN` is rejected |
| `nonce`   | string | No       | Send only if FE generated nonce for the Google sign-in request        |

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
  "role": "CANDIDATE"
}
```

Success behavior:

- If `auth_identities(provider=GOOGLE, providerUserId=google.sub)` exists: login the linked user.
- Else if a user with the same email exists: link Google identity to that user, then login.
- Else create a new active user with requested role, `emailVerified=true`, no password credential, then login.
- Existing users must already have the requested role. Google login does not auto-upgrade a `CANDIDATE` account into `RECRUITER`.
- Recruiter response includes `companyId` after company-service has emitted recruiter-company link events, same as password login.

Success response:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
      "email": "candidate@gmail.com",
      "fullName": "Nguyen Van A",
      "phone": null,
      "role": "CANDIDATE",
      "companyId": null,
      "emailVerified": true
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token",
      "accessTokenExpiresIn": 900,
      "refreshTokenExpiresIn": 604800
    }
  }
}
```

Curl:

```bash
curl -X POST "http://localhost:3000/api/v1/auth/google/login" \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "<google-id-token-from-fe>",
    "role": "CANDIDATE"
  }'
```

Errors:

| Status | Code                               | Meaning                                                            |
| ------ | ---------------------------------- | ------------------------------------------------------------------ |
| 401    | `AUTH.GOOGLE_TOKEN_INVALID`        | Token cannot be verified, audience mismatched, or nonce mismatched |
| 401    | `AUTH.GOOGLE_EMAIL_NOT_VERIFIED`   | Google account email is not verified                               |
| 403    | `AUTH.LOGIN_ROLE_NOT_ALLOWED`      | Existing account does not have requested role                      |
| 409    | `AUTH.ROLE_NOT_PROVISIONED`        | Requested role is missing in seed/provisioning                     |
| 503    | `AUTH.GOOGLE_LOGIN_NOT_CONFIGURED` | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_IDS` is missing                  |
| 422    | validation error                   | Invalid request body                                               |

### `POST /api/v1/auth/refresh`

Summary: Rotate refresh token and issue a new token pair.

Auth:

- Public

Request body:

| Field          | Type   | Required | Note                  |
| -------------- | ------ | -------- | --------------------- |
| `refreshToken` | string | Yes      | Current refresh token |

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

Success response: same as Auth response data.

Recruiter refresh also refreshes the embedded `companyId` from the synced company link table.

Errors:

| Status | Code                          | Meaning                                                 |
| ------ | ----------------------------- | ------------------------------------------------------- |
| 401    | `AUTH.INVALID_REFRESH_TOKEN`  | Refresh token is invalid, expired, reused, or revoked   |
| 403    | `AUTH.LOGIN_ROLE_NOT_ALLOWED` | Refresh token role is no longer assigned to the account |

### `GET /api/v1/auth/me`

Summary: Get the current authenticated user profile for the app header.

Auth:

- Required
- Sent through gateway with `Authorization: Bearer <accessToken>`

Request body: none.

Success response:

```json
{
  "success": true,
  "data": {
    "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
    "email": "khoa@nexhire.vn",
    "fullName": "Nguyen Minh Khoa",
    "phone": "0901234567",
    "role": "CANDIDATE",
    "language": "vi",
    "logoUrl": null,
    "logoDocumentId": null
  }
}
```

Field notes:

| Field            | Type       | Nullable | Note                                                                              |
| ---------------- | ---------- | -------- | --------------------------------------------------------------------------------- |
| `id`             | uuid       | No       | Auth user id                                                                      |
| `email`          | string     | No       | Login email                                                                       |
| `fullName`       | string     | Yes      | User display name                                                                 |
| `phone`          | string     | Yes      | Auth account phone. Company contact phone is stored on company-service.           |
| `role`           | `UserRole` | No       | Current role context from access token                                            |
| `language`       | `vi`, `en` | No       | Preferred UI language for the current account                                     |
| `logoUrl`        | string     | Yes      | Header image URL: recruiter company logo, otherwise auth external avatar fallback |
| `logoDocumentId` | uuid       | Yes      | Recruiter company logo document id when available                                 |

Role-specific `logoUrl` behavior:

- `RECRUITER`: uses synced company logo from `recruiter_company_links.company_logo_url`.
- `RECRUITER`: also returns synced `recruiter_company_links.company_logo_document_id`; FE should prefer this for company logo rendering.
- `CANDIDATE`: candidate profile/avatar is owned by candidate-service. FE should read candidate avatar/name/phone from `/api/v1/candidates/me` or candidate profile APIs.
- `CANDIDATE`: `logoUrl` can still be an auth external avatar fallback, such as Google picture saved on login, but it is not the candidate profile avatar source of truth.
- `ADMIN`: no avatar upload flow exists yet; `logoUrl` is normally `null` unless `users.avatar_url` is set by seed/manual/future admin profile flow.
- If recruiter company logo has not synced yet, auth-service falls back to `users.avatar_url`.
- Candidate avatar uploads are owned by candidate-service at `candidate_profiles.avatar_document_id`; FE should read candidate avatar from `/api/v1/candidates/me` or candidate profile APIs instead of `/auth/me`.

Errors:

| Status | Code                          | Meaning                                     |
| ------ | ----------------------------- | ------------------------------------------- |
| 401    | `COMMON.UNAUTHENTICATED`      | Missing/invalid access token or identity    |
| 403    | `AUTH.LOGIN_ROLE_NOT_ALLOWED` | Token role is no longer assigned to account |
| 404    | `AUTH.USER_NOT_FOUND`         | User in token no longer exists              |

### `PATCH /api/v1/auth/me`

Summary: Update the current recruiter/admin account profile.

Auth:

- Required
- Roles: `RECRUITER`, `ADMIN`
- Sent through gateway with `Authorization: Bearer <accessToken>`

Intent:

- Use this for recruiter/admin account identity, for example account display name and personal/account phone.
- Use this for recruiter/admin UI language preference.
- Do not use this for company contact information. Company contact is updated through company-service fields `contactEmail` and `contactPhone`.
- Do not use this for candidate profile. Candidate name/phone/avatar/language are owned by candidate-service through `/api/v1/candidates/me`; candidate-service syncs language back to `/auth/me` through an internal event.
- Login email is intentionally not editable here. A future `change-email` flow should verify the new email first.

Request body:

| Field      | Type   | Required | Nullable | Note                                       |
| ---------- | ------ | -------- | -------- | ------------------------------------------ |
| `fullName` | string | No       | Yes      | Set or clear account display name          |
| `phone`    | string | No       | Yes      | Set or clear recruiter/admin account phone |
| `language` | enum   | No       | No       | `vi` or `en`                               |

```json
{
  "fullName": "Nguyen Van A",
  "phone": "0901234567",
  "language": "en"
}
```

Success response: same shape as `GET /api/v1/auth/me`.

```json
{
  "success": true,
  "data": {
    "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
    "email": "recruiter@nexhire.vn",
    "fullName": "Nguyen Van A",
    "phone": "0901234567",
    "role": "RECRUITER",
    "language": "en",
    "logoUrl": "https://cdn.nexhire.vn/company/logo.png",
    "logoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86"
  }
}
```

Errors:

| Status | Code                          | Meaning                                     |
| ------ | ----------------------------- | ------------------------------------------- |
| 401    | `COMMON.UNAUTHENTICATED`      | Missing/invalid access token or identity    |
| 403    | `COMMON.FORBIDDEN`            | Candidate cannot update auth profile here   |
| 403    | `AUTH.LOGIN_ROLE_NOT_ALLOWED` | Token role is no longer assigned to account |
| 404    | `AUTH.USER_NOT_FOUND`         | User in token no longer exists              |
| 422    | validation error              | Invalid request body                        |

### `POST /api/v1/auth/logout`

Summary: Revoke the current refresh token.

Auth:

- Public

Request body:

| Field          | Type   | Required | Note                    |
| -------------- | ------ | -------- | ----------------------- |
| `refreshToken` | string | Yes      | Refresh token to revoke |

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

### `POST /api/v1/auth/verify-email`

Summary: Verify user email by OTP token. Link-based verification should read `email` and `token` from query and call this API.

Auth:

- Public

Request body:

| Field   | Type   | Required | Note                       |
| ------- | ------ | -------- | -------------------------- |
| `email` | string | Yes      | Email being verified       |
| `token` | string | Yes      | OTP/link token, 4-32 chars |

```json
{
  "email": "candidate@nexhire.vn",
  "token": "123456"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Email verified successfully",
    "emailVerified": true,
    "email": "candidate@nexhire.vn",
    "verifiedAt": "2026-07-11T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code                                    | Meaning                        |
| ------ | --------------------------------------- | ------------------------------ |
| 400    | `AUTH.EMAIL_VERIFICATION_TOKEN_INVALID` | Token is invalid               |
| 400    | `AUTH.EMAIL_VERIFICATION_TOKEN_EXPIRED` | Token expired                  |
| 404    | `AUTH.EMAIL_VERIFICATION_NOT_FOUND`     | Verification request not found |

### `POST /api/v1/auth/resend-verification`

Summary: Resend email verification OTP/link with cooldown and max resend limit.

Auth:

- Public

Request body:

| Field   | Type   | Required | Note                             |
| ------- | ------ | -------- | -------------------------------- |
| `email` | string | Yes      | Email to resend verification for |

```json
{
  "email": "candidate@nexhire.vn"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Verification email queued successfully",
    "email": "candidate@nexhire.vn",
    "resendCooldownSeconds": 60,
    "resendCount": 1
  }
}
```

Errors:

| Status | Code                                     | Meaning                |
| ------ | ---------------------------------------- | ---------------------- |
| 409    | `AUTH.EMAIL_ALREADY_VERIFIED`            | Email already verified |
| 429    | `AUTH.VERIFICATION_RESEND_COOLDOWN`      | Resend too soon        |
| 429    | `AUTH.VERIFICATION_RESEND_LIMIT_REACHED` | Max resend reached     |

### `POST /api/v1/auth/forgot-password`

Summary: Request password reset OTP/link by email.

Auth:

- Public

Request body:

| Field   | Type   | Required | Note                                |
| ------- | ------ | -------- | ----------------------------------- |
| `email` | string | Yes      | Email to request password reset for |

```json
{
  "email": "candidate@nexhire.vn"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Password reset code queued if the email exists",
    "resendCooldownSeconds": 60
  }
}
```

Errors:

| Status | Code                                       | Meaning            |
| ------ | ------------------------------------------ | ------------------ |
| 429    | `AUTH.PASSWORD_RESET_RESEND_COOLDOWN`      | Request too soon   |
| 429    | `AUTH.PASSWORD_RESET_RESEND_LIMIT_REACHED` | Max resend reached |

### `POST /api/v1/auth/reset-password`

Summary: Reset password with email and OTP token. Link-based reset should read `email` and `token` from query, then submit new password with this API.

Auth:

- Public

Request body:

| Field         | Type   | Required | Note                       |
| ------------- | ------ | -------- | -------------------------- |
| `email`       | string | Yes      | Email being reset          |
| `token`       | string | Yes      | OTP/link token, 4-10 chars |
| `newPassword` | string | Yes      | 8-128 chars                |

```json
{
  "email": "candidate@nexhire.vn",
  "token": "123456",
  "newPassword": "NewStrongPassword123!"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Password reset successfully"
  }
}
```

Errors:

| Status | Code                                | Meaning                          |
| ------ | ----------------------------------- | -------------------------------- |
| 400    | `AUTH.PASSWORD_RESET_TOKEN_INVALID` | Token is invalid                 |
| 400    | `AUTH.PASSWORD_RESET_TOKEN_EXPIRED` | Token expired                    |
| 400    | `AUTH.PASSWORD_REUSE_NOT_ALLOWED`   | New password equals old password |
| 404    | `AUTH.PASSWORD_RESET_NOT_FOUND`     | Reset request not found          |
| 404    | `AUTH.USER_CREDENTIAL_NOT_FOUND`    | Credential record not found      |

### `POST /api/v1/auth/change-password`

Summary: Change password for authenticated user.

Auth:

- Required
- Roles: authenticated user

Headers:

| Header                                | Required | Note                  |
| ------------------------------------- | -------- | --------------------- |
| `Authorization: Bearer <accessToken>` | Yes      | Sent by FE to gateway |

Request body:

| Field             | Type   | Required | Note        |
| ----------------- | ------ | -------- | ----------- |
| `currentPassword` | string | Yes      | 8-128 chars |
| `newPassword`     | string | Yes      | 8-128 chars |

```json
{
  "currentPassword": "StrongPassword123!",
  "newPassword": "NewStrongPassword123!"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  }
}
```

Errors:

| Status | Code                              | Meaning                          |
| ------ | --------------------------------- | -------------------------------- |
| 400    | `AUTH.PASSWORD_REUSE_NOT_ALLOWED` | New password equals old password |
| 401    | `AUTH.INVALID_CREDENTIALS`        | Current password is invalid      |
| 404    | `AUTH.USER_CREDENTIAL_NOT_FOUND`  | Credential record not found      |
| 422    | validation error                  | Invalid request body             |

## Admin user management

Base path through gateway: `/api/v1/admin/users`

Auth:

- Required
- Role: `ADMIN`

User statuses:

| Status      | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `ACTIVE`    | User can login/use the system.                                             |
| `INACTIVE`  | Account is disabled but not deleted.                                       |
| `SUSPENDED` | Temporarily disabled by admin.                                             |
| `LOCKED`    | Locked by system/admin; credential lock still uses temporary 423 response. |
| `BANNED`    | Disabled for policy violations.                                            |
| `ARCHIVED`  | Soft-deleted/hidden from normal operations.                                |

`SUSPENDED`, `BANNED`, `ARCHIVED`, `INACTIVE`, and `LOCKED` users cannot login, refresh token, call `/auth/me`, or change password. Admin actions revoke all refresh tokens for that user.

### `GET /api/v1/admin/users`

Summary: List users for admin management.

Query params:

| Field    | Type   | Required | Note                                                   |
| -------- | ------ | -------- | ------------------------------------------------------ |
| `page`   | number | No       | Default `1`                                            |
| `limit`  | number | No       | Default `20`, max `100`                                |
| `search` | string | No       | Search email, full name, phone, recruiter company name |
| `role`   | enum   | No       | `CANDIDATE`, `RECRUITER`, `ADMIN`                      |
| `status` | enum   | No       | User status                                            |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
      "email": "candidate@nexhire.vn",
      "phone": "0901234567",
      "fullName": "Nguyen Van A",
      "avatarUrl": null,
      "status": "ACTIVE",
      "roles": ["CANDIDATE"],
      "emailVerified": true,
      "company": null,
      "lastLoginAt": "2026-07-16T08:00:00.000Z",
      "statusReason": null,
      "statusChangedBy": null,
      "statusChangedAt": null,
      "suspendedAt": null,
      "bannedAt": null,
      "archivedAt": null,
      "createdAt": "2026-07-16T07:00:00.000Z",
      "updatedAt": "2026-07-16T07:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Recruiter item includes synced company snapshot:

```json
{
  "id": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
  "email": "recruiter@nexhire.vn",
  "phone": "0901234567",
  "fullName": "Recruiter One",
  "roles": ["RECRUITER"],
  "company": {
    "companyId": "42c7f10f-2b9c-4d3a-9d98-4d4c84dd9a77",
    "companyName": "NexHire Tech",
    "companyStatus": "APPROVED"
  }
}
```

Admin tracking notes:

- Candidate name/phone updates are mirrored into `users.full_name` and `users.phone` from `candidate.profile-snapshot-changed` for admin user tracking only.
- Company name/status/logo updates are mirrored into `recruiter_company_links` from `company.posting-snapshot-changed`; auth-service does not overwrite recruiter `users.full_name` with company name.
- Company-service currently has no company phone/contact phone field, so there is no company phone to mirror into auth-service.
- Avatar/logo source of truth stays in candidate-service/company-service; auth admin users should use `avatarUrl` only as auth external fallback.

### `GET /api/v1/admin/users/overview`

Summary: Return user counts for admin dashboard overview.

Success response:

```json
{
  "success": true,
  "data": {
    "total": 120,
    "byStatus": {
      "ACTIVE": 96,
      "INACTIVE": 0,
      "SUSPENDED": 4,
      "LOCKED": 0,
      "BANNED": 1,
      "ARCHIVED": 2
    },
    "byRole": {
      "CANDIDATE": 90,
      "RECRUITER": 25,
      "ADMIN": 5
    },
    "emailVerified": 110,
    "emailUnverified": 10
  }
}
```

FE notes:

- FE normally uses `GET /api/v1/admin/dashboard/overview` through gateway for the overview page.
- Use this direct service endpoint only when building/debugging auth admin screens.

### `GET /api/v1/admin/users/growth`

Summary: Return user growth chart series for admin dashboard.

Query:

| Field    | Type | Required | Note                                 |
| -------- | ---- | -------- | ------------------------------------ |
| `from`   | date | No       | Inclusive date; default last 30 days |
| `to`     | date | No       | Inclusive date; default today        |
| `bucket` | enum | No       | `day` or `month`; default `day`      |

Success response:

```json
{
  "success": true,
  "data": {
    "from": "2026-07-01",
    "to": "2026-07-31",
    "bucket": "day",
    "points": [
      {
        "bucket": "2026-07-01",
        "registeredUsers": 12,
        "candidates": 8,
        "recruiters": 3,
        "admins": 1,
        "bannedUsers": 0,
        "suspendedUsers": 1,
        "archivedUsers": 0
      }
    ]
  }
}
```

FE notes:

- `candidates`, `recruiters`, and `admins` are role breakdowns of newly registered users in the
  bucket.
- `bannedUsers`, `suspendedUsers`, and `archivedUsers` are counted by their lifecycle timestamp, not
  by registration date.
- FE normally uses `GET /api/v1/admin/dashboard/users/growth` through gateway for the dashboard
  range summary. Use this direct service endpoint when a detailed `points[]` series is needed.

### `GET /api/v1/admin/users/:id`

Summary: Get one user detail for admin management.

Success response: one `AdminUserResponse` object, same fields as list item.

Errors:

| Status | Code                  | Meaning             |
| ------ | --------------------- | ------------------- |
| 404    | `AUTH.USER_NOT_FOUND` | User does not exist |

### `PATCH /api/v1/admin/users/:id/suspend`

Summary: Temporarily disable a user account.

Request body:

```json
{
  "reason": "Suspicious activity while support verifies the account"
}
```

Success response: updated `AdminUserResponse` with `status: "SUSPENDED"` and `suspendedAt`.

### `PATCH /api/v1/admin/users/:id/ban`

Summary: Disable a user account for policy violations.

Request body:

```json
{
  "reason": "Repeated policy violations"
}
```

Success response: updated `AdminUserResponse` with `status: "BANNED"` and `bannedAt`.

### `PATCH /api/v1/admin/users/:id/archive`

Summary: Soft-delete/archive a user account. The row remains for audit and foreign-key history.

Request body:

```json
{
  "reason": "Test-flow cleanup"
}
```

Success response: updated `AdminUserResponse` with `status: "ARCHIVED"` and `archivedAt`.

### `PATCH /api/v1/admin/users/:id/restore`

Summary: Restore a disabled user to `ACTIVE`.

Request body:

```json
{
  "reason": "Appeal accepted"
}
```

`reason` is optional for restore. Success response clears `suspendedAt`, `bannedAt`, and `archivedAt`.

Admin action errors:

| Status | Code                      | Meaning                                                      |
| ------ | ------------------------- | ------------------------------------------------------------ |
| 403    | `AUTH.CANNOT_MANAGE_SELF` | Admin tried to suspend/ban/archive/restore their own account |
| 404    | `AUTH.USER_NOT_FOUND`     | Target user does not exist                                   |
| 422    | validation error          | Missing/invalid reason                                       |

## Internal endpoints

### `GET /api/v1/internal/auth/users/:id/contact-snapshot`

Internal only.

Summary: Get auth user contact snapshot for services that need login-email fallback.

Auth:

- Required
- Internal service token header: `x-internal-service-token`

Success response:

```json
{
  "success": true,
  "data": {
    "id": "f9ae2e14-f689-4a3e-8c2f-249776d0b650",
    "email": "candidate@nexhire.vn",
    "fullName": "Nguyen Van A"
  }
}
```

Errors:

| Status | Meaning                                |
| ------ | -------------------------------------- |
| 401    | Missing/invalid internal service token |
| 403    | Internal caller is not allowed         |
| 404    | User not found                         |
