# Admin Features Hand-off

Tai lieu nay tong hop cac tinh nang admin hien co de FE gan dashboard theo dung ngu nghia. Base URL qua gateway:

```text
http://localhost:3000/api/v1
```

Tat ca endpoint trong file nay can `Authorization: Bearer <adminToken>`.

## 1. Tong Quan Phan Quyen

Admin co cac nhom chinh:

- Quan ly user account: tim user, xem detail, suspend, ban, archive, restore.
- Duyet company: xem company pending, xem giay to minh chung, approve/reject, suspend/restore, dieu chinh trust level.
- Duyet job: review job moi, review major revision, unpublish/republish/close job.

Admin khong tu dong duyet job/company. Cac diem moderation/trust chi la thong tin ho tro quyet dinh.

## 2. Dashboard Overview

FE nen dung mot endpoint composition qua gateway:

```http
GET /api/v1/admin/dashboard/overview
```

Response:

```json
{
  "success": true,
  "data": {
    "users": {
      "total": 120,
      "byStatus": {
        "ACTIVE": 96,
        "INACTIVE": 0,
        "SUSPENDED": 4,
        "LOCKED": 0,
        "BANNED": 1,
        "ARCHIVED": 2
      },
      "byRole": {
        "CANDIDATE": 90,
        "RECRUITER": 25,
        "ADMIN": 5
      },
      "emailVerified": 110,
      "emailUnverified": 10
    },
    "companies": {
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
    },
    "jobs": {
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
      "revisionsWaitingReview": 3
    }
  }
}
```

Behind the scenes gateway calls:

- `GET /api/v1/admin/users/overview`
- `GET /api/v1/admin/companies/overview`
- `GET /api/v1/admin/jobs/overview`

UI notes:

- Use `users.total`, `companies.byStatus.PENDING`, `jobs.jobsWaitingReview`, and `jobs.revisionsWaitingReview` for top cards.
- If one upstream service is down, gateway returns `503 COMMON.SERVICE_UNAVAILABLE`.

## 3. Dashboard Growth Charts

FE nen dung 3 endpoint rieng qua gateway de tranh loi mot service lam hong toan bo dashboard.
Moi endpoint tra tong trong range da chon, khong tra chi tiet tung ngay.

Query chung:

| Field  | Note                                               |
| ------ | -------------------------------------------------- |
| `from` | Inclusive date, optional. Default is last 30 days. |
| `to`   | Inclusive date, optional. Default is today.        |

Default range:

- Neu FE khong truyen `from`/`to`, BE se lay 30 ngay gan nhat tinh den ngay hien tai.
- Vi du neu hom nay la `2026-07-31`, range mac dinh la `from=2026-07-02`, `to=2026-07-31`.
- Ky so sanh se la 30 ngay lien truoc: `comparisonFrom=2026-06-02`, `comparisonTo=2026-07-01`.

Range theo tung block:

- Ba endpoint growth doc lap nhau, khong bat buoc dung chung range.
- FE co the dung date filter rieng cho user/company/job block.
- Doi range block nao thi chi can goi lai endpoint cua block do.

### User growth

```http
GET /api/v1/admin/dashboard/users/growth?from=2026-07-01&to=2026-07-31
```

```json
{
  "success": true,
  "data": {
    "from": "2026-07-01",
    "to": "2026-07-31",
    "comparisonFrom": "2026-05-31",
    "comparisonTo": "2026-06-30",
    "registeredUsers": 120,
    "candidates": 86,
    "recruiters": 30,
    "admins": 4,
    "bannedUsers": 2,
    "suspendedUsers": 5,
    "archivedUsers": 1,
    "growth": {
      "registeredUsers": {
        "previousValue": 100,
        "change": 20,
        "percent": 20
      },
      "candidates": {
        "previousValue": 80,
        "change": 6,
        "percent": 7.5
      },
      "recruiters": {
        "previousValue": 20,
        "change": 10,
        "percent": 50
      },
      "admins": {
        "previousValue": 4,
        "change": 0,
        "percent": 0
      },
      "bannedUsers": {
        "previousValue": 1,
        "change": 1,
        "percent": 100
      },
      "suspendedUsers": {
        "previousValue": 0,
        "change": 5,
        "percent": null
      },
      "archivedUsers": {
        "previousValue": 0,
        "change": 1,
        "percent": null
      }
    }
  }
}
```

