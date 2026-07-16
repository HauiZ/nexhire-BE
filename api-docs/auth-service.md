# Auth Service API Docs

Base path through gateway: `/api/v1/auth`

Responsibility: authentication, JWT issuing, refresh-token rotation/revocation, email verification, password flows.

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
| 423    | `AUTH.ACCOUNT_TEMPORARILY_LOCKED` | Account is temporarily locked                  |
| 422    | validation error                  | Invalid request body                           |

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
