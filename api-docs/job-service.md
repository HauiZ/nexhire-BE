# Job Service API Docs

Base path through gateway:

- Public: `/api/v1/jobs`
- Recruiter: `/api/v1/recruiter/jobs`
- Admin: `/api/v1/admin/jobs`

Responsibility: job posting lifecycle, manual moderation review, public job read/search, and job snapshots for other services.

## Runtime config

| Env                                | Default  | Purpose                                                                                      |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `JOB_EXPIRATION_SWEEP_INTERVAL_MS` | `300000` | How often job-service sweeps expired published jobs. Minimum accepted value is `10000`.      |
| `COMPANY_SERVICE_URL`              | required | Used by job-service to verify company posting snapshot before create/submit/republish flows. |
| `INTERNAL_SERVICE_TOKEN`           | required | Service-to-service token used for internal snapshot calls.                                   |

## Rules For FE

- Recruiters can create only complete `DRAFT` jobs. Drafts still require all submit-ready fields.
- Moderation never auto-publishes. Admin approval is required before a job becomes public.
- Guests/candidates only see jobs with `status = PUBLISHED`.
- Public list is intentionally lightweight for job cards.
- Recruiter/admin responses include internal fields such as `status`, `applicationCount`, `reviewReason`, and `moderation`.
- Public responses never expose moderation, review reason, unpublish reason, or application count.
- Salary fields are returned as `null` when `isSalaryVisible = false`.
- Published jobs cannot update major fields directly. Use revision flow when applications exist.

## Internal Snapshots

### `GET /api/v1/internal/jobs/:id/matching-snapshot`

Summary: Return a job snapshot for matching-service scoring.

Auth:

- Internal service token only.

Success response payload:

```json
{
  "id": "job-id",
  "title": "Backend Engineer",
  "description": "Build APIs",
  "requirements": "NestJS and PostgreSQL",
  "skills": ["NestJS", "PostgreSQL"],
  "workingType": "ONSITE",
  "experienceLevel": "JUNIOR",
  "location": "Ha Noi",
  "salaryMin": 15000000,
  "salaryMax": 25000000
}
```

## Enums

```ts
type JobStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'NEEDS_REVIEW'
  | 'SHOULD_REJECT'
  | 'PUBLISHED'
  | 'UNPUBLISHED'
  | 'REJECTED'
  | 'CLOSED'
  | 'EXPIRED';

type JobRevisionStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'NEEDS_REVIEW'
  | 'SHOULD_REJECT'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type JobReviewDecision = 'APPROVE' | 'REJECT';
type JobModerationDecision = 'PENDING_REVIEW' | 'NEEDS_REVIEW' | 'SHOULD_REJECT';
type JobModerationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE';
type JobWorkingType = 'ONSITE' | 'REMOTE' | 'HYBRID';
type JobExperienceLevel = 'INTERN' | 'FRESHER' | 'JUNIOR' | 'MIDDLE' | 'SENIOR' | 'LEAD';
```

## Request Objects

### Job input body

Used by create/update job and create/update revision.

| Field              | Type                 | Required      | Nullable | Note                                             |
| ------------------ | -------------------- | ------------- | -------- | ------------------------------------------------ |
| `title`            | string               | Yes           | No       | Max 255 chars.                                   |
| `description`      | string               | Yes           | No       | Max 12000 chars.                                 |
| `requirements`     | string               | Yes           | No       | Max 8000 chars.                                  |
| `skills`           | string[]             | Yes           | No       | Max 50 items, each max 80 chars.                 |
| `benefits`         | string               | No            | Yes      | Max 8000 chars.                                  |
| `categoryId`       | uuid                 | No            | Yes      | Existing category id when category flow is used. |
| `employmentType`   | `JobType`            | Yes           | No       | See enum above.                                  |
| `workingType`      | `JobWorkingType`     | Yes           | No       | See enum above.                                  |
| `experienceLevel`  | `JobExperienceLevel` | Yes           | No       | See enum above.                                  |
| `location`         | string               | Yes           | No       | Max 255 chars.                                   |
| `salaryMin`        | number               | No            | Yes      | Integer, min 0.                                  |
| `salaryMax`        | number               | No            | Yes      | Integer, min 0. Must be >= `salaryMin`.          |
| `salaryCurrency`   | string               | No            | No       | Defaults to `VND`, max 3 chars.                  |
| `isSalaryVisible`  | boolean              | No            | No       | Defaults to `true`.                              |
| `deadline`         | ISO date-time        | No            | Yes      | Must be in the future.                           |
| `numberOfOpenings` | number               | No            | Yes      | Integer 1..1000.                                 |
| `changeSummary`    | string               | Revision only | Yes      | Max 1000 chars.                                  |

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

### Review body

| Field      | Type                  | Required             | Nullable | Note                  |
| ---------- | --------------------- | -------------------- | -------- | --------------------- |
| `decision` | `APPROVE` \| `REJECT` | Yes                  | No       | Admin final decision. |
| `reason`   | string                | Required when reject | Yes      | Max 2000 chars.       |

```json
{
  "decision": "APPROVE",
  "reason": "Company and content verified."
}
```

### Reason body

| Field    | Type   | Required | Nullable | Note                               |
| -------- | ------ | -------- | -------- | ---------------------------------- |
| `reason` | string | No       | Yes      | Admin unpublish requires a reason. |

```json
{
  "reason": "Temporarily paused by company"
}
```

## Response Objects

### Pagination envelope

