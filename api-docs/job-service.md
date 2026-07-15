# Job Service API Docs

Base path through gateway:
- Public: `/api/v1/jobs`
- Recruiter: `/api/v1/recruiter/jobs`
- Admin: `/api/v1/admin/jobs`

Responsibility: job posting lifecycle, manual moderation review, public job read.

## Rules

- Recruiters create complete `DRAFT` jobs. Drafts still require all submit-ready fields.
- Recruiters submit drafts for admin review; moderation only classifies risk and never auto-publishes.
- Review statuses:
  - `PENDING_REVIEW`: low risk, still waiting for admin.
  - `NEEDS_REVIEW`: medium/high risk, admin should inspect carefully.
  - `SHOULD_REJECT`: critical risk, system recommends rejection but admin still decides.
- Only admin approval moves a job to `PUBLISHED`.
- Guests can only list/read `PUBLISHED` jobs.
- Published jobs with applications use major revisions for core field changes.
- Minor fields can be updated directly: `deadline`, `numberOfOpenings`, `isSalaryVisible`.
- Major fields cannot be updated directly while a job is `PUBLISHED`. If the job has applications, create a major revision. If it has no applications, the current MVP blocks the direct update so the next implementation can route it through review instead of silently changing public content.
- Major fields require a revision when applications exist: `title`, `description`, `requirements`, `benefits`, `categoryId`, `employmentType`, `workingType`, `experienceLevel`, `location`, `salaryMin`, `salaryMax`, `salaryCurrency`.
- Approved major revisions apply to `jobs`, increment `version`, and emit a notification event.
- Company snapshot is synced by event `company.posting-snapshot-changed`. If a company becomes non-approved, published/reviewing jobs move to `SHOULD_REJECT` and are no longer public.
- Public search uses PostgreSQL full-text search over normalized `title`, `description`, `requirements`, `skills`, company snapshot name, and location.
- Delete is soft delete. Published jobs should be hidden with `UNPUBLISHED`, not deleted.

## Shared Payload Fields

Create/update job and revision bodies require:

```json
{
  "title": "Backend Developer",
  "description": "Develop and maintain REST APIs for NexHire.",
  "requirements": "At least 1 year experience with Node.js and PostgreSQL.",
  "skills": ["NestJS", "PostgreSQL", "RabbitMQ"],
  "benefits": "13th salary and hybrid work.",
  "categoryId": "b8b33c46-4bb0-4a33-8b0d-927e081a38a5",
  "employmentType": "FULL_TIME",
  "workingType": "HYBRID",
  "experienceLevel": "JUNIOR",
  "location": "Ha Noi, Viet Nam",
  "salaryMin": 15000000,
  "salaryMax": 25000000,
  "salaryCurrency": "VND",
  "isSalaryVisible": true,
  "deadline": "2026-09-30T17:00:00.000Z",
  "numberOfOpenings": 3
}
```

Required: `title`, `description`, `requirements`, `skills`, `employmentType`, `workingType`, `experienceLevel`, `location`.

Optional nullable: `benefits`, `categoryId`, `salaryMin`, `salaryMax`, `deadline`, `numberOfOpenings`.

## Endpoints

### GET `/api/v1/jobs`

Auth: public.

Query: `page`, `limit`, `q`, `search`, `skills`, `location`, `employmentType`, `workingType`, `experienceLevel`, `categoryId`, `salaryMin`, `salaryMax`, `sort`.

Returns a lightweight paginated published job list for candidate cards. Items include `id`, `title`, `companyId`, `companyName`, `companyLogoUrl`, salary display fields, `location`, `experienceLevel`, and `publishedAt`. Hidden salary jobs return `salaryMin: null` and `salaryMax: null`.

Full-text search:

- `q` searches normalized title, description, requirements, skills, company snapshot name, and location.
- `search` is kept as a backwards-compatible alias for `q`.
- `skills` accepts comma-separated terms, for example `skills=NestJS,PostgreSQL`.
- Multiple `skills` use OR matching, then results are ranked by how many requested skills they match. A job matching both `NestJS` and `PostgreSQL` ranks above a job matching only one.
- `sort` supports `relevance`, `latest`, `deadline_asc`, `salary_desc`, `salary_asc`.
- Salary filters apply only to salary-visible jobs to avoid leaking hidden ranges.

### GET `/api/v1/jobs/:id`

Auth: public.

Returns one published job detail for public readers. The response does not expose moderation, review, unpublish, or application-count fields. Non-published jobs return `404`.

### POST `/api/v1/recruiter/jobs`

Auth: recruiter with `companyId`.

Creates a complete `DRAFT` job. Company must be approved by job-service company snapshot rules.

Errors: `400` invalid salary/deadline, `403` company missing/not approved/suspended.

### GET `/api/v1/recruiter/jobs`

Auth: recruiter.

Lists jobs owned by the recruiter's company. Supports public filters plus `status`.

### GET `/api/v1/recruiter/jobs/:id`

Auth: recruiter.

Returns a company-owned job detail.

### PATCH `/api/v1/recruiter/jobs/:id`

Auth: recruiter.

Updates a draft job. Also updates eligible published jobs directly when no protected major revision flow is required.

If a published job already has applications and the update changes a major field, returns `409 JOB.MAJOR_UPDATE_REQUIRES_REVISION`.

If a published job has no applications but the update changes a major field, returns `409 JOB.MAJOR_UPDATE_REQUIRES_REVIEW`.

### DELETE `/api/v1/recruiter/jobs/:id`

Auth: recruiter.

Soft deletes an eligible company-owned job. Allowed only for `DRAFT`, `REJECTED`, or `UNPUBLISHED` jobs without applications.

