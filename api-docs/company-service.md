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

| Field                                 | Type            | Nullable | Note                                                                                                            |
| ------------------------------------- | --------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                                  | uuid            | No       | Company id.                                                                                                     |
| `name`                                | string          | No       | Company display name.                                                                                           |
| `logo`                                | string          | Yes      | Legacy/manual logo URL fallback.                                                                                |
| `logoUrl`                             | string          | Yes      | Resolved render URL for company logo. FE should prefer this when present.                                       |
| `logoDocumentId`                      | uuid            | Yes      | Logo document id uploaded through document-storage. FE should prefer this when rendering the logo.              |
| `description`                         | string          | Yes      | Company description.                                                                                            |
| `industry`                            | string          | Yes      | Public industry/field label.                                                                                    |
| `size`                                | string          | Yes      | Public employee range label, for example `100-500`.                                                             |
| `foundedYear`                         | number          | Yes      | Public founded year.                                                                                            |
| `mission`                             | string          | Yes      | Public mission/building statement.                                                                              |
| `culture`                             | string          | Yes      | Public work culture description.                                                                                |
| `values`                              | string[]        | No       | Public company/team values. Empty array when unset.                                                             |
| `perks`                               | string[]        | No       | Public benefits/perks. Empty array when unset.                                                                  |
| `heroImageUrl`                        | string          | Yes      | Legacy/manual hero image URL fallback.                                                                          |
| `heroImageDocumentId`                 | uuid            | Yes      | Hero image document id uploaded through document-storage. FE should prefer this when rendering the cover image. |
| `website`                             | string          | Yes      | Website URL.                                                                                                    |
| `contactEmail`                        | string          | Yes      | Public company contact email. This is separate from recruiter login email.                                      |
| `contactPhone`                        | string          | Yes      | Public company contact phone. This is separate from recruiter account phone.                                    |
| `address`                             | string          | Yes      | Company address.                                                                                                |
| `taxCode`                             | string          | No       | Company tax code.                                                                                               |
| `ownerId`                             | uuid            | No       | Recruiter user id that owns company.                                                                            |
| `status`                              | `CompanyStatus` | No       | Verification/posting status.                                                                                    |
| `canPostJobs`                         | boolean         | No       | True only when company is approved.                                                                             |
| `completionPercent`                   | number          | No       | Completion percent for recruiter verification UI.                                                               |
| `missingRequiredFields`               | string[]        | No       | Required profile fields still missing.                                                                          |
| `submittedAt`                         | ISO date-time   | Yes      | Initial submission timestamp for recruiter dashboard.                                                           |
| `rejectionReason`                     | string          | Yes      | Present when `status = REJECTED`.                                                                               |
| `statusReason`                        | string          | Yes      | Latest admin status-change reason.                                                                              |
| `statusChangedAt`                     | ISO date-time   | Yes      | Latest status-change timestamp.                                                                                 |
| `statusChangedByUserId`               | uuid            | Yes      | Admin/user id that changed status, when available.                                                              |
| `verificationRejectedCount`           | number          | No       | Number of times admin rejected company verification. Kept when company is requested for review again.           |
| `lastVerificationRejectedReason`      | string          | Yes      | Latest admin rejection reason, even if current status is back to `PENDING`.                                     |
| `lastVerificationRejectedAt`          | ISO date-time   | Yes      | Latest admin rejection timestamp.                                                                               |
| `verificationReviewRequestedAt`       | ISO date-time   | Yes      | When recruiter requested admin review again after rejection.                                                    |
| `verificationReviewRequestedByUserId` | uuid            | Yes      | Recruiter user id that requested review again.                                                                  |
| `createdAt`                           | ISO date-time   | No       | Created timestamp.                                                                                              |
| `updatedAt`                           | ISO date-time   | No       | Updated timestamp.                                                                                              |

Example:

```json
{
  "id": "22222222-2222-2222-2222-222222222222",
  "name": "NexHire Tech",
  "logo": "https://cdn.nexhire.vn/company/logo.png",
  "logoUrl": "https://storage.local/presigned-company-logo-url",
  "logoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
  "description": "Tech company focusing on recruitment products.",
  "industry": "HR Tech",
  "size": "100-500",
  "foundedYear": 2018,
  "mission": "Build reliable recruitment automation for modern teams.",
  "culture": "Small teams, clear goals, and product-minded engineering.",
  "values": ["Clear ownership", "Candidate empathy"],
  "perks": ["Flexible schedule", "Learning budget"],
  "heroImageDocumentId": "2b1d8260-58f9-4a5f-95e3-c2e7efae5c6a",
  "website": "https://nexhire.vn",
  "contactEmail": "hr@nexhire.vn",
  "contactPhone": "02473001234",
  "address": "Ha Noi, Viet Nam",
  "taxCode": "0101234567",
  "ownerId": "11111111-1111-1111-1111-111111111111",
  "status": "PENDING",
  "canPostJobs": false,
  "completionPercent": 100,
  "missingRequiredFields": [],
  "submittedAt": "2026-07-16T09:00:00.000Z",
  "rejectionReason": null,
  "statusReason": null,
  "statusChangedAt": null,
  "statusChangedByUserId": null,
  "verificationRejectedCount": 1,
  "lastVerificationRejectedReason": "Business license is missing or unreadable",
  "lastVerificationRejectedAt": "2026-07-16T10:00:00.000Z",
  "verificationReviewRequestedAt": "2026-07-16T11:00:00.000Z",
  "verificationReviewRequestedByUserId": "11111111-1111-1111-1111-111111111111",
  "createdAt": "2026-07-16T09:00:00.000Z",
  "updatedAt": "2026-07-16T09:00:00.000Z"
}
```