```json
{
  "success": true,
  "data": [{}],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

### PublicJobListItem

Used by `GET /api/v1/jobs` and `GET /api/v1/jobs/companies/:companyId`.

| Field                   | Type                 | Nullable | Note                                                                                           |
| ----------------------- | -------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `id`                    | uuid                 | No       | Job id.                                                                                        |
| `title`                 | string               | No       | Job title.                                                                                     |
| `companyId`             | uuid                 | No       | Company id.                                                                                    |
| `companyName`           | string               | Yes      | Snapshot from company-service.                                                                 |
| `companyLogoUrl`        | string               | Yes      | Resolved render URL for company logo when possible, otherwise legacy/manual logo URL snapshot. |
| `companyLogoDocumentId` | uuid                 | Yes      | Company logo document id snapshot from company-service. FE should prefer this for rendering.   |
| `skills`                | string[]             | No       | Skill tags for card chips.                                                                     |
| `categoryId`            | uuid                 | Yes      | Category id for grouping/filtering.                                                            |
| `employmentType`        | `JobType`            | No       | Employment type.                                                                               |
| `workingType`           | `JobWorkingType`     | No       | Working mode.                                                                                  |
| `experienceLevel`       | `JobExperienceLevel` | No       | For card display/filter.                                                                       |
| `location`              | string               | No       | Job location.                                                                                  |
| `salaryMin`             | number               | Yes      | `null` when salary hidden.                                                                     |
| `salaryMax`             | number               | Yes      | `null` when salary hidden.                                                                     |
| `salaryCurrency`        | string               | No       | Example `VND`.                                                                                 |
| `isSalaryVisible`       | boolean              | No       | FE can show hidden salary label when false.                                                    |
| `deadline`              | ISO date-time        | Yes      | Application deadline.                                                                          |
| `publishedAt`           | ISO date-time        | Yes      | Publish timestamp.                                                                             |

### PublicJobDetail

Used by `GET /api/v1/jobs/:id`. Same as list item plus:

| Field              | Type          | Nullable | Note                    |
| ------------------ | ------------- | -------- | ----------------------- |
| `description`      | string        | No       | Full job description.   |
| `requirements`     | string        | No       | Job requirements.       |
| `benefits`         | string        | Yes      | Optional benefits.      |
| `numberOfOpenings` | number        | Yes      | Optional opening count. |
| `createdAt`        | ISO date-time | No       | Created timestamp.      |
| `updatedAt`        | ISO date-time | No       | Updated timestamp.      |

### PublicFeaturedCompany

Used by `GET /api/v1/jobs/featured-companies`.

| Field                   | Type          | Nullable | Note                                                                                           |
| ----------------------- | ------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `companyId`             | uuid          | No       | Company id.                                                                                    |
| `companyName`           | string        | Yes      | Company name snapshot from published jobs.                                                     |
| `companyLogoUrl`        | string        | Yes      | Resolved render URL for company logo when possible, otherwise legacy/manual logo URL snapshot. |
| `companyLogoDocumentId` | uuid          | Yes      | Company logo document id snapshot.                                                             |
| `activeJobCount`        | number        | No       | Number of published jobs for the company.                                                      |
| `latestPublishedAt`     | ISO date-time | Yes      | Latest job publish time.                                                                       |

### PublicHomeStats

Used by `GET /api/v1/jobs/home/stats`.

| Field                | Type   | Nullable | Note                                                            |
| -------------------- | ------ | -------- | --------------------------------------------------------------- |
| `publishedJobCount`  | number | No       | Count of public jobs visible on home/search.                    |
| `activeCompanyCount` | number | No       | Count of companies that currently have at least one public job. |
| `categoryCount`      | number | No       | Count of categories currently represented by public jobs.       |

### RecruiterJobStatusCounts

Used by `GET /api/v1/recruiter/jobs/status-counts`.

| Field            | Type   | Nullable | Note                                               |
| ---------------- | ------ | -------- | -------------------------------------------------- |
| `DRAFT`          | number | No       | Draft jobs.                                        |
| `PENDING_REVIEW` | number | No       | Submitted and waiting for admin review.            |
| `NEEDS_REVIEW`   | number | No       | Moderate-risk jobs admin should inspect carefully. |
| `SHOULD_REJECT`  | number | No       | High-risk jobs likely to be rejected.              |
| `PUBLISHED`      | number | No       | Public active jobs.                                |
| `UNPUBLISHED`    | number | No       | Hidden but not closed jobs.                        |
| `REJECTED`       | number | No       | Jobs rejected by admin.                            |
| `CLOSED`         | number | No       | Closed jobs.                                       |
| `EXPIRED`        | number | No       | Expired jobs.                                      |

### PublicCategory

Used by `GET /api/v1/categories`.

| Field            | Type   | Nullable | Note                                            |
| ---------------- | ------ | -------- | ----------------------------------------------- |
| `id`             | uuid   | No       | Category id to send as `categoryId` job filter. |
| `name`           | string | No       | Display name.                                   |
| `slug`           | string | No       | Stable URL/display key.                         |
| `description`    | string | Yes      | Optional category description.                  |
| `activeJobCount` | number | No       | Number of published jobs in this category.      |

### JobResponse

Used by recruiter/admin endpoints.

| Field                     | Type                                      | Nullable | Note                                                                                           |
| ------------------------- | ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `id`                      | uuid                                      | No       | Job id.                                                                                        |
| `companyId`               | uuid                                      | No       | Owner company id.                                                                              |
| `companyName`             | string                                    | Yes      | Company snapshot.                                                                              |
| `companyLogoUrl`          | string                                    | Yes      | Resolved render URL for company logo when possible, otherwise legacy/manual logo URL snapshot. |
| `companyLogoDocumentId`   | uuid                                      | Yes      | Company logo document id snapshot.                                                             |
| `title`                   | string                                    | No       | Full job field.                                                                                |
| `description`             | string                                    | No       | Full job field.                                                                                |
| `requirements`            | string                                    | No       | Full job field.                                                                                |
| `skills`                  | string[]                                  | No       | Full job field.                                                                                |
| `benefits`                | string                                    | Yes      | Full job field.                                                                                |
| `categoryId`              | uuid                                      | Yes      | Full job field.                                                                                |
| `employmentType`          | `JobType`                                 | No       | Full job field.                                                                                |
| `workingType`             | `JobWorkingType`                          | No       | Full job field.                                                                                |
| `experienceLevel`         | `JobExperienceLevel`                      | No       | Full job field.                                                                                |
| `location`                | string                                    | No       | Full job field.                                                                                |
| `salaryMin`               | number                                    | Yes      | Already hidden when `isSalaryVisible = false`.                                                 |
| `salaryMax`               | number                                    | Yes      | Already hidden when `isSalaryVisible = false`.                                                 |
| `salaryCurrency`          | string                                    | No       | Example `VND`.                                                                                 |
| `isSalaryVisible`         | boolean                                   | No       | Salary visibility flag.                                                                        |
| `deadline`                | ISO date-time                             | Yes      | Deadline.                                                                                      |
| `numberOfOpenings`        | number                                    | Yes      | Opening count.                                                                                 |
| `status`                  | `JobStatus`                               | No       | Current lifecycle status.                                                                      |
| `version`                 | number                                    | No       | Incremented when major revision is approved.                                                   |
| `applicationCount`        | number                                    | No       | Used to decide revision flow.                                                                  |
| `publishedAt`             | ISO date-time                             | Yes      | Set after approve.                                                                             |
| `closedAt`                | ISO date-time                             | Yes      | Set after close.                                                                               |
| `reviewedAt`              | ISO date-time                             | Yes      | Last admin review timestamp.                                                                   |
| `reviewReason`            | string                                    | Yes      | Admin reject/close reason.                                                                     |
| `unpublishedAt`           | ISO date-time                             | Yes      | Set after unpublish/expire.                                                                    |
| `unpublishReason`         | string                                    | Yes      | Hide reason.                                                                                   |
| `moderation.riskScore`    | number                                    | Yes      | 0..100 after submit.                                                                           |
| `moderation.riskLevel`    | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` | Yes      | Null before submit.                                                                            |
| `moderation.decision`     | `JobModerationDecision`                   | Yes      | Null before submit.                                                                            |
| `moderation.reasons`      | string[]                                  | No       | Human-readable moderation reasons.                                                             |
| `moderation.matchedRules` | string[]                                  | No       | Rule ids for admin UI.                                                                         |
| `createdAt`               | ISO date-time                             | No       | Created timestamp.                                                                             |
| `updatedAt`               | ISO date-time                             | No       | Updated timestamp.                                                                             |

