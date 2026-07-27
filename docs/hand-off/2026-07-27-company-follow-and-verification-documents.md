# Company Follow And Verification Documents Handoff - 2026-07-27

This handoff covers two FE flows:

- candidate follows a company and receives notifications when that company publishes jobs,
- recruiter uploads company verification proof documents for admin review.

## Candidate Follows Company

### Intent

Use this on public company cards/detail pages. Candidate can follow an approved company. When that company has a job approved and published, candidate receives an in-app notification.

### API

Base URL:

```txt
http://localhost:3000/api/v1
```

Auth:

- Candidate JWT is required for all `/followed-companies` endpoints.

### Follow Company

```http
POST /api/v1/followed-companies/:companyId
Authorization: Bearer <candidateToken>
```

Success:

```json
{
  "success": true,
  "data": {
    "id": "55555555-5555-5555-5555-555555555555",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "companyName": "NexHire",
    "companyLogoUrl": "https://storage.local/presigned-logo-url",
    "companyLogoDocumentId": "99999999-9999-9999-9999-999999999999",
    "followedAt": "2026-07-27T10:00:00.000Z"
  }
}
```

Notes:

- Idempotent. Calling it again returns the existing follow.
- Only approved companies can be followed.
- If company is not approved, BE returns `409 JOB.COMPANY_NOT_APPROVED`.
- `companyLogoUrl` is already resolved by BE when `companyLogoDocumentId` exists. FE does not call internal document APIs.

### Unfollow Company

```http
DELETE /api/v1/followed-companies/:companyId
Authorization: Bearer <candidateToken>
```

Success:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

### List Followed Companies

```http
GET /api/v1/followed-companies?page=1&limit=20
Authorization: Bearer <candidateToken>
```

Success:

```json
{
  "success": true,
  "data": [
    {
      "id": "55555555-5555-5555-5555-555555555555",
      "companyId": "22222222-2222-2222-2222-222222222222",
      "companyName": "NexHire",
      "companyLogoUrl": "https://storage.local/presigned-logo-url",
      "companyLogoDocumentId": "99999999-9999-9999-9999-999999999999",
      "followedAt": "2026-07-27T10:00:00.000Z"
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

### Batch Follow Status

Use this after loading company cards. Do not call one status API per card.

```http
GET /api/v1/followed-companies/status?companyIds=22222222-2222-2222-2222-222222222222,33333333-3333-3333-3333-333333333333
Authorization: Bearer <candidateToken>
```

Success:

```json
{
  "success": true,
  "data": {
    "followedCompanyIds": ["22222222-2222-2222-2222-222222222222"]
  }
}
```

### Single Follow Status

```http
GET /api/v1/followed-companies/:companyId/status
Authorization: Bearer <candidateToken>
```

Success:

```json
{
  "success": true,
  "data": {
    "followed": true
  }
}
```

### New Job Notification

When a followed company publishes a new job, notification appears through the existing notification API:

```http
GET /api/v1/notifications?readStatus=ALL&page=1&limit=20
Authorization: Bearer <candidateToken>
```

Notification item:

```json
{
  "id": "77777777-7777-7777-7777-777777777777",
  "recipientType": "USER",
  "recipientUserId": "11111111-1111-1111-1111-111111111111",
  "recipientCompanyId": null,
  "senderType": "COMPANY",
  "senderEntityId": "22222222-2222-2222-2222-222222222222",
  "senderName": "NexHire",
  "senderAvatarDocumentId": null,
  "senderLogoUrl": "https://storage.local/presigned-logo-url",
  "type": "COMPANY_FOLLOWED_JOB_PUBLISHED",
  "title": "New job from followed company",
  "body": "NexHire just published Backend Engineer.",
  "data": {
    "jobId": "33333333-3333-3333-3333-333333333333",
    "jobTitle": "Backend Engineer",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "companyName": "NexHire",
    "companyLogoUrl": "https://storage.local/presigned-logo-url",
    "companyLogoDocumentId": "99999999-9999-9999-9999-999999999999",
    "experienceLevel": "JUNIOR",
    "location": "Ha Noi",
    "salaryMin": 15000000,
    "salaryMax": 25000000,
    "salaryCurrency": "VND",
    "isSalaryVisible": true,
    "publishedAt": "2026-07-27T10:30:00.000Z"
  },
  "readAt": null,
  "createdAt": "2026-07-27T10:30:01.000Z",
  "updatedAt": "2026-07-27T10:30:01.000Z"
}
```

FE action:

- Clicking this notification should route to job detail using `data.jobId`.

## Company Verification Documents

### Intent

Recruiter uploads proof documents so admin can verify the company. This already uses document-storage plus company-service attachment.

### Upload And Attach Flow

Step 1. Upload file:

```http
POST /api/v1/documents/upload
Authorization: Bearer <recruiterToken>
Content-Type: multipart/form-data
```

Form data:

| Field          | Value                 |
| -------------- | --------------------- |
| `file`         | PDF/image/doc/docx    |
| `ownerType`    | `company`             |
| `ownerId`      | company id            |
| `documentType` | `CERTIFICATE`/`OTHER` |

Success:

```json
{
  "success": true,
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "documentType": "CERTIFICATE",
    "ownerType": "company",
    "ownerId": "22222222-2222-2222-2222-222222222222",
    "fileName": "business-license.pdf",
    "mimeType": "application/pdf",
    "size": 234567
  }
}
```

Step 2. Attach uploaded document to company verification:

```http
POST /api/v1/companies/:companyId/verification-documents
Authorization: Bearer <recruiterToken>
Content-Type: application/json
```

Request:

```json
{
  "documentId": "44444444-4444-4444-4444-444444444444",
  "type": "BUSINESS_LICENSE"
}
```

Allowed `type`:

- `BUSINESS_LICENSE`
- `TAX_CERTIFICATE`
- `DOMAIN_PROOF`
- `OTHER`

Success:

```json
{
  "success": true,
  "data": {
    "id": "66666666-6666-6666-6666-666666666666",
    "companyId": "22222222-2222-2222-2222-222222222222",
    "documentId": "44444444-4444-4444-4444-444444444444",
    "type": "BUSINESS_LICENSE",
    "uploadedByUserId": "11111111-1111-1111-1111-111111111111",
    "createdAt": "2026-07-27T10:00:00.000Z",
    "updatedAt": "2026-07-27T10:00:00.000Z"
  }
}
```

### Recruiter Lists Attached Proofs

```http
GET /api/v1/companies/:companyId/verification-documents
Authorization: Bearer <recruiterToken>
```

Response includes the company attachment row plus document metadata from document-storage:

```json
{
  "success": true,
  "data": [
    {
      "id": "66666666-6666-6666-6666-666666666666",
      "companyId": "22222222-2222-2222-2222-222222222222",
      "documentId": "44444444-4444-4444-4444-444444444444",
      "type": "BUSINESS_LICENSE",
      "uploadedByUserId": "11111111-1111-1111-1111-111111111111",
      "documentType": "CERTIFICATE",
      "fileName": "business-license.pdf",
      "mimeType": "application/pdf",
      "size": 234567,
      "createdAt": "2026-07-27T10:00:00.000Z",
      "updatedAt": "2026-07-27T10:00:00.000Z"
    }
  ]
}
```

### Recruiter Previews A Proof

```http
GET /api/v1/companies/:companyId/verification-documents/:documentId/download-url
Authorization: Bearer <recruiterToken>
```

The returned URL is short-lived. FE should open/use it immediately and request a new one later if it expires.

### Recruiter Removes Attachment

```http
DELETE /api/v1/companies/:companyId/verification-documents/:documentId
Authorization: Bearer <recruiterToken>
```

This removes the verification attachment only. It does not physically delete the document object.

### Recruiter Requests Admin Review Again

If admin rejected the company, the recruiter can upload/attach corrected proof documents and request admin review again:

```http
POST /api/v1/companies/:companyId/request-verification-review
Authorization: Bearer <recruiterToken>
```

Rules:

- `REJECTED` with at least one attached proof: becomes `PENDING`.
- This endpoint does not approve/reject the company. It only moves the company back to admin's pending review queue.
- The company keeps `verificationRejectedCount`, `lastVerificationRejectedReason`, and `lastVerificationRejectedAt`, so admin can see whether this is the first, second, or later retry.
- The request action sets `verificationReviewRequestedAt` and `verificationReviewRequestedByUserId`.
- `PENDING`: idempotent, returns current company.
- `APPROVED`: rejected with `409 COMMON.CONFLICT` because no review is needed.
- `SUSPENDED`: rejected with `409 COMMON.CONFLICT`; admin must restore first.
- `REJECTED` without proof: rejected with `409 COMMON.CONFLICT`.

Admin pending company cards should surface retry context when `verificationRejectedCount > 0`, for example:

```json
{
  "status": "PENDING",
  "verificationRejectedCount": 2,
  "lastVerificationRejectedReason": "Tax certificate does not match company name",
  "lastVerificationRejectedAt": "2026-07-27T09:00:00.000Z",
  "verificationReviewRequestedAt": "2026-07-27T10:00:00.000Z"
}
```

### Admin Review

List metadata:

```http
GET /api/v1/admin/companies/:companyId/verification-documents
Authorization: Bearer <adminToken>
```

Get temporary URL for preview/download:

```http
GET /api/v1/admin/companies/:companyId/verification-documents/:documentId/download-url
Authorization: Bearer <adminToken>
```

Admin then approves/rejects company through the existing verify API:

```http
PATCH /api/v1/admin/companies/:companyId/verify
Authorization: Bearer <adminToken>
Content-Type: application/json
```

```json
{
  "action": "APPROVE"
}
```

or:

```json
{
  "action": "REJECT",
  "reason": "Business license is missing or unreadable"
}
```