### AdminCompanyResponse

Used by admin endpoints. Extends `CompanyResponse`.

| Field                      | Type                | Nullable | Note                         |
| -------------------------- | ------------------- | -------- | ---------------------------- |
| `trustLevel`               | `CompanyTrustLevel` | No       | Internal only.               |
| `approvedLowRiskCount`     | number              | No       | Auto trust positive counter. |
| `negativeTrustSignalCount` | number              | No       | Auto trust negative counter. |

### PublicCompanyProfile

Used by public company profile endpoint.

| Field                 | Type     | Nullable | Note                                                        |
| --------------------- | -------- | -------- | ----------------------------------------------------------- |
| `id`                  | uuid     | No       | Company id.                                                 |
| `name`                | string   | No       | Company display name.                                       |
| `logo`                | string   | Yes      | Legacy/manual logo URL fallback.                            |
| `logoUrl`             | string   | Yes      | Resolved render URL for company logo.                       |
| `logoDocumentId`      | uuid     | Yes      | Logo document id uploaded through document-storage.         |
| `description`         | string   | Yes      | Public company description.                                 |
| `industry`            | string   | Yes      | Public industry/field label.                                |
| `size`                | string   | Yes      | Public employee range label.                                |
| `foundedYear`         | number   | Yes      | Public founded year.                                        |
| `mission`             | string   | Yes      | Public mission/building statement.                          |
| `culture`             | string   | Yes      | Public work culture description.                            |
| `values`              | string[] | No       | Public company/team values. Empty array when unset.         |
| `perks`               | string[] | No       | Public benefits/perks. Empty array when unset.              |
| `heroImageUrl`        | string   | Yes      | Legacy/manual hero image URL fallback.                      |
| `heroImageDocumentId` | uuid     | Yes      | Hero image document id uploaded through document-storage.   |
| `website`             | string   | Yes      | Website URL.                                                |
| `contactEmail`        | string   | Yes      | Public company contact email, if company has configured it. |
| `contactPhone`        | string   | Yes      | Public company contact phone, if company has configured it. |
| `address`             | string   | Yes      | Public address.                                             |

Does not include: `taxCode`, `ownerId`, `status`, `trustLevel`, counters.

### CompanyVerificationDocumentResponse

Used by recruiter company verification document endpoints.

| Field              | Type                                                                 | Nullable | Note                          |
| ------------------ | -------------------------------------------------------------------- | -------- | ----------------------------- |
| `id`               | uuid                                                                 | No       | Attachment row id.            |
| `companyId`        | uuid                                                                 | No       | Company id.                   |
| `documentId`       | uuid                                                                 | No       | Uploaded document-storage id. |
| `type`             | `BUSINESS_LICENSE` \| `TAX_CERTIFICATE` \| `DOMAIN_PROOF` \| `OTHER` | No       | Proof category.               |
| `uploadedByUserId` | uuid                                                                 | No       | Recruiter user id.            |
| `createdAt`        | ISO date-time                                                        | No       | Created timestamp.            |
| `updatedAt`        | ISO date-time                                                        | No       | Updated timestamp.            |

### CompanyVerificationDocumentWithMetadataResponse

Used by recruiter/admin review endpoints. Extends `CompanyVerificationDocumentResponse`.

| Field          | Type   | Nullable | Note                                                                                    |
| -------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `documentType` | string | No       | Source document-storage type, expected `CERTIFICATE` or `OTHER` for verification proof. |
| `fileName`     | string | No       | Original uploaded file name.                                                            |
| `mimeType`     | string | No       | File MIME type.                                                                         |
| `size`         | number | No       | File size in bytes.                                                                     |

### CompanyVerificationDocumentDownloadResponse

Used by recruiter/admin download endpoint. Extends `CompanyVerificationDocumentWithMetadataResponse`.

| Field              | Type   | Nullable | Note                               |
| ------------------ | ------ | -------- | ---------------------------------- |
| `url`              | string | No       | Short-lived document download URL. |
| `expiresInSeconds` | number | No       | Download URL TTL.                  |

### TrustHistoryResponse