### JobRevisionResponse

Used by revision endpoints. Same job fields as `JobResponse`, but:

| Field           | Type                | Nullable | Note                                    |
| --------------- | ------------------- | -------- | --------------------------------------- |
| `id`            | uuid                | No       | Revision id.                            |
| `jobId`         | uuid                | No       | Target job id.                          |
| `status`        | `JobRevisionStatus` | No       | Revision status.                        |
| `changeSummary` | string              | Yes      | Recruiter note.                         |
| `moderation`    | object              | No       | Same shape as `JobResponse.moderation`. |
| `reviewedAt`    | ISO date-time       | Yes      | Admin review timestamp.                 |
| `reviewReason`  | string              | Yes      | Admin reason.                           |

## Public Endpoints

## `GET /api/v1/jobs`

Summary: List published jobs for guest/candidate job cards.

Auth:

- Public

Request query:

| Field             | Type                                                                       | Required | Default     | Note                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`            | number                                                                     | No       | `1`         | Pagination page.                                                                                                                                                                                                                      |
| `limit`           | number                                                                     | No       | `20`        | Pagination size.                                                                                                                                                                                                                      |
| `q`               | string                                                                     | No       | -           | Relaxed full-text search over title, description, requirements, skills, company name, location. Natural phrases like `kỹ năng Nestjs` are normalized, generic words are ignored, and meaningful terms are matched as OR prefix terms. |
| `search`          | string                                                                     | No       | -           | Backward-compatible alias for `q`.                                                                                                                                                                                                    |
| `skills`          | string                                                                     | No       | -           | Comma-separated OR search, for example `NestJS,PostgreSQL`.                                                                                                                                                                           |
| `location`        | string                                                                     | No       | -           | Location filter.                                                                                                                                                                                                                      |
| `employmentType`  | `JobType`                                                                  | No       | -           | Exact filter.                                                                                                                                                                                                                         |
| `workingType`     | `JobWorkingType`                                                           | No       | -           | Exact filter.                                                                                                                                                                                                                         |
| `experienceLevel` | `JobExperienceLevel`                                                       | No       | -           | Exact filter.                                                                                                                                                                                                                         |
| `categoryId`      | uuid                                                                       | No       | -           | Exact filter.                                                                                                                                                                                                                         |
| `salaryMin`       | number                                                                     | No       | -           | Applies only when salary visible.                                                                                                                                                                                                     |
| `salaryMax`       | number                                                                     | No       | -           | Applies only when salary visible.                                                                                                                                                                                                     |
| `sort`            | `relevance` \| `latest` \| `deadline_asc` \| `salary_desc` \| `salary_asc` | No       | `relevance` | Sort mode.                                                                                                                                                                                                                            |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "33333333-3333-3333-3333-333333333333",
      "title": "Backend Developer",
      "companyId": "22222222-2222-2222-2222-222222222222",
      "companyName": "NexHire Tech",
      "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
      "companyLogoDocumentId": "77777777-7777-4777-8777-777777777777",
      "skills": ["NestJS", "PostgreSQL"],
      "categoryId": "11111111-1111-4111-8111-111111111111",
      "employmentType": "FULL_TIME",
      "workingType": "HYBRID",
      "experienceLevel": "JUNIOR",
      "location": "Ha Noi, Viet Nam",
      "salaryMin": 15000000,
      "salaryMax": 25000000,
      "salaryCurrency": "VND",
      "isSalaryVisible": true,
      "deadline": "2026-12-31T17:00:00.000Z",
      "publishedAt": "2026-07-16T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Errors:

| Status | Code                      | Meaning                    |
| ------ | ------------------------- | -------------------------- |
| 400    | `COMMON.VALIDATION_ERROR` | Invalid query enum/number. |
| 500    | `COMMON.INTERNAL_ERROR`   | Server error.              |

FE notes:

- Use this endpoint for job cards, not detail cards.
- Do not expect `description`, `requirements`, `moderation`, or `applicationCount` here.
- FE should render `companyLogoUrl` directly when present.
- `companyLogoUrl` is resolved by job-service through document-storage internal API when `companyLogoDocumentId` exists; FE must not call internal document endpoints.
- `companyLogoDocumentId` remains the stable source of truth for synchronization/audit.
- Job-service caches resolved document URLs until shortly before their expiry, so repeated job card reads do not hit document-storage every time.

## `GET /api/v1/jobs/companies/:companyId`

Summary: List published jobs for a public company profile.

Auth:

- Public

Request params:

| Field       | Type | Required | Note                                      |
| ----------- | ---- | -------- | ----------------------------------------- |
| `companyId` | uuid | Yes      | Approved company id from company profile. |

Request query: same filters/sort/pagination as `GET /api/v1/jobs`.

Success response: paginated array of `PublicJobListItem`.

Errors:

| Status | Code                      | Meaning                      |
| ------ | ------------------------- | ---------------------------- |
| 400    | `COMMON.VALIDATION_ERROR` | Invalid company id or query. |
| 500    | `COMMON.INTERNAL_ERROR`   | Server error.                |

FE notes:

- Use this on the public company profile page instead of filtering client-side.
- Only `PUBLISHED` jobs are returned; draft, reviewing, unpublished, closed, expired, and rejected jobs stay hidden.

## `GET /api/v1/jobs/featured-companies`

Summary: List active hiring companies for the home page.

Auth:

- Public

Request query:

| Field   | Type   | Required | Default | Note                                           |
| ------- | ------ | -------- | ------- | ---------------------------------------------- |
| `limit` | number | No       | `6`     | Max `20`; invalid values fall back to default. |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "companyId": "22222222-2222-2222-2222-222222222222",
      "companyName": "NexHire Tech",
      "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
      "companyLogoDocumentId": "77777777-7777-4777-8777-777777777777",
      "activeJobCount": 12,
      "latestPublishedAt": "2026-07-16T10:00:00.000Z"
    }
  ]
}
```

