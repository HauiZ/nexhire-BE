# Company Service API Docs

Base path through gateway:

- `/api/v1/companies`
- `/api/v1/hr-accounts`

Responsibility: company profile, company verification, posting eligibility snapshot, and company trust level for job moderation.

Company-service is the source of truth for:

- recruiter company ownership
- company verification status
- whether a company can post jobs
- internal trust level used by job moderation

`trustLevel` is internal/admin-only. Candidate/public and recruiter self-service responses must not expose it. Admin responses and internal posting snapshots can include it.

## Enums

```ts
type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
type CompanyTrustLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type VerifyAction = 'APPROVE' | 'REJECT';
type CompanyTrustChangeDirection = 'INCREASE' | 'DECREASE';
type CompanyTrustChangeSource = 'MANUAL' | 'AUTO';
```

## Response Objects

### CompanyResponse

Used by recruiter self-service endpoints. Does not expose trust level.

| Field | Type | Nullable | Note |
| --- | --- | --- | --- |
| `id` | uuid | No | Company id. |
| `name` | string | No | Company display name. |
| `logo` | string | Yes | Legacy/manual logo URL fallback. |
| `logoDocumentId` | uuid | Yes | Logo document id uploaded through document-storage. FE should prefer this when rendering the logo. |
| `description` | string | Yes | Company description. |
| `website` | string | Yes | Website URL. |
| `address` | string | Yes | Company address. |
| `taxCode` | string | No | Company tax code. |
| `ownerId` | uuid | No | Recruiter user id that owns company. |
| `status` | `CompanyStatus` | No | Verification/posting status. |
| `createdAt` | ISO date-time | No | Created timestamp. |
| `updatedAt` | ISO date-time | No | Updated timestamp. |

Example:

```json
{
  "id": "22222222-2222-2222-2222-222222222222",
  "name": "NexHire Tech",
  "logo": "https://cdn.nexhire.vn/company/logo.png",
  "logoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
  "description": "Tech company focusing on recruitment products.",
  "website": "https://nexhire.vn",
  "address": "Ha Noi, Viet Nam",
  "taxCode": "0101234567",
  "ownerId": "11111111-1111-1111-1111-111111111111",
  "status": "PENDING",
  "createdAt": "2026-07-16T09:00:00.000Z",
  "updatedAt": "2026-07-16T09:00:00.000Z"
}
```

### AdminCompanyResponse

Used by admin endpoints. Extends `CompanyResponse`.

| Field | Type | Nullable | Note |
| --- | --- | --- | --- |
| `trustLevel` | `CompanyTrustLevel` | No | Internal only. |
| `approvedLowRiskCount` | number | No | Auto trust positive counter. |
| `negativeTrustSignalCount` | number | No | Auto trust negative counter. |

### PublicCompanyProfile

Used by public company profile endpoint.

| Field | Type | Nullable | Note |
| --- | --- | --- | --- |
| `id` | uuid | No | Company id. |
| `name` | string | No | Company display name. |
| `logo` | string | Yes | Legacy/manual logo URL fallback. |
| `logoDocumentId` | uuid | Yes | Logo document id uploaded through document-storage. |
| `description` | string | Yes | Public company description. |
| `website` | string | Yes | Website URL. |
| `address` | string | Yes | Public address. |

Does not include: `taxCode`, `ownerId`, `status`, `trustLevel`, counters.

### TrustHistoryResponse

| Field | Type | Nullable | Note |
| --- | --- | --- | --- |
| `id` | uuid | No | History row id. |
| `companyId` | uuid | No | Company id. |
| `previousTrustLevel` | `CompanyTrustLevel` | No | Old level. |
| `newTrustLevel` | `CompanyTrustLevel` | No | New level. |
| `direction` | `INCREASE` \| `DECREASE` | No | Change direction. |
| `source` | `MANUAL` \| `AUTO` | No | Manual admin or auto trust signal. |
| `changedByUserId` | uuid | Yes | Admin id for manual change, null for auto. |
| `reason` | string | No | Reason shown to admin. |
| `metadata` | object | No | Auto signal metadata if any. |
| `createdAt` | ISO date-time | No | Change timestamp. |

## Request Objects

### CreateCompany body

| Field | Type | Required | Nullable | Note |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | No | 2..255 chars. |
| `logo` | URL string | No | Yes | Company logo URL. |
| `description` | string | No | Yes | Company description. |
| `website` | URL string | No | Yes | Company website. |
| `address` | string | No | Yes | Company address. |
| `taxCode` | string | Yes | No | 10..50 chars, trimmed. Must be unique. |