| Field                | Type                     | Nullable | Note                                       |
| -------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                 | uuid                     | No       | History row id.                            |
| `companyId`          | uuid                     | No       | Company id.                                |
| `previousTrustLevel` | `CompanyTrustLevel`      | No       | Old level.                                 |
| `newTrustLevel`      | `CompanyTrustLevel`      | No       | New level.                                 |
| `direction`          | `INCREASE` \| `DECREASE` | No       | Change direction.                          |
| `source`             | `MANUAL` \| `AUTO`       | No       | Manual admin or auto trust signal.         |
| `changedByUserId`    | uuid                     | Yes      | Admin id for manual change, null for auto. |
| `reason`             | string                   | No       | Reason shown to admin.                     |
| `metadata`           | object                   | No       | Auto signal metadata if any.               |
| `createdAt`          | ISO date-time            | No       | Change timestamp.                          |

## Request Objects

### CreateCompany body

| Field          | Type       | Required | Nullable | Note                                                      |
| -------------- | ---------- | -------- | -------- | --------------------------------------------------------- |
| `name`         | string     | Yes      | No       | 2..255 chars.                                             |
| `logo`         | URL string | No       | Yes      | Company logo URL.                                         |
| `description`  | string     | No       | Yes      | Company description.                                      |
| `industry`     | string     | No       | Yes      | Max 120 chars.                                            |
| `size`         | string     | No       | Yes      | Employee range label, max 50 chars.                       |
| `foundedYear`  | number     | No       | Yes      | 1800..2100.                                               |
| `mission`      | string     | No       | Yes      | Max 2000 chars.                                           |
| `culture`      | string     | No       | Yes      | Max 2000 chars.                                           |
| `values`       | string[]   | No       | No       | Max 20 items, each max 80 chars. Empty array when unset.  |
| `perks`        | string[]   | No       | No       | Max 20 items, each max 120 chars. Empty array when unset. |
| `heroImageUrl` | URL string | No       | Yes      | Legacy/manual hero image URL fallback.                    |
| `website`      | URL string | No       | Yes      | Company website.                                          |
| `contactEmail` | email      | No       | Yes      | Public company contact email, separate from login email.  |
| `contactPhone` | string     | No       | Yes      | Public company contact phone, max 30 chars.               |
| `address`      | string     | No       | Yes      | Company address.                                          |
| `taxCode`      | string     | Yes      | No       | 10..50 chars, trimmed. Must be unique.                    |

```json
{
  "name": "NexHire Tech",
  "logo": "https://cdn.nexhire.vn/company/logo.png",
  "description": "Tech company focusing on recruitment products.",
  "industry": "HR Tech",
  "size": "100-500",
  "foundedYear": 2018,
  "mission": "Build reliable recruitment automation for modern teams.",
  "culture": "Small teams, clear goals, and product-minded engineering.",
  "values": ["Clear ownership", "Candidate empathy"],
  "perks": ["Flexible schedule", "Learning budget"],
  "heroImageUrl": "https://cdn.nexhire.vn/company/hero.png",
  "website": "https://nexhire.vn",
  "contactEmail": "hr@nexhire.vn",
  "contactPhone": "02473001234",
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
  "industry": "HR Tech",
  "size": "100-500",
  "foundedYear": 2018,
  "mission": "Updated mission.",
  "culture": "Updated culture.",
  "values": ["Ownership", "Speed"],
  "perks": ["Hybrid work", "Learning budget"],
  "heroImageUrl": "https://cdn.nexhire.vn/company/new-hero.png",
  "website": "https://nexhire.vn",
  "contactEmail": "jobs@nexhire.vn",
  "contactPhone": "02473009999",
  "address": "Ho Chi Minh City, Viet Nam",
  "taxCode": "0107654321"
}
```

### VerifyCompany body

| Field    | Type                  | Required               | Nullable | Note                                |
| -------- | --------------------- | ---------------------- | -------- | ----------------------------------- |
| `action` | `APPROVE` \| `REJECT` | Yes                    | No       | Admin verification decision.        |
| `reason` | string                | Required when `REJECT` | Yes      | Admin review reason, max 500 chars. |

```json
{
  "action": "REJECT",
  "reason": "Business license document is missing or unreadable"
}
```

### Admin reason body

| Field    | Type   | Required | Nullable | Note           |
| -------- | ------ | -------- | -------- | -------------- |
| `reason` | string | No       | Yes      | Max 500 chars. |

```json
{
  "reason": "Policy violation"
}
```

### Update trust level body

| Field        | Type                        | Required | Nullable | Note                                  |
| ------------ | --------------------------- | -------- | -------- | ------------------------------------- |
| `trustLevel` | `LOW` \| `MEDIUM` \| `HIGH` | Yes      | No       | New internal trust level.             |
| `reason`     | string                      | Yes      | No       | Required admin reason, max 500 chars. |

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

| Header                                | Required | Note                    |
| ------------------------------------- | -------- | ----------------------- |
| `Authorization: Bearer <accessToken>` | Yes      | Recruiter access token. |

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
    "contactEmail": "hr@nexhire.vn",
    "contactPhone": "02473001234",
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