FE notes:

- Use this for the home section "Nha tuyen dung dang tang toc".
- Data is derived from currently `PUBLISHED` jobs, so companies without public jobs are not returned.

## `GET /api/v1/jobs/home/stats`

Summary: Return public counters for the home hero.

Auth:

- Public

Success response:

```json
{
  "success": true,
  "data": {
    "publishedJobCount": 12400,
    "activeCompanyCount": 680,
    "categoryCount": 48
  }
}
```

FE notes:

- These numbers reflect public job data, not admin-only company totals.
- `activeCompanyCount` means companies with at least one `PUBLISHED` job.

## `GET /api/v1/categories`

Summary: List active job categories with active public job counts.

Auth:

- Public

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Engineering",
      "slug": "engineering",
      "description": "Software engineering, infrastructure, QA, and technical roles",
      "activeJobCount": 320
    }
  ]
}
```

FE notes:

- Send `id` as `categoryId` to `GET /api/v1/jobs`.
- Categories with zero jobs are still returned when active, so the UI can keep stable filters.

## `GET /api/v1/jobs/:id`

Summary: Get public detail of one published job.

Auth:

- Public

Request params:

| Field | Type | Required | Note              |
| ----- | ---- | -------- | ----------------- |
| `id`  | uuid | Yes      | Published job id. |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "companyName": "NexHire Tech",
    "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
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
    "numberOfOpenings": 3,
    "publishedAt": "2026-07-16T10:00:00.000Z",
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code                      | Meaning                                 |
| ------ | ------------------------- | --------------------------------------- |
| 400    | `COMMON.VALIDATION_ERROR` | Invalid UUID.                           |
| 404    | `JOB.JOB_NOT_PUBLIC`      | Job does not exist or is not published. |

FE notes:

- Show 404/empty state when job is `DRAFT`, `PENDING_REVIEW`, `UNPUBLISHED`, `CLOSED`, `EXPIRED`, or `REJECTED`.

## Recruiter Endpoints

## `POST /api/v1/recruiter/jobs`

Summary: Create a complete draft job.

Auth:

- Required
- Roles: `RECRUITER`

Headers:

| Header                                | Required | Note                                                         |
| ------------------------------------- | -------- | ------------------------------------------------------------ |
| `Authorization: Bearer <accessToken>` | Yes      | Token must include recruiter identity and company ownership. |

Request body: `Job input body`.

Success response:

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "companyName": "NexHire Tech",
    "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
    "title": "Backend Developer",
    "description": "Develop and maintain REST APIs for NexHire.",
    "requirements": "At least 1 year experience with Node.js and PostgreSQL.",
    "skills": ["NestJS", "PostgreSQL", "RabbitMQ"],
    "benefits": "13th salary and hybrid work.",
    "categoryId": null,
    "employmentType": "FULL_TIME",
    "workingType": "HYBRID",
    "experienceLevel": "JUNIOR",
    "location": "Ha Noi, Viet Nam",
    "salaryMin": 15000000,
    "salaryMax": 25000000,
    "salaryCurrency": "VND",
    "isSalaryVisible": true,
    "deadline": "2026-09-30T17:00:00.000Z",
    "numberOfOpenings": 3,
    "status": "DRAFT",
    "version": 1,
    "applicationCount": 0,
    "publishedAt": null,
    "closedAt": null,
    "reviewedAt": null,
    "reviewReason": null,
    "unpublishedAt": null,
    "unpublishReason": null,
    "moderation": {
      "riskScore": null,
      "riskLevel": null,
      "decision": null,
      "reasons": [],
      "matchedRules": []
    },
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T09:00:00.000Z"
  }
}
```

Errors:

| Status | Code                       | Meaning                                  |
| ------ | -------------------------- | ---------------------------------------- |
| 400    | `JOB.INVALID_SALARY_RANGE` | `salaryMin > salaryMax`.                 |
| 400    | `JOB.INVALID_DEADLINE`     | Deadline is not in the future.           |
| 401    | `COMMON.UNAUTHORIZED`      | Missing/invalid token.                   |
| 403    | `JOB.COMPANY_REQUIRED`     | Recruiter has no company id.             |
| 403    | `JOB.COMPANY_NOT_APPROVED` | Company is not approved.                 |
| 403    | `JOB.COMPANY_SUSPENDED`    | Company is suspended.                    |
| 422    | `COMMON.VALIDATION_ERROR`  | Invalid body shape.                      |
| 503    | `AI.SERVICE_UNAVAILABLE`   | Company-service snapshot is unavailable. |

FE notes:

- Create button should be disabled/blocked until required fields are present.
- If company is not approved/suspended, show company verification status CTA.

## `GET /api/v1/recruiter/jobs`

Summary: List jobs owned by the recruiter's company.

Auth:

- Required
- Roles: `RECRUITER`

Request query:

Same as public list plus:

| Field    | Type        | Required | Default | Note                        |
| -------- | ----------- | -------- | ------- | --------------------------- |
| `status` | `JobStatus` | No       | -       | Filter by lifecycle status. |

Success response: paginated array of `JobResponse`.