```json
{
  "name": "NexHire Tech",
  "logo": "https://cdn.nexhire.vn/company/logo.png",
  "description": "Tech company focusing on recruitment products.",
  "website": "https://nexhire.vn",
  "address": "Ha Noi, Viet Nam",
  "taxCode": "0101234567"
}
```

### UpdateCompany body

All fields are optional, same validation as create body.

```json
{
  "name": "NexHire Technology",
  "logo": "https://cdn.nexhire.vn/company/new-logo.png",
  "description": "Updated company profile.",
  "website": "https://nexhire.vn",
  "address": "Ho Chi Minh City, Viet Nam",
  "taxCode": "0107654321"
}
```

### VerifyCompany body

| Field | Type | Required | Nullable | Note |
| --- | --- | --- | --- | --- |
| `action` | `APPROVE` \| `REJECT` | Yes | No | Admin verification decision. |

```json
{
  "action": "APPROVE"
}
```

### Admin reason body

| Field | Type | Required | Nullable | Note |
| --- | --- | --- | --- | --- |
| `reason` | string | No | Yes | Max 500 chars. |

```json
{
  "reason": "Policy violation"
}
```

### Update trust level body

| Field | Type | Required | Nullable | Note |
| --- | --- | --- | --- | --- |
| `trustLevel` | `LOW` \| `MEDIUM` \| `HIGH` | Yes | No | New internal trust level. |
| `reason` | string | Yes | No | Required admin reason, max 500 chars. |

```json
{
  "trustLevel": "HIGH",
  "reason": "Company has consistently submitted verified low-risk jobs"
}
```

## Recruiter Endpoints

## `POST /api/v1/companies`

Summary: Create a new company profile for current recruiter.

Auth:
- Required
- Roles: `RECRUITER`

Headers:

| Header | Required | Note |
| --- | --- | --- |
| `Authorization: Bearer <accessToken>` | Yes | Recruiter access token. |

Request body: `CreateCompany body`.

Success response:

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
    "description": "Tech company focusing on recruitment products.",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam",
    "taxCode": "0101234567",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "status": "PENDING",
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T09:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not recruiter. |
| 409 | `COMPANY.ALREADY_EXISTS` | Recruiter already owns a company. |
| 409 | `COMPANY.TAX_CODE_IN_USE` | Tax code is already used. |
| 422 | `COMMON.VALIDATION_ERROR` | Invalid body. |

FE notes:
- After create, company is `PENDING`. Recruiter cannot post jobs until admin approves.
- Do not show trust level in recruiter UI.

## `GET /api/v1/companies/me`

Summary: Get current recruiter's company profile.

Auth:
- Required
- Roles: `RECRUITER`

Success response:

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logo": "https://cdn.nexhire.vn/company/logo.png",
    "description": "Tech company focusing on recruitment products.",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam",
    "taxCode": "0101234567",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "status": "APPROVED",
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not recruiter. |
| 404 | `COMPANY.NOT_FOUND` | Recruiter has no company profile. |

FE notes:
- Use `status` to show `Pending approval`, `Approved`, `Rejected`, or `Suspended` company state.

## `PUT /api/v1/companies/:id`

Summary: Update company profile owned by current recruiter.

Auth:
- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `id` | uuid | Yes | Company id. |

Request body: `UpdateCompany body`.

Success response: `CompanyResponse`.

Rules:
- Updating `name` or `taxCode` resets company status to `PENDING`.
- Company-service publishes `company.posting-snapshot-changed` after profile/status changes.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not the company owner. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |
| 409 | `COMPANY.TAX_CODE_IN_USE` | Tax code is already used. |
| 422 | `COMMON.VALIDATION_ERROR` | Invalid body. |

FE notes:
- Warn recruiter that changing legal identity fields may require re-approval.

## `PATCH /api/v1/companies/:id/logo`

Summary: Upload and set company logo through document-storage.

Auth:
- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `id` | uuid | Yes | Company id owned by current recruiter. |

Request body: `multipart/form-data`

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `file` | binary | Yes | `image/jpeg`, `image/png`, or `image/webp`, max 5MB. |

Success response: `CompanyResponse`.