| Status | Code                      | Meaning                           |
| ------ | ------------------------- | --------------------------------- |
| 401    | `COMMON.UNAUTHORIZED`     | Missing/invalid token.            |
| 403    | `COMMON.FORBIDDEN`        | User is not recruiter.            |
| 409    | `COMPANY.ALREADY_EXISTS`  | Recruiter already owns a company. |
| 409    | `COMPANY.TAX_CODE_IN_USE` | Tax code is already used.         |
| 422    | `COMMON.VALIDATION_ERROR` | Invalid body.                     |

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
    "contactEmail": "hr@nexhire.vn",
    "contactPhone": "02473001234",
    "address": "Ha Noi, Viet Nam",
    "taxCode": "0101234567",
    "ownerId": "11111111-1111-1111-1111-111111111111",
    "status": "APPROVED",
    "canPostJobs": true,
    "completionPercent": 100,
    "missingRequiredFields": [],
    "submittedAt": "2026-07-16T09:00:00.000Z",
    "rejectionReason": null,
    "statusReason": null,
    "statusChangedAt": "2026-07-16T10:00:00.000Z",
    "statusChangedByUserId": "99999999-9999-9999-9999-999999999999",
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code                  | Meaning                           |
| ------ | --------------------- | --------------------------------- |
| 401    | `COMMON.UNAUTHORIZED` | Missing/invalid token.            |
| 403    | `COMMON.FORBIDDEN`    | User is not recruiter.            |
| 404    | `COMPANY.NOT_FOUND`   | Recruiter has no company profile. |

FE notes:

- Use `status` to show `Pending approval`, `Approved`, `Rejected`, or `Suspended` company state.
- Use `canPostJobs`, `completionPercent`, `missingRequiredFields`, `submittedAt`, and `rejectionReason` directly on recruiter dashboard instead of recalculating in FE.

## `PATCH /api/v1/companies/:id`

Summary: Update company profile owned by current recruiter.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note        |
| ----- | ---- | -------- | ----------- |
| `id`  | uuid | Yes      | Company id. |

Request body: `UpdateCompany body`.

Success response: `CompanyResponse`.

Rules:

- Updating `name` or `taxCode` resets company status to `PENDING`.
- Updating public enrichment/contact fields (`industry`, `size`, `foundedYear`, `mission`, `culture`, `values`, `perks`, `heroImageUrl`, `contactEmail`, `contactPhone`, `website`, `address`) does not reset company status.
- Updating `logo` clears `logoDocumentId`; updating `heroImageUrl` clears `heroImageDocumentId`. FE should still prefer document ids when present.
- Company-service publishes `company.posting-snapshot-changed` after profile/status changes.

Errors:

| Status | Code                      | Meaning                        |
| ------ | ------------------------- | ------------------------------ |
| 401    | `COMMON.UNAUTHORIZED`     | Missing/invalid token.         |
| 403    | `COMMON.FORBIDDEN`        | User is not the company owner. |
| 404    | `COMPANY.NOT_FOUND`       | Company not found.             |
| 409    | `COMPANY.TAX_CODE_IN_USE` | Tax code is already used.      |
| 422    | `COMMON.VALIDATION_ERROR` | Invalid body.                  |

FE notes:

- Warn recruiter that changing legal identity fields may require re-approval.
- Company contact fields are for public/company profile display. They do not change recruiter login email/phone.
- Recruiter account name/phone is updated through `PATCH /api/v1/auth/me`.
- FE should render company logo from `logoUrl` when present. `logoDocumentId` remains the stable source of truth.
- FE should render company cover from `heroImageUrl`. When `heroImageDocumentId` exists, company-service resolves `heroImageUrl` through document-storage internal API.
- Company-service caches resolved document URLs until shortly before their expiry, so repeated reads do not hit document-storage every time.

## `PATCH /api/v1/companies/:id/logo`

Summary: Upload and set company logo through document-storage.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note                                   |
| ----- | ---- | -------- | -------------------------------------- |
| `id`  | uuid | Yes      | Company id owned by current recruiter. |

Request body: `multipart/form-data`

| Field  | Type   | Required | Note                                                 |
| ------ | ------ | -------- | ---------------------------------------------------- |
| `file` | binary | Yes      | `image/jpeg`, `image/png`, or `image/webp`, max 5MB. |

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

| Status | Code                             | Meaning                         |
| ------ | -------------------------------- | ------------------------------- |
| 400    | `DOCUMENT.FILE_REQUIRED`         | Missing file.                   |
| 400    | `DOCUMENT.UNSUPPORTED_FILE_TYPE` | File is not jpeg/png/webp.      |
| 400    | `DOCUMENT.FILE_TOO_LARGE`        | File exceeds max size.          |
| 403    | `COMMON.FORBIDDEN`               | User is not the company owner.  |
| 404    | `COMPANY.NOT_FOUND`              | Company not found.              |
| 503    | `AI.SERVICE_UNAVAILABLE`         | document-storage upload failed. |