```json
{
  "success": true,
  "data": [
    {
      "id": "33333333-3333-3333-3333-333333333333",
      "companyId": "22222222-2222-2222-2222-222222222222",
      "companyName": "NexHire Tech",
      "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
      "title": "Backend Developer",
      "description": "Develop and maintain REST APIs for NexHire.",
      "requirements": "At least 1 year experience with Node.js and PostgreSQL.",
      "skills": ["NestJS", "PostgreSQL"],
      "benefits": null,
      "categoryId": null,
      "employmentType": "FULL_TIME",
      "workingType": "HYBRID",
      "experienceLevel": "JUNIOR",
      "location": "Ha Noi",
      "salaryMin": 15000000,
      "salaryMax": 25000000,
      "salaryCurrency": "VND",
      "isSalaryVisible": true,
      "deadline": null,
      "numberOfOpenings": 3,
      "status": "DRAFT",
      "version": 1,
      "applicationCount": 0,
      "publishedAt": null,
      "closedAt": null,
      "reviewedAt": null,
      "reviewReason": null,
      "unpublishedAt": null,
      "unpublishReason": null,
      "moderation": {
        "riskScore": null,
        "riskLevel": null,
        "decision": null,
        "reasons": [],
        "matchedRules": []
      },
      "createdAt": "2026-07-16T09:00:00.000Z",
      "updatedAt": "2026-07-16T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Errors:

| Status | Code                      | Meaning                             |
| ------ | ------------------------- | ----------------------------------- |
| 400    | `COMMON.VALIDATION_ERROR` | Invalid query.                      |
| 401    | `COMMON.UNAUTHORIZED`     | Missing/invalid token.              |
| 403    | `COMMON.FORBIDDEN`        | User is not recruiter with company. |

FE notes:

- Use this endpoint for management lists. For dashboard counters, prefer `GET /api/v1/recruiter/jobs/status-counts`.

## `GET /api/v1/recruiter/jobs/status-counts`

Summary: Return job lifecycle counts for the recruiter's company.

Auth:

- Required
- Roles: `RECRUITER`
- User must have `companyId` in access token/gateway identity.

Success response:

```json
{
  "success": true,
  "data": {
    "DRAFT": 1,
    "PENDING_REVIEW": 2,
    "NEEDS_REVIEW": 1,
    "SHOULD_REJECT": 0,
    "PUBLISHED": 4,
    "UNPUBLISHED": 1,
    "REJECTED": 0,
    "CLOSED": 0,
    "EXPIRED": 0
  }
}
```

Errors:

| Status | Code                   | Meaning                      |
| ------ | ---------------------- | ---------------------------- |
| 401    | `COMMON.UNAUTHORIZED`  | Missing/invalid token.       |
| 403    | `JOB.COMPANY_REQUIRED` | Recruiter has no company id. |

FE notes:

- This replaces multiple `GET /api/v1/recruiter/jobs?status=...&limit=1` calls.
- Dashboard pending count should be `PENDING_REVIEW + NEEDS_REVIEW + SHOULD_REJECT`.

## `GET /api/v1/recruiter/jobs/:id`

Summary: Get one company-owned job.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note    |
| ----- | ---- | -------- | ------- |
| `id`  | uuid | Yes      | Job id. |

Success response: `JobResponse`.

Errors:

| Status | Code                      | Meaning                               |
| ------ | ------------------------- | ------------------------------------- |
| 400    | `COMMON.VALIDATION_ERROR` | Invalid UUID.                         |
| 401    | `COMMON.UNAUTHORIZED`     | Missing/invalid token.                |
| 403    | `COMMON.FORBIDDEN`        | User is not recruiter with company.   |
| 404    | `JOB.JOB_NOT_FOUND`       | Job not found in recruiter's company. |

## `PATCH /api/v1/recruiter/jobs/:id`

Summary: Update draft job or allowed minor fields on a published job.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note    |
| ----- | ---- | -------- | ------- |
| `id`  | uuid | Yes      | Job id. |

Request body: full `Job input body`.

Success response: `JobResponse`.

Errors:

| Status | Code                                 | Meaning                                                       |
| ------ | ------------------------------------ | ------------------------------------------------------------- |
| 400    | `JOB.INVALID_SALARY_RANGE`           | `salaryMin > salaryMax`.                                      |
| 400    | `JOB.INVALID_DEADLINE`               | Deadline is not in the future.                                |
| 401    | `COMMON.UNAUTHORIZED`                | Missing/invalid token.                                        |
| 403    | `COMMON.FORBIDDEN`                   | User is not recruiter with company.                           |
| 404    | `JOB.JOB_NOT_FOUND`                  | Job not found.                                                |
| 409    | `JOB.MAJOR_UPDATE_REQUIRES_REVIEW`   | Published job has no application but major update is blocked. |
| 409    | `JOB.MAJOR_UPDATE_REQUIRES_REVISION` | Published job has applications; create revision instead.      |
| 409    | `JOB.JOB_NOT_EDITABLE`               | Status is not editable.                                       |
| 422    | `COMMON.VALIDATION_ERROR`            | Invalid body.                                                 |

FE notes:

- Minor direct-update fields for `PUBLISHED`: `deadline`, `numberOfOpenings`, `isSalaryVisible`.
- Major fields: `title`, `description`, `requirements`, `skills`, `benefits`, `categoryId`, `employmentType`, `workingType`, `experienceLevel`, `location`, `salaryMin`, `salaryMax`, `salaryCurrency`.

## `POST /api/v1/recruiter/jobs/:id/submit`

Summary: Submit a draft job for moderation and manual admin review.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note          |
| ----- | ---- | -------- | ------------- |
| `id`  | uuid | Yes      | Draft job id. |

Success response: `JobResponse`.

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "status": "NEEDS_REVIEW",
    "moderation": {
      "riskScore": 45,
      "riskLevel": "MEDIUM",
      "decision": "NEEDS_REVIEW",
      "reasons": ["Job content links to an external form"],
      "matchedRules": ["RISK_EXTERNAL_FORM"]
    }
  }
}
```

Status mapping:

| Risk level | Job status       | FE meaning                                        |
| ---------- | ---------------- | ------------------------------------------------- |
| `LOW`      | `PENDING_REVIEW` | Normal queue, waiting for admin.                  |
| `MEDIUM`   | `NEEDS_REVIEW`   | Admin should inspect carefully.                   |
| `HIGH`     | `NEEDS_REVIEW`   | High-risk review queue.                           |
| `CRITICAL` | `SHOULD_REJECT`  | System recommends rejection, admin still decides. |

Errors:

| Status | Code                       | Meaning                                  |
| ------ | -------------------------- | ---------------------------------------- |
| 401    | `COMMON.UNAUTHORIZED`      | Missing/invalid token.                   |
| 403    | `JOB.COMPANY_NOT_APPROVED` | Company is not approved anymore.         |
| 403    | `JOB.COMPANY_SUSPENDED`    | Company is suspended.                    |
| 404    | `JOB.JOB_NOT_FOUND`        | Job not found.                           |
| 409    | `JOB.JOB_NOT_EDITABLE`     | Only `DRAFT` jobs can be submitted.      |
| 503    | `AI.SERVICE_UNAVAILABLE`   | Company-service snapshot is unavailable. |

