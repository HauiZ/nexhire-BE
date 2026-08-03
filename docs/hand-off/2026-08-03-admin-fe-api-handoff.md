# Admin FE API Handoff - 2026-08-03

This handoff covers the Admin FE API gaps completed on 2026-08-03. All endpoints are available through Gateway under `/api/v1` and require an admin access token.

## Scope

- Admin avatar upload, replace, delete, and `GET /auth/me` avatar fields.
- Admin job and job revision detail endpoints for notification deep links and reload support.
- Admin access to existing in-app notification APIs with user-scoped ownership.
- Admin notification producers for company review, job review, and job revision review flows.

## Admin Avatar

### Get Current Admin

```http
GET /api/v1/auth/me
Authorization: Bearer <admin-access-token>
```

Response data includes admin avatar fields:

```json
{
  "id": "admin-user-id",
  "email": "nexhire.team.support@gmail.com",
  "fullName": "NexHire Admin",
  "phone": null,
  "role": "ADMIN",
  "avatarUrl": "https://signed-url",
  "avatarDocumentId": "avatar-document-id",
  "logoUrl": null,
  "logoDocumentId": null
}
```

Notes:

- `avatarUrl` is the display URL for the admin account avatar.
- If `avatarDocumentId` exists, BE tries to return a fresh signed download URL from document-storage.
- Admin does not use `logoUrl`; company logo fields are only meaningful for recruiter/company accounts.

### Upload Or Replace Avatar

```http
PATCH /api/v1/auth/me/avatar
Authorization: Bearer <admin-access-token>
Content-Type: multipart/form-data
```

Form fields:

| Field  | Note                      |
| ------ | ------------------------- |
| `file` | JPG, PNG, or WEBP, max 5 MB. |

Behavior:

- Stores the file in document-storage as `documentType=AVATAR`, `ownerType=user`.
- Updates auth user `avatarUrl` and `avatarDocumentId`.
- Deletes the previous avatar document best-effort.
- Returns the same response contract as `GET /api/v1/auth/me`.

### Delete Avatar

```http
DELETE /api/v1/auth/me/avatar
Authorization: Bearer <admin-access-token>
```

Behavior:

- Clears `avatarUrl` and `avatarDocumentId`.
- Deletes the previous avatar document best-effort.
- Returns the same response contract as `GET /api/v1/auth/me`.

Expected errors:

| Status | Code                             | Meaning                  |
| ------ | -------------------------------- | ------------------------ |
| 400    | `DOCUMENT.FILE_REQUIRED`         | Missing upload file.     |
| 400    | `DOCUMENT.UNSUPPORTED_FILE_TYPE` | Unsupported image type.  |
| 413    | `DOCUMENT.FILE_TOO_LARGE`        | File exceeds 5 MB.       |
| 401    | `COMMON.UNAUTHENTICATED`         | Missing or expired token. |
| 403    | `COMMON.FORBIDDEN`               | Current user is not admin. |
| 503    | `COMMON.SERVICE_UNAVAILABLE`     | Document service failed. |

## Admin Job Detail

### Get Job Detail

```http
GET /api/v1/admin/jobs/:jobId
Authorization: Bearer <admin-access-token>
```

Use this endpoint for notification deep links, page reloads, and opening detail from admin job tables.

Response uses existing `JobResponseDto`, including moderation fields:

```json
{
  "id": "job-id",
  "companyId": "company-id",
  "companyName": "NexHire Tech",
  "title": "Backend Engineer",
  "status": "NEEDS_REVIEW",
  "moderation": {
    "riskScore": 35,
    "riskLevel": "MEDIUM",
    "decision": "NEEDS_REVIEW",
    "reasons": ["Salary is unusually high for JUNIOR level"],
    "matchedRules": ["ABNORMAL_SALARY_BY_EXPERIENCE_LEVEL"]
  }
}
```

Missing job:

- `404 JOB.JOB_NOT_FOUND`

### Get Revision Detail

```http
GET /api/v1/admin/jobs/revisions/:revisionId
Authorization: Bearer <admin-access-token>
```

Use this endpoint for revision notification deep links and opening detail from the revision review queue.