## `PATCH /api/v1/companies/:id/hero-image`

Summary: Upload and set company public hero/cover image through document-storage.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note                                   |
| ----- | ---- | -------- | -------------------------------------- |
| `id`  | uuid | Yes      | Company id owned by current recruiter. |

Request body: `multipart/form-data`

| Field  | Type   | Required | Note                                                 |
| ------ | ------ | -------- | ---------------------------------------------------- |
| `file` | binary | Yes      | `image/jpeg`, `image/png`, or `image/webp`, max 5MB. |

Success response: `CompanyResponse`.

Example response:

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
    "description": "Tech company focusing on recruitment products.",
    "industry": "HR Tech",
    "size": "100-500",
    "foundedYear": 2018,
    "mission": "Build reliable recruitment automation for modern teams.",
    "culture": "Small teams, clear goals, and product-minded engineering.",
    "values": ["Clear ownership", "Candidate empathy"],
    "perks": ["Flexible schedule", "Learning budget"],
    "heroImageDocumentId": "2b1d8260-58f9-4a5f-95e3-c2e7efae5c6a",
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

- Company-service stores `heroImageDocumentId` as source of truth.
- Uploading a document hero image clears `heroImageUrl` so the fallback URL cannot point at an old cover.
- Uploading hero image does not reset company verification status.
- Hero image is public profile content only and is not included in job snapshots.

Errors:

| Status | Code                             | Meaning                         |
| ------ | -------------------------------- | ------------------------------- |
| 400    | `DOCUMENT.FILE_REQUIRED`         | Missing file.                   |
| 400    | `DOCUMENT.UNSUPPORTED_FILE_TYPE` | File is not jpeg/png/webp.      |
| 400    | `DOCUMENT.FILE_TOO_LARGE`        | File exceeds max size.          |
| 403    | `COMMON.FORBIDDEN`               | User is not the company owner.  |
| 404    | `COMPANY.NOT_FOUND`              | Company not found.              |
| 503    | `AI.SERVICE_UNAVAILABLE`         | document-storage upload failed. |

## `GET /api/v1/companies/:id/verification-documents`

Summary: List verification proof documents attached to the recruiter's company, including document-storage metadata.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note                                   |
| ----- | ---- | -------- | -------------------------------------- |
| `id`  | uuid | Yes      | Company id owned by current recruiter. |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "33333333-3333-3333-3333-333333333333",
      "companyId": "22222222-2222-2222-2222-222222222222",
      "documentId": "44444444-4444-4444-4444-444444444444",
      "type": "BUSINESS_LICENSE",
      "uploadedByUserId": "11111111-1111-1111-1111-111111111111",
      "documentType": "CERTIFICATE",
      "fileName": "business-license.pdf",
      "mimeType": "application/pdf",
      "size": 234567,
      "createdAt": "2026-07-16T09:00:00.000Z",
      "updatedAt": "2026-07-16T09:00:00.000Z"
    }
  ]
}
```

Errors: `401`, `403`, `404`, `503`.

FE notes:

- Use this endpoint for the recruiter/company profile verification tab.
- It returns metadata only. Use the download-url endpoint below when the recruiter wants to preview/download a proof.

## `GET /api/v1/companies/:id/verification-documents/:documentId/download-url`

Summary: Get a short-lived download URL for one verification proof document owned by the recruiter's company.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field        | Type | Required | Note                                   |
| ------------ | ---- | -------- | -------------------------------------- |
| `id`         | uuid | Yes      | Company id owned by current recruiter. |
| `documentId` | uuid | Yes      | Attached document-storage id.          |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "documentId": "44444444-4444-4444-4444-444444444444",
    "type": "BUSINESS_LICENSE",
    "uploadedByUserId": "11111111-1111-1111-1111-111111111111",
    "documentType": "CERTIFICATE",
    "fileName": "business-license.pdf",
    "mimeType": "application/pdf",
    "size": 234567,
    "url": "https://minio.local/nexhire/company-proof-url",
    "expiresInSeconds": 3600,
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T09:00:00.000Z"
  }
}
```

Errors: `401`, `403`, `404`, `503`.

## `POST /api/v1/companies/:id/verification-documents`

Summary: Attach an uploaded document-storage document as company verification proof.

Auth:

- Required
- Roles: `RECRUITER`

Request body:

| Field        | Type | Required | Note                                                               |
| ------------ | ---- | -------- | ------------------------------------------------------------------ |
| `documentId` | uuid | Yes      | Existing document-storage document id.                             |
| `type`       | enum | Yes      | `BUSINESS_LICENSE`, `TAX_CERTIFICATE`, `DOMAIN_PROOF`, or `OTHER`. |

```json
{
  "documentId": "44444444-4444-4444-4444-444444444444",
  "type": "BUSINESS_LICENSE"
}
```