FE notes:

- After submit, switch recruiter UI from editor to review-status view.
- Do not show public link until status becomes `PUBLISHED`.

## `DELETE /api/v1/recruiter/jobs/:id`

Summary: Soft delete an eligible company-owned job.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note    |
| ----- | ---- | -------- | ------- |
| `id`  | uuid | Yes      | Job id. |

Success response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

Errors:

| Status | Code                     | Meaning                                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------------------------ |
| 401    | `COMMON.UNAUTHORIZED`    | Missing/invalid token.                                                               |
| 403    | `COMMON.FORBIDDEN`       | User is not recruiter with company.                                                  |
| 404    | `JOB.JOB_NOT_FOUND`      | Job not found.                                                                       |
| 409    | `JOB.DELETE_NOT_ALLOWED` | Only `DRAFT`, `REJECTED`, or `UNPUBLISHED` jobs without applications can be deleted. |

## `POST /api/v1/recruiter/jobs/:id/unpublish`

Summary: Hide a published job from public pages.

Auth:

- Required
- Roles: `RECRUITER`

Request body: `Reason body`.

Success response: `JobResponse` with `status = UNPUBLISHED`.

Errors:

| Status | Code                        | Meaning                                   |
| ------ | --------------------------- | ----------------------------------------- |
| 401    | `COMMON.UNAUTHORIZED`       | Missing/invalid token.                    |
| 403    | `COMMON.FORBIDDEN`          | User is not recruiter with company.       |
| 404    | `JOB.JOB_NOT_FOUND`         | Job not found.                            |
| 409    | `JOB.UNPUBLISH_NOT_ALLOWED` | Only `PUBLISHED` jobs can be unpublished. |

## `POST /api/v1/recruiter/jobs/:id/republish`

Summary: Restore an unpublished job to public pages.

Auth:

- Required
- Roles: `RECRUITER`

Success response: `JobResponse` with `status = PUBLISHED`.

Errors:

| Status | Code                        | Meaning                                     |
| ------ | --------------------------- | ------------------------------------------- |
| 403    | `JOB.COMPANY_NOT_APPROVED`  | Company snapshot is not approved.           |
| 404    | `JOB.JOB_NOT_FOUND`         | Job not found.                              |
| 409    | `JOB.REPUBLISH_NOT_ALLOWED` | Only `UNPUBLISHED` jobs can be republished. |

## `POST /api/v1/recruiter/jobs/:id/close`

Summary: Permanently close a published/unpublished job.

Auth:

- Required
- Roles: `RECRUITER`

Request body: `Reason body`.

Success response: `JobResponse` with `status = CLOSED`.

Errors:

| Status | Code                    | Meaning                                               |
| ------ | ----------------------- | ----------------------------------------------------- |
| 404    | `JOB.JOB_NOT_FOUND`     | Job not found.                                        |
| 409    | `JOB.CLOSE_NOT_ALLOWED` | Only `PUBLISHED` or `UNPUBLISHED` jobs can be closed. |

## Revision Endpoints

## `POST /api/v1/recruiter/jobs/:jobId/revisions`

Summary: Create a full-snapshot major revision draft for a published job with applications.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field   | Type | Required | Note              |
| ------- | ---- | -------- | ----------------- |
| `jobId` | uuid | Yes      | Published job id. |

Request body: `Job input body` plus optional `changeSummary`.

Success response: `JobRevisionResponse` with `status = DRAFT`.

Errors:

| Status | Code                         | Meaning                                                           |
| ------ | ---------------------------- | ----------------------------------------------------------------- |
| 404    | `JOB.JOB_NOT_FOUND`          | Job not found.                                                    |
| 409    | `JOB.JOB_NOT_EDITABLE`       | Revisions are only required for published jobs with applications. |
| 409    | `JOB.ACTIVE_REVISION_EXISTS` | Another active revision exists.                                   |
| 422    | `COMMON.VALIDATION_ERROR`    | Invalid body.                                                     |

## `GET /api/v1/recruiter/jobs/:jobId/revisions`

Summary: List major revision drafts/review records for a company-owned job.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field   | Type | Required | Note                  |
| ------- | ---- | -------- | --------------------- |
| `jobId` | uuid | Yes      | Company-owned job id. |

Request query:

| Field    | Type                | Required | Default | Note                                 |
| -------- | ------------------- | -------- | ------- | ------------------------------------ |
| `page`   | number              | No       | `1`     | Pagination page.                     |
| `limit`  | number              | No       | `20`    | Pagination size.                     |
| `status` | `JobRevisionStatus` | No       | all     | Filter by revision lifecycle status. |

Success response: paginated array of `JobRevisionResponse`.

Errors:

| Status | Code                | Meaning                               |
| ------ | ------------------- | ------------------------------------- |
| 403    | `COMMON.FORBIDDEN`  | User is not recruiter with company.   |
| 404    | `JOB.JOB_NOT_FOUND` | Job not found in recruiter's company. |

FE notes:

- Use this to show draft/pending/rejected major revisions under a job detail screen.
- Active revision statuses are `DRAFT`, `PENDING_REVIEW`, `NEEDS_REVIEW`, and `SHOULD_REJECT`.

## `GET /api/v1/recruiter/jobs/:jobId/revisions/:revisionId`

Summary: Get one major revision for a company-owned job.

Auth:

- Required
- Roles: `RECRUITER`

Success response: `JobRevisionResponse`.

Errors:

| Status | Code                     | Meaning                                      |
| ------ | ------------------------ | -------------------------------------------- |
| 403    | `COMMON.FORBIDDEN`       | User is not recruiter with company.          |
| 404    | `JOB.JOB_NOT_FOUND`      | Parent job not found in recruiter's company. |
| 404    | `JOB.REVISION_NOT_FOUND` | Revision not found in recruiter's company.   |

## `PATCH /api/v1/recruiter/jobs/:jobId/revisions/:revisionId`

Summary: Update a draft major revision.

Auth:

- Required
- Roles: `RECRUITER`

Request body: full `Job input body` plus optional `changeSummary`.

Success response: `JobRevisionResponse`.

Errors:

| Status | Code                        | Meaning                               |
| ------ | --------------------------- | ------------------------------------- |
| 404    | `JOB.REVISION_NOT_FOUND`    | Revision not found.                   |
| 409    | `JOB.REVISION_NOT_EDITABLE` | Only `DRAFT` revisions can be edited. |