### POST `/api/v1/recruiter/jobs/:id/unpublish`

Auth: recruiter.

Body:

```json
{
  "reason": "Temporarily paused by company"
}
```

Changes `PUBLISHED -> UNPUBLISHED`, hiding the job from public pages.

### POST `/api/v1/recruiter/jobs/:id/republish`

Auth: recruiter.

Changes `UNPUBLISHED -> PUBLISHED` when the latest company snapshot is `APPROVED`.

### POST `/api/v1/recruiter/jobs/:id/submit`

Auth: recruiter.

Submits a draft for manual admin review. Backend runs moderation and sets:

- low risk -> `PENDING_REVIEW`
- medium/high risk -> `NEEDS_REVIEW`
- critical risk -> `SHOULD_REJECT`

### POST `/api/v1/recruiter/jobs/:jobId/revisions`

Auth: recruiter.

Creates a full-snapshot major revision draft for a published job with applications.

Only one active revision is allowed per job.

### PATCH `/api/v1/recruiter/jobs/:jobId/revisions/:revisionId`

Auth: recruiter.

Updates a draft revision full snapshot.

### POST `/api/v1/recruiter/jobs/:jobId/revisions/:revisionId/submit`

Auth: recruiter.

Submits a major revision for manual admin review. Moderation classifies risk but does not approve.

### GET `/api/v1/admin/jobs/review-queue`

Auth: admin.

Lists jobs with `PENDING_REVIEW`, `NEEDS_REVIEW`, or `SHOULD_REJECT`. Query supports `status`, `search`, `page`, `limit`.

### POST `/api/v1/admin/jobs/:id/review`

Auth: admin.

Body:

```json
{
  "decision": "APPROVE",
  "reason": "Company and content verified."
}
```

`decision` is `APPROVE` or `REJECT`. `REJECT` requires `reason`.

Approve -> `PUBLISHED`; reject -> `REJECTED`.

Approve is blocked if the latest company snapshot on the job is not `APPROVED`.

### POST `/api/v1/admin/jobs/:id/unpublish`

Auth: admin.

Admin takedown for public jobs. Reason is required.

### POST `/api/v1/admin/jobs/:id/republish`

Auth: admin.

Republishes an unpublished job when the latest company snapshot is `APPROVED`.

### GET `/api/v1/admin/jobs/revision-review-queue`

Auth: admin.

Lists major revisions waiting for review.

### POST `/api/v1/admin/jobs/revisions/:revisionId/review`

Auth: admin.

Approve applies the revision to the job, increments `version`, and emits `job.revision-approved`. Reject leaves the current public job unchanged.

Approve is blocked if the latest company snapshot on the job is not `APPROVED`.

## Company Snapshot Event

Company-service should publish this event whenever posting eligibility changes:

Routing key:

```text
company.posting-snapshot-changed
```

Payload:

```json
{
  "companyId": "uuid",
  "companyName": "NexHire",
  "companyLogoUrl": "https://cdn.nexhire.vn/company/nexhire.png",
  "companyStatus": "APPROVED",
  "companyTrustLevel": "MEDIUM",
  "changedAt": "2026-07-15T10:00:00.000Z"
}
```

`companyStatus` values: `APPROVED`, `PENDING`, `REJECTED`, `SUSPENDED`.

`companyTrustLevel` values: `LOW`, `MEDIUM`, `HIGH`.

Job-service consumes the event and updates job snapshots by `companyId`. `companyName` and `companyLogoUrl` are optional patch fields; omitted fields keep their previous snapshot value.

## Application Submitted Event

Application-service publishes this event after a successful application submit:

Routing key:

```text
application.submitted
```

Payload:

```json
{
  "applicationId": "uuid",
  "jobId": "uuid",
  "jobTitle": "Backend Developer",
  "candidateId": "uuid",
  "candidateUserId": "uuid",
  "candidateFullName": "Nguyen Minh Khoa",
  "candidateAvatarDocumentId": "uuid",
  "companyId": "uuid",
  "companyName": "NexHire",
  "companyLogoUrl": "https://cdn.nexhire.vn/company/nexhire.png",
  "submittedAt": "2026-07-15T10:00:00.000Z"
}
```

Job-service consumes the event and increments `jobs.applicationCount`, which protects published jobs from direct major edits after candidates have applied.

## Internal Application Snapshot Endpoint

### `GET /api/v1/internal/jobs/:id/application-snapshot`

Internal only.

Summary: Get job/company snapshot and applyability for application-service before creating an application.

Auth:

- Required
- Internal service token header: `x-internal-service-token`

Success response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "companyId": "uuid",
    "companyName": "NexHire",
    "companyLogoUrl": "https://cdn.nexhire.vn/company/nexhire.png",
    "title": "Backend Developer",
    "status": "PUBLISHED",
    "deadline": "2026-09-30T17:00:00.000Z",
    "isApplyable": true
  }
}
```

Rules:

- `isApplyable = true` only for a published job that is not expired/closed/unpublished by status rules.
- Application-service rejects new applications when `isApplyable = false`.

Errors:

| Status | Meaning |
| ------ | ------- |
| 401 | Missing/invalid internal service token |
| 403 | Internal caller is not allowed |
| 404 | Job not found |

## Application Snapshot Stored By Application-Service

Application-service stores this snapshot at submit time:

```json
{
  "jobId": "uuid",
  "jobTitle": "Backend Developer",
  "companyId": "uuid",
  "companyName": "NexHire",
  "companyLogoUrl": "https://cdn.nexhire.vn/company/nexhire.png"
}
```
