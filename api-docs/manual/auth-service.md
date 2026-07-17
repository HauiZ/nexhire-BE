# Manual Auth APIs

Manual APIs are helper endpoints for development/test operations that should stay separate from normal product flows. They are disabled when `NODE_ENV=production`.

## `POST /api/v1/auth/manual/email-verification`

Summary: Create an email verification row without sending email. It returns the OTP token so FE/dev can enter it manually in the normal `POST /api/v1/auth/verify-email` flow.

Auth:

- Public in development/test only

Request body:

| Field   | Type   | Required | Note                                                          |
| ------- | ------ | -------- | ------------------------------------------------------------- |
| `email` | string | Yes      | Existing user email. Casing is preserved and matched exactly. |

```json
{
  "email": "candidate@nexhire.vn"
}
```

Curl:

```bash
curl -X POST "http://localhost:3000/api/v1/auth/manual/email-verification" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"candidate@nexhire.vn\"}"
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Manual verification token created",
    "verificationId": "9f09167e-9321-499a-91dd-025082e6a6e4",
    "email": "candidate@nexhire.vn",
    "token": "123456",
    "expiresAt": "2026-07-11T10:15:00.000Z"
  }
}
```

After receiving `token`, FE should call the normal `POST /api/v1/auth/verify-email` endpoint with `email + token`.

Errors:

| Status | Code                  | Meaning                                      |
| ------ | --------------------- | -------------------------------------------- |
| 403    | `COMMON.FORBIDDEN`    | Endpoint called with `NODE_ENV=production`   |
| 404    | `AUTH.USER_NOT_FOUND` | User email does not exist                    |
