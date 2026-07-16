# Company Service API Docs

Base path through gateway:

- `/api/v1/companies`
- `/api/v1/hr-accounts`

Responsibility: company profile and HR accounts.

Company-service is the source of truth for recruiter company ownership and posting eligibility. It publishes `company.posting-snapshot-changed` whenever a company is created, approved, rejected, suspended, restored to pending, renamed, changes logo, or changes trust level.

`trustLevel` is internal/admin-only. Candidate/public and recruiter self-service responses must not expose it. Admin responses and internal posting snapshots can include it.

Auto trust adjustment:

- Job-service publishes `job.review-trust-signal` after admin reviews a job or major revision.
- Approved jobs/revisions with `LOW` moderation risk count as positive signals.
- Rejected jobs/revisions count as negative signals.
- Approved jobs/revisions with `MEDIUM`, `HIGH`, or `CRITICAL` moderation risk are neutral because the admin decision is the final review outcome.
- 5 positive signals increase trust by one level: `LOW -> MEDIUM -> HIGH`.
- 3 negative signals decrease trust by one level: `HIGH -> MEDIUM -> LOW`.
- Manual admin trust updates reset the counters.
- Every trust level change is stored in trust history with previous level, new level, direction, source, reason, metadata, and timestamp.

## Endpoints

### `POST /companies`

**Auth**: Recruiter

**Purpose**: Create a new company profile. A recruiter can only own one company.

**Body**: `CreateCompanyDto`

```json
{
  "name": "NexHire Tech",
  "logo": "https://example.com/logo.png",
  "description": "Tech company focusing on AI...",
  "website": "https://nexhire.com",
  "address": "123 Tech Street, HCMC",
  "taxCode": "0101234567"
}
```

**Success response**:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "NexHire Tech",
    "logo": "https://example.com/logo.png",
    "description": "Tech company focusing on AI...",
    "website": "https://nexhire.com",
    "address": "123 Tech Street, HCMC",
    "taxCode": "0101234567",
    "ownerId": "uuid",
    "status": "PENDING",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error codes**:

- `401 Unauthorized`
- `403 Forbidden`
- `409 Conflict`: `COMPANY.ALREADY_EXISTS`, `COMPANY.TAX_CODE_IN_USE`
- `422 Unprocessable Entity`

---

### `GET /companies/me`

**Auth**: Recruiter

**Purpose**: Get the current recruiter's company profile.

**Success response**: `CompanyResponseDto` inside the standard success envelope.

**Error codes**:

- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`: `COMPANY.NOT_FOUND`

---

### `PUT /companies/:id`

**Auth**: Recruiter

**Purpose**: Update the company profile. The requester must own the company. Updating `taxCode` or `name` resets status to `PENDING`.

**Params**:

- `id` (UUID, required)

**Body**: `UpdateCompanyDto`

**Success response**: `CompanyResponseDto` inside the standard success envelope.

**Error codes**:

- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`: `COMPANY.NOT_FOUND`
- `409 Conflict`: `COMPANY.TAX_CODE_IN_USE`
- `422 Unprocessable Entity`

---

### `GET /companies/admin/pending`

**Auth**: Admin

**Purpose**: List pending companies for verification.

**Success response**: Array of `CompanyResponseDto` inside the standard success envelope.

**Error codes**:

- `401 Unauthorized`
- `403 Forbidden`

---

### `PATCH /companies/:id/verify`

**Auth**: Admin

**Purpose**: Approve or reject a company.

**Params**:

- `id` (UUID, required)

**Body**: `VerifyCompanyDto`

```json
{
  "action": "APPROVE"
}
```

`action` must be one of `APPROVE` or `REJECT`.

**Success response**: `CompanyResponseDto` inside the standard success envelope.

**Error codes**:

- `400 Bad Request`: `COMPANY.INVALID_VERIFY_ACTION`
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`: `COMPANY.NOT_FOUND`
- `422 Unprocessable Entity`

---

### `PATCH /companies/admin/:id/suspend`

**Auth**: Admin

**Purpose**: Suspend a company. Job-service consumes the snapshot event and removes affected jobs from public posting/review eligibility.

**Body**:

```json
{
  "reason": "Policy violation"
}
```

**Success response**: admin company response, including `trustLevel`, `approvedLowRiskCount`, and `negativeTrustSignalCount`.

---

### `PATCH /companies/admin/:id/restore`

**Auth**: Admin

**Purpose**: Restore a rejected/suspended company to `PENDING` for another manual review.

**Success response**: admin company response, including trust counters.

---

### `PATCH /companies/admin/:id/trust-level`

**Auth**: Admin

**Purpose**: Update company trust level used by job moderation.

```json
{
  "trustLevel": "HIGH",
  "reason": "Company has consistently submitted verified low-risk jobs"
}
```

Allowed values: `LOW`, `MEDIUM`, `HIGH`.

**Success response**: admin company response, including trust counters.

---

### `GET /companies/admin/:id/trust-history`

**Auth**: Admin

**Purpose**: View trust level change history. This is admin-only and must not be shown to candidates.

**Success response**:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "companyId": "uuid",
      "previousTrustLevel": "MEDIUM",
      "newTrustLevel": "HIGH",
      "direction": "INCREASE",
      "source": "MANUAL",
      "changedByUserId": "admin-user-id",
      "reason": "Company has consistently submitted verified low-risk jobs",
      "metadata": {},
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

`source = AUTO` entries include metadata from the job review signal, such as `jobId`, `targetId`, `decision`, `riskLevel`, `riskScore`, and threshold values.

---

### `GET /companies/public/:id`

**Auth**: Public

**Purpose**: Get an approved company's public profile.

**Params**:

- `id` (UUID, required)

**Success response**:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "NexHire Tech",
    "logo": "https://example.com/logo.png",
    "description": "Tech company focusing on AI...",
    "website": "https://nexhire.com",
    "address": "123 Tech Street, HCMC"
  }
}
```

**Error codes**:

- `404 Not Found`: `COMPANY.NOT_FOUND`

## Internal endpoints

### `GET /api/v1/internal/companies/:id/posting-snapshot`

Internal only.

Summary: Return company ownership and posting snapshot for job-service/auth-service repair flows.

Auth:

- Internal service token header: `x-internal-service-token`

Success response:

```json
{
  "success": true,
  "data": {
    "companyId": "uuid",
    "ownerUserId": "uuid",
    "companyName": "NexHire Tech",
    "companyLogoUrl": "https://example.com/logo.png",
    "companyStatus": "APPROVED",
    "companyTrustLevel": "MEDIUM",
    "changedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

## Published events

### `company.posting-snapshot-changed`

```json
{
  "companyId": "uuid",
  "ownerUserId": "uuid",
  "companyName": "NexHire Tech",
  "companyLogoUrl": "https://example.com/logo.png",
  "companyStatus": "APPROVED",
  "previousCompanyStatus": "PENDING",
  "companyTrustLevel": "MEDIUM",
  "changedAt": "2026-01-01T00:00:00.000Z"
}
```

Consumers:

- auth-service: syncs recruiter owner -> companyId link for JWT `companyId`.
- job-service: syncs job company snapshots; non-approved/suspended companies make affected jobs non-public/review blocked.
- notification-service: sends in-app notification to the company owner.

`previousCompanyStatus` is optional and only included when company-service knows the previous
status. Notification-service uses it to avoid duplicate status notifications for snapshot-only
updates such as rename, logo, or trust changes.

## Consumed events

### `job.review-trust-signal`

```json
{
  "companyId": "uuid",
  "jobId": "uuid",
  "targetType": "JOB",
  "targetId": "uuid",
  "decision": "APPROVE",
  "riskLevel": "LOW",
  "riskScore": 10,
  "reviewedAt": "2026-01-01T00:00:00.000Z"
}
```

Used only for internal trust automation. Company-service deduplicates this event by
`targetType + targetId`, so RabbitMQ redelivery does not increase/decrease trust counters twice
for the same reviewed job or revision.