Success response: `CompanyVerificationDocumentResponse`.

Errors:

| Status | Code                      | Meaning                                       |
| ------ | ------------------------- | --------------------------------------------- |
| 401    | `COMMON.UNAUTHORIZED`     | Missing/invalid token.                        |
| 403    | `COMMON.FORBIDDEN`        | User is not the company owner.                |
| 404    | `COMPANY.NOT_FOUND`       | Company not found.                            |
| 409    | `COMMON.CONFLICT`         | Document is already attached to this company. |
| 422    | `COMMON.VALIDATION_ERROR` | Invalid body.                                 |

FE notes:

- Upload the file through document-storage first, then attach the returned `documentId` here.
- The uploaded document must have `ownerType = company`, `ownerId = companyId`, and `documentType = CERTIFICATE` or `OTHER`.
- Company-service validates document-storage metadata before saving the attachment. Wrong owner/type is rejected with `400 COMMON.VALIDATION_FAILED`; missing document is rejected with `404 COMMON.NOT_FOUND`.
- This endpoint only creates/removes the relation to company verification; it does not physically delete documents.

## `DELETE /api/v1/companies/:id/verification-documents/:documentId`

Summary: Soft-delete a company verification document attachment.

Auth:

- Required
- Roles: `RECRUITER`

Success response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

Errors: `401`, `403`, `404`.

## `POST /api/v1/companies/:id/request-verification-review`

Summary: Request admin verification review again for a rejected company after updating proof documents.

Auth:

- Required
- Roles: `RECRUITER`

Request params:

| Field | Type | Required | Note                                   |
| ----- | ---- | -------- | -------------------------------------- |
| `id`  | uuid | Yes      | Company id owned by current recruiter. |

Request body: none.

Success response: `CompanyResponse` with `status = PENDING`.

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "status": "PENDING",
    "statusReason": null,
    "statusChangedByUserId": "11111111-1111-1111-1111-111111111111"
  }
}
```

Errors:

| Status | Code                  | Meaning                                                                   |
| ------ | --------------------- | ------------------------------------------------------------------------- |
| 401    | `COMMON.UNAUTHORIZED` | Missing/invalid token.                                                    |
| 403    | `COMMON.FORBIDDEN`    | User is not the company owner.                                            |
| 404    | `COMPANY.NOT_FOUND`   | Company not found.                                                        |
| 409    | `COMMON.CONFLICT`     | Company is approved/suspended, or rejected company has no proof document. |

FE notes:

- Use this when a company was rejected and the recruiter has uploaded/replaced proof documents.
- This endpoint does not approve/reject the company. It only moves the company back to admin's pending review queue.
- The company keeps `verificationRejectedCount`, `lastVerificationRejectedReason`, and `lastVerificationRejectedAt`, so admin can see this is a retry case.
- `PENDING` is idempotent: calling this while already pending returns the current company.
- `APPROVED` does not need review again. `SUSPENDED` must be restored by admin first.

## Admin Endpoints

## `GET /api/v1/admin/companies`

Summary: List companies for admin management.

Auth:

- Required
- Roles: `ADMIN`

Query:

| Field               | Type           | Required | Note                                                                                      |
| ------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------- |
| `page`              | number         | No       | Default `1`.                                                                              |
| `limit`             | number         | No       | Default `20`, max from shared pagination.                                                 |
| `status`            | enum           | No       | `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`.                                           |
| `trustLevel`        | enum           | No       | `LOW`, `MEDIUM`, `HIGH`.                                                                  |
| `search`            | string         | No       | Search company name, tax code, website, contact email, owner id.                          |
| `hasRejectedBefore` | boolean string | No       | `true` for companies with `verificationRejectedCount > 0`; `false` for first-time review. |
| `sort`              | enum           | No       | `latest`, `oldest`, `rejected_count_desc`.                                                |

Success response: paginated `AdminCompanyResponse[]`.

FE notes:

- Use this for the full admin company table.
- Use `GET /api/v1/admin/companies/pending` only for a simple pending-only queue.
- Show retry context when `verificationRejectedCount > 0`.

## `GET /api/v1/admin/companies/overview`

Summary: Return company counts for admin dashboard overview.

Auth:

- Required
- Roles: `ADMIN`

Success response:

```json
{
  "success": true,
  "data": {
    "total": 32,
    "byStatus": {
      "PENDING": 5,
      "APPROVED": 20,
      "REJECTED": 4,
      "SUSPENDED": 3
    },
    "byTrustLevel": {
      "LOW": 3,
      "MEDIUM": 22,
      "HIGH": 7
    },
    "pendingReviewAgain": 2,
    "rejectedBefore": 8
  }
}
```

FE notes:

- Gateway admin overview already includes this payload under `companies`.

## `GET /api/v1/admin/companies/growth`

Summary: Return company growth and verification lifecycle chart series for admin dashboard.

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
        "registeredCompanies": 4,
        "approvedCompanies": 2,
        "rejectedCompanies": 1,
        "suspendedCompanies": 0,
        "reviewRequestedAgain": 1
      }
    ]
  }
}
```