## `POST /api/v1/recruiter/jobs/:jobId/revisions/:revisionId/submit`

Summary: Submit a major revision for moderation and admin review.

Auth:

- Required
- Roles: `RECRUITER`

Success response: `JobRevisionResponse` with `status = PENDING_REVIEW`, `NEEDS_REVIEW`, or `SHOULD_REJECT`.

Errors:

| Status | Code                        | Meaning                                  |
| ------ | --------------------------- | ---------------------------------------- |
| 403    | `JOB.COMPANY_NOT_APPROVED`  | Company is not approved anymore.         |
| 404    | `JOB.REVISION_NOT_FOUND`    | Revision not found.                      |
| 409    | `JOB.REVISION_NOT_EDITABLE` | Only `DRAFT` revisions can be submitted. |

## Admin Endpoints

## `GET /api/v1/admin/jobs`

Summary: List all jobs for admin management.

Auth:

- Required
- Roles: `ADMIN`

Request query:

| Field       | Type                                                       | Required | Default  | Note                                            |
| ----------- | ---------------------------------------------------------- | -------- | -------- | ----------------------------------------------- |
| `page`      | number                                                     | No       | `1`      | Pagination page.                                |
| `limit`     | number                                                     | No       | `20`     | Pagination size.                                |
| `status`    | `JobStatus`                                                | No       | all      | Filter by any job status.                       |
| `riskLevel` | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL`                  | No       | all      | Filter by moderation risk.                      |
| `companyId` | uuid                                                       | No       | -        | Filter by company.                              |
| `search`    | string                                                     | No       | -        | Searches title, company name, location, skills. |
| `sort`      | `latest` \| `oldest` \| `risk_desc` \| `applications_desc` | No       | `latest` | Sort table.                                     |

Success response: paginated array of `JobResponse`.

FE notes:

- Use this for admin job management/takedown table.
- Use `review-queue` only for manual moderation queue.

## `GET /api/v1/admin/jobs/overview`

Summary: Return job counts for admin dashboard overview.

Auth:

- Required
- Roles: `ADMIN`

Success response:

```json
{
  "success": true,
  "data": {
    "totalJobs": 180,
    "jobsByStatus": {
      "DRAFT": 8,
      "PENDING_REVIEW": 4,
      "NEEDS_REVIEW": 6,
      "SHOULD_REJECT": 2,
      "PUBLISHED": 120,
      "UNPUBLISHED": 10,
      "REJECTED": 12,
      "CLOSED": 15,
      "EXPIRED": 3
    },
    "jobsWaitingReview": 12,
    "publishedJobs": 120,
    "unpublishedJobs": 10,
    "closedJobs": 15,
    "totalRevisions": 20,
    "revisionsByStatus": {
      "DRAFT": 2,
      "PENDING_REVIEW": 1,
      "NEEDS_REVIEW": 2,
      "SHOULD_REJECT": 0,
      "APPROVED": 10,
      "REJECTED": 5,
      "CANCELLED": 0
    },
    "revisionsWaitingReview": 3
  }
}
```

FE notes:

- Gateway admin overview already includes this payload under `jobs`.

## `GET /api/v1/admin/jobs/growth`

Summary: Return job lifecycle and application trend chart series for admin dashboard.

Auth:

- Required
- Roles: `ADMIN`

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
        "createdJobs": 8,
        "publishedJobs": 5,
        "unpublishedJobs": 1,
        "closedJobs": 0,
        "reviewedJobs": 4,
        "rejectedJobs": 2,
        "applicationsSubmitted": 12
      }
    ]
  }
}
```

FE notes:

- `createdJobs` uses job `createdAt`.
- `publishedJobs`, `unpublishedJobs`, `closedJobs`, and `reviewedJobs` use their matching lifecycle
  timestamps.
- `rejectedJobs` counts jobs currently rejected by admin review date.
- `applicationsSubmitted` uses `job_processed_application_events.processedAt`, which is created when
  job-service consumes `application.submitted`.
- FE normally uses `GET /api/v1/admin/dashboard/jobs/growth` through gateway for the dashboard
  range summary. Use this direct service endpoint when a detailed `points[]` series is needed.

## `GET /api/v1/admin/jobs/review-queue`

Summary: List jobs waiting for manual admin review.

Auth:

- Required
- Roles: `ADMIN`

Request query:

| Field    | Type                                                  | Required | Default             | Note                         |
| -------- | ----------------------------------------------------- | -------- | ------------------- | ---------------------------- |
| `page`   | number                                                | No       | `1`                 | Pagination page.             |
| `limit`  | number                                                | No       | `20`                | Pagination size.             |
| `status` | `PENDING_REVIEW` \| `NEEDS_REVIEW` \| `SHOULD_REJECT` | No       | all review statuses | Filter queue.                |
| `search` | string                                                | No       | -                   | Searches title/company name. |

Success response: paginated array of `JobResponse`.

FE notes:

- Use `moderation.riskScore`, `riskLevel`, `reasons`, and `matchedRules` for admin decision UI.

## `POST /api/v1/admin/jobs/:id/review`

Summary: Approve or reject a job waiting for manual review.

Auth:

- Required
- Roles: `ADMIN`

Request params:

| Field | Type | Required | Note               |
| ----- | ---- | -------- | ------------------ |
| `id`  | uuid | Yes      | Reviewable job id. |

Request body: `Review body`.

Success response:

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "status": "PUBLISHED",
    "reviewedAt": "2026-07-16T10:00:00.000Z",
    "reviewReason": "Company and content verified.",
    "publishedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code                                  | Meaning                                           |
| ------ | ------------------------------------- | ------------------------------------------------- |
| 400    | `JOB.REVIEW_DECISION_REASON_REQUIRED` | Reject requires reason.                           |
| 403    | `JOB.COMPANY_NOT_APPROVED`            | Company snapshot is not approved, cannot publish. |
| 404    | `JOB.JOB_NOT_FOUND`                   | Job not found.                                    |
| 409    | `JOB.JOB_NOT_EDITABLE`                | Job is not in review queue.                       |

FE notes:

- Approval moves job to public immediately.
- Rejection keeps it out of public pages and should show `reviewReason` to recruiter/admin.

## `POST /api/v1/admin/jobs/:id/unpublish`

Summary: Admin takedown for published jobs.

Auth:

- Required
- Roles: `ADMIN`