### Company growth

```http
GET /api/v1/admin/dashboard/companies/growth?from=2026-07-01&to=2026-07-31
```

```json
{
  "success": true,
  "data": {
    "from": "2026-07-01",
    "to": "2026-07-31",
    "comparisonFrom": "2026-05-31",
    "comparisonTo": "2026-06-30",
    "registeredCompanies": 22,
    "approvedCompanies": 14,
    "rejectedCompanies": 3,
    "suspendedCompanies": 1,
    "reviewRequestedAgain": 2,
    "growth": {
      "registeredCompanies": {
        "previousValue": 18,
        "change": 4,
        "percent": 22.22
      },
      "approvedCompanies": {
        "previousValue": 10,
        "change": 4,
        "percent": 40
      },
      "rejectedCompanies": {
        "previousValue": 2,
        "change": 1,
        "percent": 50
      },
      "suspendedCompanies": {
        "previousValue": 0,
        "change": 1,
        "percent": null
      },
      "reviewRequestedAgain": {
        "previousValue": 1,
        "change": 1,
        "percent": 100
      }
    }
  }
}
```

### Job growth

```http
GET /api/v1/admin/dashboard/jobs/growth?from=2026-07-01&to=2026-07-31
```

```json
{
  "success": true,
  "data": {
    "from": "2026-07-01",
    "to": "2026-07-31",
    "comparisonFrom": "2026-05-31",
    "comparisonTo": "2026-06-30",
    "createdJobs": 64,
    "publishedJobs": 41,
    "unpublishedJobs": 8,
    "closedJobs": 4,
    "reviewedJobs": 47,
    "rejectedJobs": 6,
    "applicationsSubmitted": 230,
    "growth": {
      "createdJobs": {
        "previousValue": 50,
        "change": 14,
        "percent": 28
      },
      "publishedJobs": {
        "previousValue": 35,
        "change": 6,
        "percent": 17.14
      },
      "unpublishedJobs": {
        "previousValue": 5,
        "change": 3,
        "percent": 60
      },
      "closedJobs": {
        "previousValue": 2,
        "change": 2,
        "percent": 100
      },
      "reviewedJobs": {
        "previousValue": 40,
        "change": 7,
        "percent": 17.5
      },
      "rejectedJobs": {
        "previousValue": 4,
        "change": 2,
        "percent": 50
      },
      "applicationsSubmitted": {
        "previousValue": 200,
        "change": 30,
        "percent": 15
      }
    }
  }
}
```

Important notes:

- `recruiters` la so account co role recruiter trong auth-service.
- `registeredCompanies` la so company profile da tao trong company-service.
- Hai so nay khong duoc gop chung; nen dung de ve funnel recruiter signup -> company created -> company approved.
- `comparisonFrom`/`comparisonTo` la ky lien truoc cung do dai voi range hien tai.
- `growth.*.percent = null` khi previousValue bang `0` va current co data, vi khong co mau so de tinh phan tram dung.
- Moi endpoint summary chi goi dung 1 upstream service mot lan voi range mo rong tu `comparisonFrom` den `to`, sau do gateway tu cong current/previous.
- Neu FE khong truyen range, moi endpoint tu dung default 30 ngay gan nhat; default nay ap dung rieng cho tung endpoint.
- Endpoint cu `GET /api/v1/admin/dashboard/growth` van ton tai neu FE can series `points[]` theo ngay/thang.

## 4. Quan Ly User

Base path:

```http
/api/v1/admin/users
```

### List Users

```http
GET /api/v1/admin/users?page=1&limit=20&search=nguyen&role=CANDIDATE&status=ACTIVE
```

Query:

| Field           | Note                                                               |
| --------------- | ------------------------------------------------------------------ |
| `page`, `limit` | Pagination, default `1/20`, max `100`.                             |
| `search`        | Search email, full name, phone, recruiter company name.            |
| `role`          | `CANDIDATE`, `RECRUITER`, `ADMIN`.                                 |
| `status`        | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `LOCKED`, `BANNED`, `ARCHIVED`. |

Response item:

```json
{
  "id": "user-id",
  "email": "candidate@nexhire.vn",
  "phone": "0901234567",
  "fullName": "Nguyen Van A",
  "avatarUrl": null,
  "status": "ACTIVE",
  "roles": ["CANDIDATE"],
  "emailVerified": true,
  "company": null,
  "lastLoginAt": "2026-07-16T08:00:00.000Z",
  "statusReason": null,
  "statusChangedBy": null,
  "statusChangedAt": null,
  "suspendedAt": null,
  "bannedAt": null,
  "archivedAt": null,
  "createdAt": "2026-07-16T07:00:00.000Z",
  "updatedAt": "2026-07-16T07:00:00.000Z"
}
```

Recruiter item co them snapshot company:

```json
{
  "roles": ["RECRUITER"],
  "company": {
    "companyId": "company-id",
    "companyName": "NexHire Tech",
    "companyStatus": "APPROVED"
  }
}
```

### User Detail

```http
GET /api/v1/admin/users/:id
```

Response la mot `AdminUserResponse`, cung shape voi item trong list.

### User Lifecycle Actions

```http
PATCH /api/v1/admin/users/:id/suspend
PATCH /api/v1/admin/users/:id/ban
PATCH /api/v1/admin/users/:id/archive
PATCH /api/v1/admin/users/:id/restore
```

Body cho suspend/ban/archive:

```json
{
  "reason": "Suspicious activity"
}
```

Body restore:

```json
{
  "reason": "Appeal accepted"
}
```

UI notes:

- `SUSPENDED`, `BANNED`, `ARCHIVED`, `INACTIVE`, `LOCKED` user khong login/refresh/auth me/change password duoc.
- Admin khong duoc suspend/ban/archive/restore chinh minh: BE tra `403 AUTH.CANNOT_MANAGE_SELF`.
- Sau action, refresh lai list/detail vi token cua target user da bi revoke.

### User Overview Direct Endpoint

```http
GET /api/v1/admin/users/overview
```

Normally FE should use `/admin/dashboard/overview`; this direct endpoint is useful for auth admin debugging or a user-only analytics widget.

## 5. Duyet Company Va Minh Chung

Company status:

| Status      | Meaning                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `PENDING`   | Dang cho admin review.                                                  |
| `APPROVED`  | Duoc dang job.                                                          |
| `REJECTED`  | Bi tu choi, recruiter can sua/bo sung minh chung va yeu cau review lai. |
| `SUSPENDED` | Bi admin khoa eligibility; can admin restore truoc.                     |

### Pending Companies

```http
GET /api/v1/admin/companies/pending
```

Response item:

```json
{
  "id": "company-id",
  "name": "NexHire Tech",
  "logoUrl": "https://storage.local/company-logo",
  "description": "Tech company focusing on recruitment products.",
  "website": "https://nexhire.vn",
  "address": "Ha Noi, Viet Nam",
  "taxCode": "0101234567",
  "ownerId": "recruiter-user-id",
  "status": "PENDING",
  "verificationRejectedCount": 2,
  "lastVerificationRejectedReason": "Tax certificate does not match company name",
  "lastVerificationRejectedAt": "2026-07-16T10:00:00.000Z",
  "verificationReviewRequestedAt": "2026-07-16T11:00:00.000Z",
  "verificationReviewRequestedByUserId": "recruiter-user-id",
  "trustLevel": "MEDIUM",
  "approvedLowRiskCount": 0,
  "negativeTrustSignalCount": 0,
  "createdAt": "2026-07-16T09:00:00.000Z",
  "updatedAt": "2026-07-16T11:00:00.000Z"
}
```

UI notes:

- Neu `verificationRejectedCount > 0`, hien badge kieu `Review lai lan 2` va ly do reject gan nhat.
- `trustLevel` la noi bo admin only, khong hien cho candidate/public.

### Full Company Table

```http
GET /api/v1/admin/companies?page=1&limit=20&status=PENDING&trustLevel=MEDIUM&search=nexhire&hasRejectedBefore=true&sort=rejected_count_desc
```

Query:

| Field               | Note                                                      |
| ------------------- | --------------------------------------------------------- |
| `page`, `limit`     | Pagination.                                               |
| `status`            | `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`.           |
| `trustLevel`        | `LOW`, `MEDIUM`, `HIGH`.                                  |
| `search`            | Company name, tax code, website, contact email, owner id. |
| `hasRejectedBefore` | `true` or `false`.                                        |
| `sort`              | `latest`, `oldest`, `rejected_count_desc`.                |

Use this for all-company management. Use pending endpoint only for a lightweight review queue.