Response uses existing `JobRevisionResponseDto`, including moderation fields:

```json
{
  "id": "revision-id",
  "jobId": "job-id",
  "status": "NEEDS_REVIEW",
  "title": "Senior Backend Developer",
  "changeSummary": "Update role scope and salary.",
  "moderation": {
    "riskScore": 35,
    "riskLevel": "MEDIUM",
    "decision": "NEEDS_REVIEW",
    "reasons": ["Salary is unusually high for JUNIOR level"],
    "matchedRules": ["ABNORMAL_SALARY_BY_EXPERIENCE_LEVEL"]
  }
}
```

Missing revision:

- `404 JOB.REVISION_NOT_FOUND`

Route note:

- `GET /api/v1/admin/jobs/revision-review-queue` is ordered before `GET /api/v1/admin/jobs/:jobId` in BE routing, so the queue endpoint is not parsed as a job id.

## Admin Notifications

Admin can use the existing in-app notification API:

```http
GET   /api/v1/notifications?page=1&limit=8&readStatus=ALL
GET   /api/v1/notifications/unread-count
PATCH /api/v1/notifications/read-all
PATCH /api/v1/notifications/:id/read
```

Admin scope:

- Only notifications with `recipientType=USER`.
- Only notifications where `recipientUserId` equals the admin user id from the access token.
- Recruiter notifications remain company-scoped.
- Candidate and admin notifications are user-scoped.

Supported admin notification types:

| Type                                 | Data FE should use                                      | Meaning                         |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------- |
| `ADMIN_COMPANY_REVIEW_REQUIRED`      | `{ "companyId": "company-id" }`                         | Company is waiting for review.  |
| `ADMIN_JOB_REVIEW_REQUIRED`          | `{ "jobId": "job-id" }`                                 | Job is waiting for review.      |
| `ADMIN_JOB_REVISION_REVIEW_REQUIRED` | `{ "jobId": "job-id", "revisionId": "revision-id" }`    | Job revision is waiting review. |
| `ADMIN_USER_RISK_DETECTED`           | Resource id in `data`, if available.                    | Reserved for later risk alerts. |
| `ADMIN_SYSTEM_ALERT`                 | Resource id in `data`, if available.                    | Reserved for later system alerts. |

Example item:

```json
{
  "id": "notification-id",
  "type": "ADMIN_JOB_REVIEW_REQUIRED",
  "title": "Job review required",
  "body": "Backend Engineer is waiting for admin review.",
  "readAt": null,
  "createdAt": "2026-08-03T08:00:00.000Z",
  "data": {
    "jobId": "job-id"
  }
}
```

Producer flows:

- Company create or verification resubmit to `PENDING` publishes `ADMIN_COMPANY_REVIEW_REQUIRED`.
- Job submit to moderation/review publishes `ADMIN_JOB_REVIEW_REQUIRED`.
- Job revision submit to moderation/review publishes `ADMIN_JOB_REVISION_REVIEW_REQUIRED`.
- Candidate apply CV already creates notifications for candidate and company/recruiter.
- Recruiter application stage updates already create candidate notifications for statuses with user-facing messages.
- Published jobs for followed companies already create `COMPANY_FOLLOWED_JOB_PUBLISHED` notifications for candidates.

Navigation recommendation:

- `ADMIN_COMPANY_REVIEW_REQUIRED`: open company detail by `companyId`.
- `ADMIN_JOB_REVIEW_REQUIRED`: call `GET /api/v1/admin/jobs/:jobId`.
- `ADMIN_JOB_REVISION_REVIEW_REQUIRED`: call `GET /api/v1/admin/jobs/revisions/:revisionId`.
- FE should only trust resource ids in `data`, then reload detail from the matching admin API.

## Verification

Passed:

```bash
npx jest apps/auth-service/src/auth/test/auth.service.spec.ts --runInBand --silent
npx jest apps/company-service/src/company/test/company.service.spec.ts --runInBand --silent
npx jest apps/job-service/src/job/test/job.service.spec.ts --runInBand --silent
npx jest apps/notification-service/src/in-app/test/notification.service.spec.ts --runInBand --silent
npm run build
```
