# Application Service API Docs

Base path through gateway:

- Candidate: `/api/v1/applications`
- Recruiter: `/api/v1/recruiter/applications`

Responsibility: job application submission, candidate application history, recruiter application review, CV download handoff, and application stage events.

## Rules

- Only candidates can create applications.
- Candidate must apply with a CV from candidate-service `candidate_cvs`.
- Application-service stores snapshots at submit time:
  - job/company snapshot from job-service,
  - candidate/contact/avatar snapshot from candidate-service,
  - CV metadata snapshot from candidate-service.
- Active duplicate applications are blocked for the same candidate user and job when an existing application is `SUBMITTED` or `OFFERED`.
- Candidates may apply again after `WITHDRAWN`, `REJECTED`, or `CANCELLED`.
- `UNPUBLISHED` jobs are not applyable for new submissions, but existing applications remain available for recruiter handling.
- `CLOSED` jobs cancel active applications with status `CANCELLED`.
- CV content is not embedded in the application response. FE calls the CV download endpoint to get a short-lived URL.
- Candidate avatar URL is resolved dynamically from `candidateAvatarDocumentId` when available.

## Recruiter Matching

### `POST /api/v1/recruiter/applications/:id/match`

Summary: Request a fresh match score for a company-owned application.

Auth:

- Required
- Role: `RECRUITER`

Path params:

| Field | Required | Note |
| ----- | -------- | ---- |
| `id` | Yes | Application id. Must belong to the recruiter's company. |

Success response payload:

```json
{
  "id": "match-request-id",
  "applicationId": "application-id",
  "status": "PENDING",
  "requestType": "RECRUITER_MANUAL"
}
```

Errors: `401`, `403`, `404`, `503`.

## Statuses

| Status      | Meaning                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `SUBMITTED` | Candidate submitted the application and recruiter has not decided yet    |
| `OFFERED`   | Recruiter accepted the application for the next step/interview           |
| `REJECTED`  | Recruiter rejected the application                                       |
| `WITHDRAWN` | Candidate withdrew the application                                       |
| `CANCELLED` | Backend cancelled the active application, for example when job is closed |

## Response object

Application response data:

```json
{
  "id": "8bc64c96-6b76-4912-a89a-394c85f423db",
  "jobId": "11c72a94-a00f-4f1a-83ca-87e4c67fba3f",
  "jobTitle": "Backend Developer",
  "companyId": "6d4b04bd-e031-4e32-b556-4e46dbf32f53",
  "companyName": "NexHire",
  "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
  "companyLogoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
  "candidateId": "d6dd534c-fd20-4cec-87c9-a6178e78f933",
  "candidateUserId": "f9ae2e14-f689-4a3e-8c2f-249776d0b650",
  "candidateFullName": "Nguyen Minh Khoa",
  "candidateEmail": "khoa.nguyen@example.com",
  "candidatePhone": "0912345678",
  "candidateAvatarDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
  "candidateAvatarUrl": "https://minio.local/nexhire/avatar-url",
  "candidateCvId": "3c31a5db-870d-4f70-a589-0556f35b46d4",
  "cvDocumentId": "7bb46232-eb8d-40c8-ae0a-7e49ab98e26b",
  "cvTitle": "Backend Engineer CV",
  "cvFileName": "backend-cv.pdf",
  "cvMimeType": "application/pdf",
  "cvSize": 234567,
  "cvParseStatus": "PARSED",
  "matchScore": 92,
  "matchLevel": "EXCELLENT",
  "coverLetter": "I am interested in this role.",
  "status": "SUBMITTED",
  "statusNote": null,
  "submittedAt": "2026-07-15T10:00:00.000Z",
  "withdrawnAt": null,
  "decidedAt": null,
  "cancelledAt": null,
  "createdAt": "2026-07-15T10:00:00.000Z",
  "updatedAt": "2026-07-15T10:00:00.000Z"
}
```

## Candidate endpoints

### `POST /api/v1/applications`

Summary: Apply to a published job with an existing candidate CV.

Auth:

- Required
- Roles: `CANDIDATE`

Request body:

| Field           | Type   | Required | Note                                         |
| --------------- | ------ | -------- | -------------------------------------------- |
| `jobId`         | uuid   | Yes      | Published and applyable job id               |
| `candidateCvId` | uuid   | Yes      | CV id from candidate-service `candidate_cvs` |
| `coverLetter`   | string | No       | Max 5000 chars                               |