Example response:

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logo": "https://cdn.nexhire.vn/company/logo.png",
    "logoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
    "description": "Tech company focusing on recruitment products.",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam",
    "taxCode": "0101234567",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "status": "APPROVED",
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T09:10:00.000Z"
  }
}
```

Rules:
- Company-service stores `logoDocumentId` as source of truth.
- Uploading a document logo clears `logo` so legacy/manual URL fallback cannot point at an old image.
- Company-service publishes `company.posting-snapshot-changed` so job/auth snapshots can sync `companyLogoDocumentId`.
- Uploading logo does not reset company verification status.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `DOCUMENT.FILE_REQUIRED` | Missing file. |
| 400 | `DOCUMENT.UNSUPPORTED_FILE_TYPE` | File is not jpeg/png/webp. |
| 400 | `DOCUMENT.FILE_TOO_LARGE` | File exceeds max size. |
| 403 | `COMMON.FORBIDDEN` | User is not the company owner. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |
| 503 | `AI.SERVICE_UNAVAILABLE` | document-storage upload failed. |

## Admin Endpoints

## `GET /api/v1/companies/admin/pending`

Summary: List pending companies for verification.

Auth:
- Required
- Roles: `ADMIN`

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "name": "NexHire Tech",
      "logo": "https://cdn.nexhire.vn/company/logo.png",
      "description": "Tech company focusing on recruitment products.",
      "website": "https://nexhire.vn",
      "address": "Ha Noi, Viet Nam",
      "taxCode": "0101234567",
      "ownerId": "11111111-1111-1111-1111-111111111111",
      "status": "PENDING",
      "trustLevel": "MEDIUM",
      "approvedLowRiskCount": 0,
      "negativeTrustSignalCount": 0,
      "createdAt": "2026-07-16T09:00:00.000Z",
      "updatedAt": "2026-07-16T09:00:00.000Z"
    }
  ]
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not admin. |

FE notes:
- This is currently pending-only, not a full admin company search endpoint.

## `PATCH /api/v1/companies/:id/verify`

Summary: Approve or reject a company.

Auth:
- Required
- Roles: `ADMIN`

Request params:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `id` | uuid | Yes | Company id. |

Request body: `VerifyCompany body`.

Success response:

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logo": "https://cdn.nexhire.vn/company/logo.png",
    "description": "Tech company focusing on recruitment products.",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam",
    "taxCode": "0101234567",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "status": "APPROVED",
    "trustLevel": "MEDIUM",
    "approvedLowRiskCount": 0,
    "negativeTrustSignalCount": 0,
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `COMPANY.INVALID_VERIFY_ACTION` | Action is not `APPROVE` or `REJECT`. |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not admin. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |
| 422 | `COMMON.VALIDATION_ERROR` | Invalid body. |

FE notes:
- `APPROVED` companies can post jobs.
- `REJECTED` companies cannot post jobs.

## `PATCH /api/v1/companies/admin/:id/suspend`

Summary: Suspend a company and disable posting eligibility.

Auth:
- Required
- Roles: `ADMIN`

Request body: `Admin reason body`.

Success response: `AdminCompanyResponse` with `status = SUSPENDED`.

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logo": "https://cdn.nexhire.vn/company/logo.png",
    "description": "Tech company focusing on recruitment products.",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam",
    "taxCode": "0101234567",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "status": "SUSPENDED",
    "trustLevel": "MEDIUM",
    "approvedLowRiskCount": 0,
    "negativeTrustSignalCount": 0,
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not admin. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |
| 422 | `COMMON.VALIDATION_ERROR` | Invalid body. |

FE notes:
- Job-service consumes the snapshot event and hides/marks affected jobs as not reviewable/public.

## `PATCH /api/v1/companies/admin/:id/restore`

Summary: Restore a rejected/suspended company to `PENDING` for another manual review.

Auth:
- Required
- Roles: `ADMIN`

Request body: `Admin reason body`.

Success response: `AdminCompanyResponse` with `status = PENDING`.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not admin. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |

FE notes:
- Restored company still cannot post jobs until admin verifies it as `APPROVED`.

## `PATCH /api/v1/companies/admin/:id/trust-level`

Summary: Manually update internal company trust level used by job moderation.

Auth:
- Required
- Roles: `ADMIN`

Request body: `Update trust level body`.

Success response: `AdminCompanyResponse`.

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logo": "https://cdn.nexhire.vn/company/logo.png",
    "description": "Tech company focusing on recruitment products.",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam",
    "taxCode": "0101234567",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "status": "APPROVED",
    "trustLevel": "HIGH",
    "approvedLowRiskCount": 0,
    "negativeTrustSignalCount": 0,
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not admin. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |
| 422 | `COMMON.VALIDATION_ERROR` | Invalid/missing `trustLevel` or `reason`. |

FE notes:
- Reason is required and should be shown in trust history.
- Manual trust update resets trust counters.
- Do not show trust level to candidate/public UI.

## `GET /api/v1/companies/admin/:id/trust-history`

Summary: View trust level change history.

Auth:
- Required
- Roles: `ADMIN`

Request params:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `id` | uuid | Yes | Company id. |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "77777777-7777-7777-7777-777777777777",
      "companyId": "22222222-2222-2222-2222-222222222222",
      "previousTrustLevel": "MEDIUM",
      "newTrustLevel": "HIGH",
      "direction": "INCREASE",
      "source": "MANUAL",
      "changedByUserId": "99999999-9999-9999-9999-999999999999",
      "reason": "Company has consistently submitted verified low-risk jobs",
      "metadata": {},
      "createdAt": "2026-07-16T10:00:00.000Z"
    }
  ]
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403 | `COMMON.FORBIDDEN` | User is not admin. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |

## Public Endpoints

## `GET /api/v1/companies/public/:id`

Summary: Get public profile for an approved company.

Auth:
- Public

Request params:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `id` | uuid | Yes | Company id. |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logo": "https://cdn.nexhire.vn/company/logo.png",
    "description": "Tech company focusing on recruitment products.",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `COMMON.VALIDATION_ERROR` | Invalid UUID. |
| 404 | `COMPANY.NOT_FOUND` | Company not found or not approved. |

FE notes:
- Only approved companies are public.
- Do not expect `status`, `taxCode`, `ownerId`, or `trustLevel`.

## Internal Endpoints

## `GET /api/v1/internal/companies/:id/posting-snapshot`

Summary: Return company ownership and posting eligibility snapshot for job-service/auth-service repair flows.

Auth:
- Required
- Internal service token: `x-internal-service-token`

Request params:

| Field | Type | Required | Note |
| --- | --- | --- | --- |
| `id` | uuid | Yes | Company id. |

Success response:

```json
{
  "success": true,
  "data": {
    "companyId": "22222222-2222-2222-2222-222222222222",
    "ownerUserId": "11111111-1111-1111-1111-111111111111",
    "companyName": "NexHire Tech",
    "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
    "companyLogoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
    "companyStatus": "APPROVED",
    "companyTrustLevel": "MEDIUM",
    "changedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `COMMON.UNAUTHORIZED` | Missing/invalid internal token. |
| 403 | `COMMON.FORBIDDEN` | Caller is not internal. |
| 404 | `COMPANY.NOT_FOUND` | Company not found. |

## Auto Trust Adjustment

Job-service publishes `job.review-trust-signal` after admin reviews a job or major revision.

Rules:

- Positive signal: `decision = APPROVE` and `riskLevel = LOW`.
- Negative signal: `decision = REJECT`.
- Approved `MEDIUM`, `HIGH`, or `CRITICAL` risk jobs are neutral because admin manually accepted them.
- 5 positive signals increase trust by one level: `LOW -> MEDIUM -> HIGH`.
- 3 negative signals decrease trust by one level: `HIGH -> MEDIUM -> LOW`.
- Manual admin trust updates reset counters.
- Duplicate event delivery is deduplicated by `targetType + targetId`.

## Published Events

### `company.posting-snapshot-changed`

Published whenever posting eligibility or visible company snapshot changes:

- company created
- company approved/rejected/suspended/restored
- company name/logo changed
- company trust level changed

Payload:

```json
{
  "companyId": "22222222-2222-2222-2222-222222222222",
  "ownerUserId": "11111111-1111-1111-1111-111111111111",
  "companyName": "NexHire Tech",
  "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
  "companyLogoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
  "companyStatus": "APPROVED",
  "previousCompanyStatus": "PENDING",
  "companyTrustLevel": "MEDIUM",
  "changedAt": "2026-07-16T10:00:00.000Z"
}
```

Consumers:

- auth-service: syncs recruiter owner -> company id link for JWT `companyId`.
- job-service: syncs job company snapshots and hides/blocks jobs if company is non-approved.
- notification-service: sends in-app notification to company owner when status changes.

`companyLogoDocumentId` is the preferred logo source for new UI. `companyLogoUrl` remains a legacy/manual URL fallback.

`previousCompanyStatus` is optional and only included when company-service knows the previous status. Notification-service uses it to avoid duplicate status notifications for snapshot-only updates such as rename, logo, or trust changes.

## Consumed Events

### `job.review-trust-signal`

Payload:

```json
{
  "companyId": "22222222-2222-2222-2222-222222222222",
  "jobId": "33333333-3333-3333-3333-333333333333",
  "targetType": "JOB",
  "targetId": "33333333-3333-3333-3333-333333333333",
  "decision": "APPROVE",
  "riskLevel": "LOW",
  "riskScore": 10,
  "reviewedAt": "2026-07-16T10:00:00.000Z"
}
```

Used only for internal trust automation.