### Company Overview Direct Endpoint

```http
GET /api/v1/admin/companies/overview
```

Normally FE should use `/admin/dashboard/overview`; this direct endpoint is useful for company-only dashboard widgets.

### Verification Documents

List metadata:

```http
GET /api/v1/admin/companies/:companyId/verification-documents
```

Response item:

```json
{
  "id": "attachment-id",
  "companyId": "company-id",
  "documentId": "document-id",
  "type": "BUSINESS_LICENSE",
  "uploadedByUserId": "recruiter-user-id",
  "documentType": "CERTIFICATE",
  "fileName": "business-license.pdf",
  "mimeType": "application/pdf",
  "size": 234567,
  "createdAt": "2026-07-16T09:00:00.000Z",
  "updatedAt": "2026-07-16T09:00:00.000Z"
}
```

Open/download one proof:

```http
GET /api/v1/admin/companies/:companyId/verification-documents/:documentId/download-url
```

Response:

```json
{
  "id": "attachment-id",
  "documentId": "document-id",
  "fileName": "business-license.pdf",
  "mimeType": "application/pdf",
  "url": "https://minio.local/presigned-proof-url",
  "expiresInSeconds": 3600
}
```

UI notes:

- URL la short-lived. FE nen lay URL moi khi admin bam preview/download.
- List endpoint chi tra metadata, khong tra file URL.

### Approve Or Reject Company

```http
PATCH /api/v1/admin/companies/:companyId/verify
```

Approve:

```json
{
  "action": "APPROVE"
}
```

Reject:

```json
{
  "action": "REJECT",
  "reason": "Business license document is missing or unreadable"
}
```

Rules:

- Reject bat buoc co `reason`.
- Approve cho phep company dang job.
- Reject tang `verificationRejectedCount` va luu `lastVerificationRejectedReason/At`.
- Neu recruiter yeu cau review lai, company quay ve `PENDING` nhung van giu reject count/reason de admin thay lich su.

### Suspend Or Restore Company

```http
PATCH /api/v1/admin/companies/:companyId/suspend
PATCH /api/v1/admin/companies/:companyId/restore
```

Body:

```json
{
  "reason": "Policy violation"
}
```

UI notes:

- Suspend lam company khong con du eligibility dang job.
- Restore dua company ve `PENDING`; van can admin verify `APPROVE` thi moi dang job lai.

### Trust Level

Manual update:

```http
PATCH /api/v1/admin/companies/:companyId/trust-level
```

Body:

```json
{
  "trustLevel": "HIGH",
  "reason": "Company consistently submits verified low-risk jobs"
}
```

History:

```http
GET /api/v1/admin/companies/:companyId/trust-history
```

UI notes:

- `trustLevel`: `LOW`, `MEDIUM`, `HIGH`.
- Reason la bat buoc khi admin update manual.
- Auto trust signal den tu job review: approve low-risk tang positive count; reject job tao negative signal.
- Candidate/public khong duoc thay trust level.

## 6. Duyet Job

Base path:

```http
/api/v1/admin/jobs
```

### Full Job Table

```http
GET /api/v1/admin/jobs?page=1&limit=20&status=PUBLISHED&riskLevel=LOW&companyId=company-id&search=backend&sort=applications_desc
```

Query:

| Field           | Note                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `page`, `limit` | Pagination.                                                                                                                               |
| `status`        | Any `JobStatus`: `DRAFT`, `PENDING_REVIEW`, `NEEDS_REVIEW`, `SHOULD_REJECT`, `PUBLISHED`, `UNPUBLISHED`, `REJECTED`, `CLOSED`, `EXPIRED`. |
| `riskLevel`     | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.                                                                                                      |
| `companyId`     | Filter by company.                                                                                                                        |
| `search`        | Title, company name, location, skills.                                                                                                    |
| `sort`          | `latest`, `oldest`, `risk_desc`, `applications_desc`.                                                                                     |

Use this for admin job management/takedown table.

### Job Overview Direct Endpoint

```http
GET /api/v1/admin/jobs/overview
```

Normally FE should use `/admin/dashboard/overview`; this direct endpoint is useful for job-only dashboard widgets.

### Job Review Queue

```http
GET /api/v1/admin/jobs/review-queue?page=1&limit=20&status=NEEDS_REVIEW&search=backend
```

Query:

| Field           | Note                                               |
| --------------- | -------------------------------------------------- |
| `page`, `limit` | Pagination.                                        |
| `status`        | `PENDING_REVIEW`, `NEEDS_REVIEW`, `SHOULD_REJECT`. |
| `search`        | Search title/company name.                         |

Important response fields:

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

UI notes:

- Moderation chi phan loai/risk hint, khong auto approve.
- Admin nen thay `riskScore`, `riskLevel`, `reasons`, `matchedRules` trong review detail.

### Review Job

```http
POST /api/v1/admin/jobs/:jobId/review
```

Approve:

```json
{
  "decision": "APPROVE",
  "reason": "Company and content verified."
}
```

Reject:

```json
{
  "decision": "REJECT",
  "reason": "Job description contains misleading compensation."
}
```

Rules:

- Approve publish job ra public ngay.
- Reject bat buoc co `reason`, job khong len public.
- Company snapshot phai approved, neu khong BE tra `403 JOB.COMPANY_NOT_APPROVED`.

### Admin Job Takedown

```http
POST /api/v1/admin/jobs/:jobId/unpublish
POST /api/v1/admin/jobs/:jobId/republish
POST /api/v1/admin/jobs/:jobId/close
```

Unpublish body:

```json
{
  "reason": "Policy violation"
}
```

Close body:

```json
{
  "reason": "Recruitment permanently closed"
}
```

Rules:

- `unpublish`: chi ap dung cho `PUBLISHED`, can reason.
- `republish`: chi ap dung cho `UNPUBLISHED`, company snapshot phai approved.
- `close`: chi ap dung cho `PUBLISHED` hoac `UNPUBLISHED`, la dong vinh vien.

## 7. Review Major Job Revisions

### Revision Review Queue

```http
GET /api/v1/admin/jobs/revision-review-queue?page=1&limit=20&status=NEEDS_REVIEW&search=backend
```

Query:

| Field           | Note                                               |
| --------------- | -------------------------------------------------- |
| `page`, `limit` | Pagination.                                        |
| `status`        | `PENDING_REVIEW`, `NEEDS_REVIEW`, `SHOULD_REJECT`. |
| `search`        | Title, change summary, company id, job id.         |

Response item:

```json
{
  "id": "revision-id",
  "jobId": "job-id",
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
  "reviewReason": null
}
```

### Review Revision

```http
POST /api/v1/admin/jobs/revisions/:revisionId/review
```

Approve:

```json
{
  "decision": "APPROVE",
  "reason": "Major update verified."
}
```

Reject:

```json
{
  "decision": "REJECT",
  "reason": "Salary range is misleading."
}
```

Rules:

- Approve apply revision snapshot vao job hien tai va tang `job.version`.
- Reject giu job public hien tai khong doi.
- Reject can reason.

## 8. Loi Thuong Gap FE Can Handle

| Status | Example code                          | Meaning                                                          |
| ------ | ------------------------------------- | ---------------------------------------------------------------- |
| `400`  | `JOB.REVIEW_DECISION_REASON_REQUIRED` | Missing reason for reject/unpublish.                             |
| `403`  | `COMMON.FORBIDDEN`                    | Token khong phai admin.                                          |
| `403`  | `JOB.COMPANY_NOT_APPROVED`            | Company snapshot chua approved nen khong publish/republish duoc. |
| `403`  | `AUTH.CANNOT_MANAGE_SELF`             | Admin dang thao tac khoa chinh minh.                             |
| `404`  | `*_NOT_FOUND`                         | Target khong ton tai.                                            |
| `409`  | `*_NOT_ALLOWED`                       | Action khong hop le voi status hien tai.                         |
| `422`  | `COMMON.VALIDATION_ERROR`             | Body/query sai validation.                                       |
| `503`  | `COMMON.SERVICE_UNAVAILABLE`          | document-storage hoac service noi bo tam thoi loi.               |

## 9. Ghi Chu Trien Khai UI

- Admin company review detail nen gom 3 tab: Profile, Verification Documents, Trust History.
- Admin job review detail nen gom job content, moderation panel, action approve/reject.
- Tat ca action reject/suspend/unpublish/close nen hien modal reason.
- Neu response co `verificationRejectedCount > 0`, hien retry context ro rang de admin biet cong ty da bi reject bao nhieu lan.
- Khong hien `trustLevel` va verification reject history tren public/candidate pages.