```json
{
  "jobId": "11c72a94-a00f-4f1a-83ca-87e4c67fba3f",
  "candidateCvId": "3c31a5db-870d-4f70-a589-0556f35b46d4",
  "coverLetter": "I am interested in this role."
}
```

Success response: application response object, status `201`.

Errors:

| Status | Meaning                                                  |
| ------ | -------------------------------------------------------- |
| 400    | Job is not applyable or request is invalid               |
| 401    | Missing/invalid access token                             |
| 403    | User role is not allowed                                 |
| 404    | Job or candidate CV not found                            |
| 409    | Candidate already has an active application for this job |
| 503    | Upstream job/candidate/document service unavailable      |

### `GET /api/v1/applications/me`

Summary: List current candidate applications.

Auth:

- Required
- Roles: `CANDIDATE`

Query:

| Field    | Type   | Required | Note                                                         |
| -------- | ------ | -------- | ------------------------------------------------------------ |
| `page`   | number | No       | Default pagination behavior                                  |
| `limit`  | number | No       | Default pagination behavior                                  |
| `status` | enum   | No       | `SUBMITTED`, `OFFERED`, `REJECTED`, `WITHDRAWN`, `CANCELLED` |

Success response: paginated array of application response objects.

### `GET /api/v1/applications/me/:id`

Summary: Get current candidate application detail.

Auth:

- Required
- Roles: `CANDIDATE`

Success response: application response object.

Errors: `401`, `403`, `404`.

### `GET /api/v1/applications/me/:id/cv`

Summary: Get a short-lived URL for the CV used in this application.

Auth:

- Required
- Roles: `CANDIDATE`

Success response:

```json
{
  "success": true,
  "data": {
    "documentId": "7bb46232-eb8d-40c8-ae0a-7e49ab98e26b",
    "fileName": "backend-cv.pdf",
    "mimeType": "application/pdf",
    "size": 234567,
    "url": "https://minio.local/nexhire/cv-url",
    "expiresInSeconds": 900
  }
}
```

Errors: `401`, `403`, `404`, `503`.

### `POST /api/v1/applications/me/:id/withdraw`

Summary: Withdraw an active application.

Auth:

- Required
- Roles: `CANDIDATE`

Request body:

| Field  | Type   | Required | Note           |
| ------ | ------ | -------- | -------------- |
| `note` | string | No       | Max 2000 chars |

```json
{
  "note": "I accepted another offer."
}
```

Success response: application response object with `status = WITHDRAWN`.

Errors:

| Status | Meaning                                                 |
| ------ | ------------------------------------------------------- |
| 400    | Request body invalid                                    |
| 401    | Missing/invalid access token                            |
| 403    | User role is not allowed                                |
| 404    | Application not found                                   |
| 409    | Application cannot be withdrawn from its current status |

## Recruiter endpoints

### `GET /api/v1/recruiter/applications`

Summary: List applications for jobs owned by the recruiter's company.

Auth:

- Required
- Roles: `RECRUITER`
- User must have `companyId` in access token/gateway identity.

Query:

| Field    | Type   | Required | Note                                             |
| -------- | ------ | -------- | ------------------------------------------------ |
| `page`   | number | No       | Default pagination behavior                      |
| `limit`  | number | No       | Default pagination behavior                      |
| `jobId`  | uuid   | No       | Filter by one job                                |
| `status` | enum   | No       | Application status                               |
| `search` | string | No       | Searches candidate name/email/job title snapshot |

Success response: paginated array of application response objects.

FE notes:

- `matchScore` and `matchLevel` may be `null` when matching-service has not scored the application yet.
- Recent candidate cards can use this endpoint with `limit=3`; no separate recent endpoint is required right now.

### `GET /api/v1/recruiter/applications/stats`

Summary: Return recruiter application counts and day buckets for dashboard charts.

Auth:

- Required
- Roles: `RECRUITER`
- User must have `companyId` in access token/gateway identity.

Query:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `from` | ISO date `YYYY-MM-DD` | No | Start date. Defaults to 6 days before `to`. |
| `to` | ISO date `YYYY-MM-DD` | No | End date. Defaults to today. |

Success response:

```json
{
  "success": true,
  "data": {
    "total": 10,
    "byStatus": {
      "SUBMITTED": 3,
      "OFFERED": 2,
      "REJECTED": 1,
      "WITHDRAWN": 4,
      "CANCELLED": 0
    },
    "byDay": [
      {
        "date": "2026-07-15",
        "submitted": 2,
        "offered": 1,
        "rejected": 0,
        "withdrawn": 0,
        "cancelled": 0
      }
    ],
    "responseRate": 30
  }
}
```

Rules:

- `responseRate = round((OFFERED + REJECTED) / total * 100)`.
- Missing statuses are returned as `0`.
- Day buckets are inclusive from `from` to `to`.

Errors: `401`, `403`, `422`.

### `GET /api/v1/recruiter/applications/:id`

Summary: Get application detail for the recruiter company.

Auth:

- Required
- Roles: `RECRUITER`

Success response: application response object.

Errors: `401`, `403`, `404`.

### `GET /api/v1/recruiter/applications/:id/cv`

Summary: Get a short-lived URL for the submitted CV.

Auth:

- Required
- Roles: `RECRUITER`

Success response: same shape as candidate CV download response.

Errors: `401`, `403`, `404`, `503`.

## Internal endpoints

### `PATCH /api/v1/internal/applications/:id/match-snapshot`

Internal only.

Summary: Update matching score snapshot for an application after matching-service scores it.

Auth:

- Required
- Internal service token header: `x-internal-service-token`

Request body:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `matchScore` | number | Yes | 0..100. |
| `matchLevel` | `LOW` \| `MEDIUM` \| `HIGH` \| `EXCELLENT` | No | If omitted, application-service derives it from score. |

```json
{
  "matchScore": 92
}
```

Success response: application response object with updated `matchScore` and `matchLevel`.

Derived level rules:

- `90..100` -> `EXCELLENT`
- `75..89` -> `HIGH`
- `50..74` -> `MEDIUM`
- `<50` -> `LOW`

### `GET /api/v1/internal/applications/cv-documents/:documentId/retention`

Internal only.

Summary: Tell candidate-service whether a CV document can be physically deleted from document-storage/MinIO.

Auth:

- Required
- Internal service token header: `x-internal-service-token`

Query params:

| Field            | Type          | Required | Note                                                          |
| ---------------- | ------------- | -------- | ------------------------------------------------------------- |
| `terminalBefore` | ISO date-time | No       | Terminal applications older than this are no longer blockers. |

Success response:

```json
{
  "success": true,
  "data": {
    "documentId": "7bb46232-eb8d-40c8-ae0f-249776d0b650",
    "canDelete": true,
    "activeApplicationCount": 0,
    "recentTerminalApplicationCount": 0,
    "blockingStatus": null
  }
}
```

Retention rules:

- `SUBMITTED` and `OFFERED` are active blockers.
- `WITHDRAWN`, `REJECTED`, and `CANCELLED` block cleanup until their terminal timestamp is older than `terminalBefore`.
- Candidate-service only calls this after the candidate has already soft-deleted the CV.
- Existing application snapshots remain queryable until document-storage physically removes the CV document after retention.

### `PATCH /api/v1/recruiter/applications/:id/status`

Summary: Mark an application as offered or rejected.

Auth:

- Required
- Roles: `RECRUITER`

Request body:

| Field    | Type   | Required | Note                    |
| -------- | ------ | -------- | ----------------------- |
| `status` | enum   | Yes      | `OFFERED` or `REJECTED` |
| `note`   | string | No       | Max 2000 chars          |

```json
{
  "status": "OFFERED",
  "note": "Candidate is suitable for interview."
}
```

Success response: application response object with updated status.

Errors:

| Status | Meaning                                     |
| ------ | ------------------------------------------- |
| 400    | Request body invalid                        |
| 401    | Missing/invalid access token                |
| 403    | User role is not allowed                    |
| 404    | Application not found                       |
| 409    | Application cannot move to requested status |

## Events

Application-service publishes:

| Routing key                 | When                                           |
| --------------------------- | ---------------------------------------------- |
| `application.submitted`     | After a successful application submit          |
| `application.stage-changed` | After withdraw, offer, reject, or cancellation |

Application-service consumes:

| Routing key                          | Behavior                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `job.unpublished`                    | No-op for existing applications; recruiters may still process them          |
| `job.closed`                         | Active `SUBMITTED`/`OFFERED` applications are moved to `CANCELLED`          |
| `candidate.profile-snapshot-changed` | Updates candidate name/email/phone/avatar snapshot on existing applications |