Request body:

```json
{
  "reason": "Policy violation"
}
```

Success response: `JobResponse` with `status = UNPUBLISHED`.

Errors:

| Status | Code                                  | Meaning                                   |
| ------ | ------------------------------------- | ----------------------------------------- |
| 400    | `JOB.REVIEW_DECISION_REASON_REQUIRED` | Admin unpublish requires reason.          |
| 404    | `JOB.JOB_NOT_FOUND`                   | Job not found.                            |
| 409    | `JOB.UNPUBLISH_NOT_ALLOWED`           | Only `PUBLISHED` jobs can be unpublished. |

## `POST /api/v1/admin/jobs/:id/republish`

Summary: Admin restores an unpublished job to public pages.

Auth:

- Required
- Roles: `ADMIN`

Success response: `JobResponse` with `status = PUBLISHED`.

Errors:

| Status | Code                        | Meaning                                     |
| ------ | --------------------------- | ------------------------------------------- |
| 403    | `JOB.COMPANY_NOT_APPROVED`  | Company snapshot is not approved.           |
| 404    | `JOB.JOB_NOT_FOUND`         | Job not found.                              |
| 409    | `JOB.REPUBLISH_NOT_ALLOWED` | Only `UNPUBLISHED` jobs can be republished. |

## `POST /api/v1/admin/jobs/:id/close`

Summary: Admin permanently closes a job.

Auth:

- Required
- Roles: `ADMIN`

Request body: `Reason body`.

Success response: `JobResponse` with `status = CLOSED`.

Errors:

| Status | Code                    | Meaning                                               |
| ------ | ----------------------- | ----------------------------------------------------- |
| 404    | `JOB.JOB_NOT_FOUND`     | Job not found.                                        |
| 409    | `JOB.CLOSE_NOT_ALLOWED` | Only `PUBLISHED` or `UNPUBLISHED` jobs can be closed. |

## `GET /api/v1/admin/jobs/revision-review-queue`

Summary: List major revisions waiting for manual review.

Auth:

- Required
- Roles: `ADMIN`

Request query:

| Field    | Type                                                  | Required | Default             | Note                                                |
| -------- | ----------------------------------------------------- | -------- | ------------------- | --------------------------------------------------- |
| `page`   | number                                                | No       | `1`                 | Pagination page.                                    |
| `limit`  | number                                                | No       | `20`                | Pagination size.                                    |
| `status` | `PENDING_REVIEW` \| `NEEDS_REVIEW` \| `SHOULD_REJECT` | No       | all review statuses | Filter queue.                                       |
| `search` | string                                                | No       | -                   | Searches title, change summary, company id, job id. |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "66666666-6666-6666-6666-666666666666",
      "jobId": "33333333-3333-3333-3333-333333333333",
      "status": "NEEDS_REVIEW",
      "title": "Senior Backend Developer",
      "skills": ["NestJS", "PostgreSQL", "Kafka"],
      "changeSummary": "Update role scope and salary.",
      "moderation": {
        "riskScore": 35,
        "riskLevel": "MEDIUM",
        "decision": "NEEDS_REVIEW",
        "reasons": ["Salary is unusually high for JUNIOR level"],
        "matchedRules": ["ABNORMAL_SALARY_BY_EXPERIENCE_LEVEL"]
      },
      "reviewedAt": null,
      "reviewReason": null,
      "createdAt": "2026-07-16T09:00:00.000Z",
      "updatedAt": "2026-07-16T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## `POST /api/v1/admin/jobs/revisions/:revisionId/review`

Summary: Approve or reject a major job revision.

Auth:

- Required
- Roles: `ADMIN`

Request body: `Review body`.

Success response: `JobRevisionResponse`.

Rules:

- Approve applies revision snapshot to the job and increments `job.version`.
- Reject leaves the current public job unchanged.

Errors:

| Status | Code                                  | Meaning                                                  |
| ------ | ------------------------------------- | -------------------------------------------------------- |
| 400    | `JOB.REVIEW_DECISION_REASON_REQUIRED` | Reject requires reason.                                  |
| 403    | `JOB.COMPANY_NOT_APPROVED`            | Company snapshot is not approved, cannot apply revision. |
| 404    | `JOB.REVISION_NOT_FOUND`              | Revision not found.                                      |
| 409    | `JOB.REVISION_NOT_EDITABLE`           | Revision is not waiting for review.                      |

## Internal Endpoints

## `GET /api/v1/internal/jobs/:id/application-snapshot`

Summary: Get job/company snapshot and applyability for application-service before creating an application.

Auth:

- Required
- Internal service token: `x-internal-service-token`

Success response:

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "companyName": "NexHire",
    "companyLogoUrl": "https://cdn.nexhire.vn/company/nexhire.png",
    "title": "Backend Developer",
    "status": "PUBLISHED",
    "deadline": "2026-09-30T17:00:00.000Z",
    "isApplyable": true
  }
}
```

## `GET /api/v1/internal/jobs/:id/saved-snapshot`

Summary: Get a lightweight job card snapshot for candidate-service saved jobs.

Auth:

- Required
- Internal service token: `x-internal-service-token`

Success response:

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "companyName": "NexHire",
    "companyLogoUrl": "https://cdn.nexhire.vn/company/nexhire.png",
    "title": "Backend Developer",
    "status": "PUBLISHED",
    "experienceLevel": "JUNIOR",
    "location": "Ha Noi",
    "salaryMin": 15000000,
    "salaryMax": 25000000,
    "salaryCurrency": "VND",
    "isSalaryVisible": true,
    "deadline": "2026-09-30T17:00:00.000Z",
    "publishedAt": "2026-07-15T10:00:00.000Z",
    "isPublic": true
  }
}
```

## Events

### Consumed: `company.posting-snapshot-changed`

Job-service updates company snapshots on jobs. If company becomes non-approved, published/reviewing jobs and pending revisions move to `SHOULD_REJECT` and are hidden from public pages.

### Consumed: `application.submitted`

Job-service increments `jobs.applicationCount`, which protects published jobs from direct major edits after candidates have applied.

### Published: `job.published`

Published after admin approves a job.

### Published: `job.revision-approved`

Published after admin approves a major revision.

### Published: `job.unpublished`

Published after recruiter/admin hides a job.

### Published: `job.closed`

Published after recruiter/admin closes a job.

### Published: `job.review-trust-signal`

Published after admin reviews a job or revision so company-service can update trust counters.
