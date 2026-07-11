# Endpoint Template

Copy this section into the matching `api-docs/<service>.md` file.

## `METHOD /api/v1/resource`

Summary: short purpose.

Auth:
- Public / Required
- Roles: `CANDIDATE`, `RECRUITER`, `ADMIN`

Headers:

| Header | Required | Note |
| ------ | -------- | ---- |
| `Authorization: Bearer <accessToken>` | No | Required only for protected endpoints |

Request params:

| Field | Type | Required | Note |
| ----- | ---- | -------- | ---- |

Request query:

| Field | Type | Required | Default | Note |
| ----- | ---- | -------- | ------- | ---- |

Request body:

| Field | Type | Required | Nullable | Note |
| ----- | ---- | -------- | -------- | ---- |

```json
{}
```

Response fields:

| Field | Type | Required | Nullable | Note |
| ----- | ---- | -------- | -------- | ---- |

Success response:

```json
{
  "success": true,
  "data": {}
}
```

Errors:

| Status | Code | Meaning |
| ------ | ---- | ------- |

FE notes:
- Add UI handling notes here.
- Add special form-data/upload notes here.