FE notes:

- `registeredCompanies` counts company profiles created in company-service.
- Recruiter accounts are counted in auth-service under `recruiters`; they are intentionally not
  counted as companies.
- `approvedCompanies`, `rejectedCompanies`, and `suspendedCompanies` use the company's latest
  `statusChangedAt` and current status.
- `reviewRequestedAgain` uses `verificationReviewRequestedAt`.
- FE normally uses `GET /api/v1/admin/dashboard/companies/growth` through gateway for the dashboard
  range summary. Use this direct service endpoint when a detailed `points[]` series is needed.

## `GET /api/v1/admin/companies/pending`

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
      "verificationRejectedCount": 2,
      "lastVerificationRejectedReason": "Tax certificate does not match company name",
      "lastVerificationRejectedAt": "2026-07-16T10:00:00.000Z",
      "verificationReviewRequestedAt": "2026-07-16T11:00:00.000Z",
      "verificationReviewRequestedByUserId": "11111111-1111-1111-1111-111111111111",
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

| Status | Code                  | Meaning                |
| ------ | --------------------- | ---------------------- |
| 401    | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403    | `COMMON.FORBIDDEN`    | User is not admin.     |

FE notes:

- This is currently pending-only, not a full admin company search endpoint.

## `GET /api/v1/admin/companies/:id/verification-documents`

Summary: List attached company verification documents for admin review.

Auth:

- Required
- Roles: `ADMIN`

Request params:

| Field | Type | Required | Note        |
| ----- | ---- | -------- | ----------- |
| `id`  | uuid | Yes      | Company id. |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "33333333-3333-3333-3333-333333333333",
      "companyId": "22222222-2222-2222-2222-222222222222",
      "documentId": "44444444-4444-4444-4444-444444444444",
      "type": "BUSINESS_LICENSE",
      "uploadedByUserId": "11111111-1111-1111-1111-111111111111",
      "documentType": "CERTIFICATE",
      "fileName": "business-license.pdf",
      "mimeType": "application/pdf",
      "size": 234567,
      "createdAt": "2026-07-16T09:00:00.000Z",
      "updatedAt": "2026-07-16T09:00:00.000Z"
    }
  ]
}
```

Errors: `401`, `403`, `404`, `503`.

FE notes:

- Use this on the admin company verification detail before approving/rejecting.
- This endpoint returns metadata only, not a file URL.

## `GET /api/v1/admin/companies/:id/verification-documents/:documentId/download-url`

Summary: Get a short-lived download URL for one verification document.

Auth:

- Required
- Roles: `ADMIN`

Success response:

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "documentId": "44444444-4444-4444-4444-444444444444",
    "type": "BUSINESS_LICENSE",
    "uploadedByUserId": "11111111-1111-1111-1111-111111111111",
    "documentType": "CERTIFICATE",
    "fileName": "business-license.pdf",
    "mimeType": "application/pdf",
    "size": 234567,
    "url": "https://minio.local/nexhire/company-proof-url",
    "expiresInSeconds": 3600,
    "createdAt": "2026-07-16T09:00:00.000Z",
    "updatedAt": "2026-07-16T09:00:00.000Z"
  }
}
```

Errors:

| Status | Code                         | Meaning                                |
| ------ | ---------------------------- | -------------------------------------- |
| 401    | `COMMON.UNAUTHORIZED`        | Missing/invalid token.                 |
| 403    | `COMMON.FORBIDDEN`           | User is not admin.                     |
| 404    | `COMMON.NOT_FOUND`           | Company/document/attachment not found. |
| 503    | `COMMON.SERVICE_UNAVAILABLE` | document-storage unavailable.          |

## `PATCH /api/v1/admin/companies/:id/verify`

Summary: Approve or reject a company.

Auth:

- Required
- Roles: `ADMIN`

Request params:

| Field | Type | Required | Note        |
| ----- | ---- | -------- | ----------- |
| `id`  | uuid | Yes      | Company id. |

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

| Status | Code                            | Meaning                              |
| ------ | ------------------------------- | ------------------------------------ |
| 400    | `COMPANY.INVALID_VERIFY_ACTION` | Action is not `APPROVE` or `REJECT`. |
| 401    | `COMMON.UNAUTHORIZED`           | Missing/invalid token.               |
| 403    | `COMMON.FORBIDDEN`              | User is not admin.                   |
| 404    | `COMPANY.NOT_FOUND`             | Company not found.                   |
| 422    | `COMMON.VALIDATION_ERROR`       | Invalid body.                        |

FE notes:

- `APPROVED` companies can post jobs.
- `REJECTED` companies cannot post jobs.

## `PATCH /api/v1/admin/companies/:id/suspend`

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

