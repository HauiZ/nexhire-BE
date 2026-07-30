# Notification Service API Docs

Base path through gateway:

- `/api/v1/notifications`

Responsibility: in-app notifications for candidates and recruiter companies, plus email/web-push notification modules.

## Rules

- Current FE-facing notification API is in-app notification only.
- Candidate notifications are scoped to `recipientType = USER` and current `userId`.
- Recruiter notifications are scoped to `recipientType = COMPANY` and current `companyId`.
- Recruiter users must have `companyId` in access token/gateway identity.
- Notifications are deduplicated by `dedupeKey` during event consumption.
- Read actions only affect the current user's/company's scoped notifications.
- In-app sender fields are snapshots for display:
  - `senderType`: `SYSTEM`, `CANDIDATE`, or `COMPANY`
  - `senderName`
  - `senderAvatarDocumentId`
  - `senderLogoUrl`

## Response object

```json
{
  "id": "25a3c489-7c52-430e-a07f-5c5a8183fed4",
  "recipientType": "USER",
  "recipientUserId": "f9ae2e14-f689-4a3e-8c2f-249776d0b650",
  "recipientCompanyId": null,
  "senderType": "COMPANY",
  "senderEntityId": "6d4b04bd-e031-4e32-b556-4e46dbf32f53",
  "senderName": "NexHire",
  "senderAvatarDocumentId": null,
  "senderLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
  "type": "APPLICATION_STAGE_CHANGED",
  "title": "Application update",
  "body": "NexHire moved your application for Backend Developer to OFFERED.",
  "data": {
    "applicationId": "8bc64c96-6b76-4912-a89a-394c85f423db",
    "jobId": "11c72a94-a00f-4f1a-83ca-87e4c67fba3f",
    "status": "OFFERED"
  },
  "readAt": null,
  "createdAt": "2026-07-15T10:00:00.000Z",
  "updatedAt": "2026-07-15T10:00:00.000Z"
}
```

## Endpoints

### `GET /api/v1/notifications`

Summary: List in-app notifications for the current candidate user or recruiter company.

Auth:

- Required
- Roles: `CANDIDATE`, `RECRUITER`

Query:

| Field        | Type   | Required | Note                                   |
| ------------ | ------ | -------- | -------------------------------------- |
| `page`       | number | No       | Default pagination behavior            |
| `limit`      | number | No       | Default pagination behavior            |
| `readStatus` | enum   | No       | `ALL`, `READ`, `UNREAD`; default `ALL` |

Success response: paginated array of notification response objects.

Errors:

| Status | Meaning                      |
| ------ | ---------------------------- |
| 400    | Invalid query                |
| 401    | Missing/invalid access token |
| 403    | User role is not allowed     |

### `GET /api/v1/notifications/unread-count`

Summary: Count unread in-app notifications in the current scope.

Auth:

- Required
- Roles: `CANDIDATE`, `RECRUITER`

Success response:

```json
{
  "success": true,
  "data": {
    "count": 3
  }
}
```

Errors: `401`, `403`.

### `PATCH /api/v1/notifications/read-all`

Summary: Mark all scoped notifications as read.

Auth:

- Required
- Roles: `CANDIDATE`, `RECRUITER`

Success response:

```json
{
  "success": true,
  "data": {
    "count": 0
  }
}
```

Errors: `401`, `403`.

### `PATCH /api/v1/notifications/:id/read`

Summary: Mark one scoped notification as read.

Auth:

- Required
- Roles: `CANDIDATE`, `RECRUITER`

Success response: notification response object with `readAt` set.

Errors:

| Status | Meaning                                 |
| ------ | --------------------------------------- |
| 401    | Missing/invalid access token            |
| 403    | User role is not allowed                |
| 404    | Notification not found in current scope |

## Consumed events

Notification-service consumes application events:

| Routing key                        | Notifications created                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application.submitted`            | Candidate receives confirmation; recruiter company receives a new application notification                                                                                                                  |
| `application.stage-changed`        | Candidate receives status update for `OFFERED`, `REJECTED`, or `CANCELLED`                                                                                                                                  |
| `company.posting-snapshot-changed` | Company owner receives status update for `APPROVED`, `REJECTED`, `SUSPENDED`, or `PENDING`; if `previousCompanyStatus` equals `companyStatus`, notification-service skips the duplicate status notification |
| `company-follow.job-published`     | Candidate receives an in-app notification when a followed company publishes a new public job                                                                                                                |

Company trust changes are not shown to candidates/public users. If a trust change changes posting eligibility indirectly, users only see the resulting company/job status messaging.

`SUBMITTED` and `WITHDRAWN` stage-change payloads are ignored by in-app notification handling.

## Email links

Verification and password-reset emails include both:

- link flow for FE pages,
- OTP fallback for manual input.

Frontend URL config:

```env
FRONTEND_URL=http://localhost:5173
FRONTEND_VERIFY_EMAIL_PATH=/verify-email
FRONTEND_RESET_PASSWORD_PATH=/reset-password
```

SMTP config for real email in local/dev currently uses Gmail app password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-16-character-gmail-app-password
SMTP_FROM="NexHire <your-gmail-address@gmail.com>"
```

To create `SMTP_PASS`, enable 2-Step Verification on the Gmail account, then create an App
Password for Mail. Do not use the normal Gmail login password.

Mailtrap sandbox is still supported through the `MAILTRAP_SMTP_*` variables, but it should stay
commented unless the team wants to capture test emails inside Mailtrap instead of sending to a real
inbox.
