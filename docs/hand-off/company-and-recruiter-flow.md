# Company And Recruiter Flow

Base URL:

```txt
/api/v1
```

## Company Profile

Recruiter endpoints:

```http
POST /companies
GET /companies/me
PATCH /companies/:id
PATCH /companies/:id/logo
PATCH /companies/:id/hero-image
```

Public company detail:

```http
GET /companies/public/:id
```

Public company jobs:

```http
GET /jobs/companies/:companyId?page=1&limit=4
```

Important public fields for detail page:

```json
{
  "id": "company-id",
  "name": "NexHire Tech",
  "industry": "Cong nghe va san pham so",
  "size": "100-500 nhan su",
  "founded": 2018,
  "website": "https://nexhire.vn",
  "location": "Cau Giay, Ha Noi",
  "description": "Product engineering company...",
  "mission": "Dieu ho dang xay dung...",
  "culture": "Moi truong lam viec...",
  "values": ["Ro rang", "Chu dong"],
  "perks": ["Lich lam viec linh hoat"],
  "logoUrl": "https://signed-logo-url",
  "logoDocumentId": "logo-document-id",
  "heroImageUrl": "https://signed-hero-url",
  "heroImageDocumentId": "hero-document-id",
  "contactEmail": "jobs@nexhire.vn",
  "contactPhone": "02473001234"
}
```

If optional fields are null/empty, FE should hide that block:

- no `mission`: hide "Dieu ho dang xay dung"
- no `culture`: hide "Moi truong lam viec"
- empty `values`: hide chips block
- empty `perks`: hide perks block
- no `heroImageUrl`: show neutral fallback/placeholder

Company public response does not include job counters. Use `GET /jobs/companies/:companyId` for the "Viec lam dang tuyen" block and count from paginated metadata or result length.

## Company Verification

Company must be approved before posting jobs.

Flow:

1. Recruiter creates company profile.
2. Admin verifies company.
3. Approved company can create/submit jobs.
4. Company events sync snapshots into job-service/application-service.

Admin endpoints are documented in `api-docs/company-service.md`.

## Trust Level

Company trust level:

- `LOW`
- `MEDIUM`
- `HIGH`

FE candidate pages should not show trust level.

Admin can see and manually adjust trust level with reason/history. BE also adjusts trust from job review signals:

- Positive signal: admin approves a low-risk job.
- Negative signal: admin rejects a job or moderation risk is high/critical.
- Approved medium/high/critical risk jobs are neutral because admin accepted them manually.

## Recruiter Dashboard

Gateway composition endpoint:

```http
GET /recruiter/dashboard/summary
```

Use for dashboard cards/charts. Gateway composes:

- company profile/completion status
- recruiter job counts
- application stats

Notes:

- Gateway resolves current company even if JWT was issued before company approval.
- For detailed lists, use recruiter job/application endpoints directly.

Recruiter jobs:

```http
GET /recruiter/jobs
GET /recruiter/jobs/status-counts
POST /recruiter/jobs
PATCH /recruiter/jobs/:id
POST /recruiter/jobs/:id/submit
POST /recruiter/jobs/:id/unpublish
POST /recruiter/jobs/:id/republish
POST /recruiter/jobs/:id/close
DELETE /recruiter/jobs/:id
```

Major revision:

```http
POST /recruiter/jobs/:id/revisions
PATCH /recruiter/jobs/:id/revisions/:revisionId
POST /recruiter/jobs/:id/revisions/:revisionId/submit
```