| Status | Code                      | Meaning                |
| ------ | ------------------------- | ---------------------- |
| 401    | `COMMON.UNAUTHORIZED`     | Missing/invalid token. |
| 403    | `COMMON.FORBIDDEN`        | User is not admin.     |
| 404    | `COMPANY.NOT_FOUND`       | Company not found.     |
| 422    | `COMMON.VALIDATION_ERROR` | Invalid body.          |

FE notes:

- Job-service consumes the snapshot event and hides/marks affected jobs as not reviewable/public.

## `PATCH /api/v1/admin/companies/:id/restore`

Summary: Restore a rejected/suspended company to `PENDING` for another manual review.

Auth:

- Required
- Roles: `ADMIN`

Request body: `Admin reason body`.

Success response: `AdminCompanyResponse` with `status = PENDING`.

Errors:

| Status | Code                  | Meaning                |
| ------ | --------------------- | ---------------------- |
| 401    | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403    | `COMMON.FORBIDDEN`    | User is not admin.     |
| 404    | `COMPANY.NOT_FOUND`   | Company not found.     |

FE notes:

- Restored company still cannot post jobs until admin verifies it as `APPROVED`.

## `PATCH /api/v1/admin/companies/:id/trust-level`

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

| Status | Code                      | Meaning                                   |
| ------ | ------------------------- | ----------------------------------------- |
| 401    | `COMMON.UNAUTHORIZED`     | Missing/invalid token.                    |
| 403    | `COMMON.FORBIDDEN`        | User is not admin.                        |
| 404    | `COMPANY.NOT_FOUND`       | Company not found.                        |
| 422    | `COMMON.VALIDATION_ERROR` | Invalid/missing `trustLevel` or `reason`. |

FE notes:

- Reason is required and should be shown in trust history.
- Manual trust update resets trust counters.
- Do not show trust level to candidate/public UI.

## `GET /api/v1/admin/companies/:id/trust-history`

Summary: View trust level change history.

Auth:

- Required
- Roles: `ADMIN`

Request params:

| Field | Type | Required | Note        |
| ----- | ---- | -------- | ----------- |
| `id`  | uuid | Yes      | Company id. |

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

| Status | Code                  | Meaning                |
| ------ | --------------------- | ---------------------- |
| 401    | `COMMON.UNAUTHORIZED` | Missing/invalid token. |
| 403    | `COMMON.FORBIDDEN`    | User is not admin.     |
| 404    | `COMPANY.NOT_FOUND`   | Company not found.     |

## Public Endpoints

## `GET /api/v1/companies/public/:id`

Summary: Get public profile for an approved company.

Auth:

- Public

Request params:

| Field | Type | Required | Note        |
| ----- | ---- | -------- | ----------- |
| `id`  | uuid | Yes      | Company id. |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "NexHire Tech",
    "logo": "https://cdn.nexhire.vn/company/logo.png",
    "description": "Tech company focusing on recruitment products.",
    "industry": "HR Tech",
    "size": "100-500",
    "foundedYear": 2018,
    "mission": "Build reliable recruitment automation for modern teams.",
    "culture": "Small teams, clear goals, and product-minded engineering.",
    "values": ["Clear ownership", "Candidate empathy"],
    "perks": ["Flexible schedule", "Learning budget"],
    "heroImageDocumentId": "2b1d8260-58f9-4a5f-95e3-c2e7efae5c6a",
    "website": "https://nexhire.vn",
    "address": "Ha Noi, Viet Nam"
  }
}
```

Errors:

| Status | Code                      | Meaning                            |
| ------ | ------------------------- | ---------------------------------- |
| 400    | `COMMON.VALIDATION_ERROR` | Invalid UUID.                      |
| 404    | `COMPANY.NOT_FOUND`       | Company not found or not approved. |

FE notes:

- Only approved companies are public.
- Do not expect `status`, `taxCode`, `ownerId`, or `trustLevel`.
- Optional profile enrichment fields can be missing/null/empty. FE should hide empty sections:
  - hide mission/building block when `mission` is missing
  - hide culture block when `culture` is missing
  - hide values/perks cards when arrays are empty
  - use a default cover placeholder when both `heroImageDocumentId` and `heroImageUrl` are missing

## Internal Endpoints

## `GET /api/v1/internal/companies/:id/posting-snapshot`

Summary: Return company ownership and posting eligibility snapshot for job-service/auth-service repair flows.

Auth:

- Required
- Internal service token: `x-internal-service-token`

Request params:

| Field | Type | Required | Note        |
| ----- | ---- | -------- | ----------- |
| `id`  | uuid | Yes      | Company id. |

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

| Status | Code                  | Meaning                         |
| ------ | --------------------- | ------------------------------- |
| 401    | `COMMON.UNAUTHORIZED` | Missing/invalid internal token. |
| 403    | `COMMON.FORBIDDEN`    | Caller is not internal.         |
| 404    | `COMPANY.NOT_FOUND`   | Company not found.              |

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
