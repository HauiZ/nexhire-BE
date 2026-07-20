# Gateway API Docs

Base path: `/api/v1`

Responsibility: public HTTP entrypoint, JWT decoding, identity header forwarding, route proxying, Swagger aggregation per service.

## Routing map

| Public path                        | Target service             |
| ---------------------------------- | -------------------------- |
| `/api/v1/auth/*`                   | `auth-service`             |
| `/api/v1/users/*`                  | `auth-service`             |
| `/api/v1/admin/users/*`            | `auth-service`             |
| `/api/v1/candidates/*`             | `candidate-service`        |
| `/api/v1/cvs/*`                    | `candidate-service`        |
| `/api/v1/saved-jobs`               | `candidate-service`        |
| `/api/v1/saved-jobs/*`             | `candidate-service`        |
| `/api/v1/companies`                | `company-service`          |
| `/api/v1/companies/*`              | `company-service`          |
| `/api/v1/hr-accounts`              | `company-service`          |
| `/api/v1/hr-accounts/*`            | `company-service`          |
| `/api/v1/jobs`                     | `job-service`              |
| `/api/v1/jobs/*`                   | `job-service`              |
| `/api/v1/recruiter/jobs`           | `job-service`              |
| `/api/v1/recruiter/jobs/*`         | `job-service`              |
| `/api/v1/recruiter/dashboard/summary` | gateway composition     |
| `/api/v1/admin/jobs/*`             | `job-service`              |
| `/api/v1/categories`               | `job-service`              |
| `/api/v1/categories/*`             | `job-service`              |
| `/api/v1/applications`             | `application-service`      |
| `/api/v1/applications/*`           | `application-service`      |
| `/api/v1/recruiter/applications`   | `application-service`      |
| `/api/v1/recruiter/applications/*` | `application-service`      |
| `/api/v1/cv-parsing/*`             | `cv-parsing-service`       |
| `/api/v1/matching/*`               | `matching-service`         |
| `/api/v1/notifications`            | `notification-service`     |
| `/api/v1/notifications/*`          | `notification-service`     |
| `/api/v1/documents`                | `document-storage-service` |
| `/api/v1/documents/*`              | `document-storage-service` |

## Identity forwarding

FE sends:

```http
Authorization: Bearer <accessToken>
```

Gateway forwards to internal services:

```http
x-user-id: <userId>
x-user-role: <role>
x-company-id: <companyId>
x-request-id: <requestId>
```

## Endpoints

### `GET /api/v1/recruiter/dashboard/summary`

Summary: Return one recruiter dashboard payload by composing company, job, and application service data.

Auth:

- Required
- Roles: `RECRUITER`

Gateway calls:

- `GET /api/v1/companies/me`
- `GET /api/v1/recruiter/jobs/status-counts`
- `GET /api/v1/recruiter/applications/stats`

Success response:

```json
{
  "success": true,
  "data": {
    "company": {
      "id": "22222222-2222-2222-2222-222222222222",
      "status": "APPROVED",
      "canPostJobs": true,
      "completionPercent": 100,
      "submittedAt": "2026-07-16T09:00:00.000Z",
      "rejectionReason": null
    },
    "stats": {
      "activeJobs": 4,
      "pendingJobs": 2,
      "newApplications": 12,
      "responseRate": 64,
      "responseRateWindowDays": 6
    },
    "tasks": {
      "verifyCompany": false,
      "pendingJobs": 2,
      "submittedApplications": 12
    }
  }
}
```

No company response:

```json
{
  "success": true,
  "data": {
    "company": {
      "id": null,
      "status": "NO_COMPANY",
      "canPostJobs": false,
      "completionPercent": 0,
      "submittedAt": null,
      "rejectionReason": null
    },
    "stats": {
      "activeJobs": 0,
      "pendingJobs": 0,
      "newApplications": 0,
      "responseRate": 0,
      "responseRateWindowDays": 6
    },
    "tasks": {
      "verifyCompany": true,
      "pendingJobs": 0,
      "submittedApplications": 0
    }
  }
}
```

FE notes:

- Use this endpoint on `/recruiter` to avoid multiple small `limit=1` requests.
- Pending jobs are `PENDING_REVIEW + NEEDS_REVIEW + SHOULD_REJECT`.
- `responseRate = round((OFFERED + REJECTED) / totalApplications * 100)` from application-service stats.
- Gateway resolves `companyId` from `companies/me` before calling job/application stats, so the dashboard still works after company approval even if the current JWT has not been refreshed yet.

Errors: `401`, `403`, `503 COMMON.SERVICE_UNAVAILABLE`.

### `GET /api/v1/health`

Summary: Check gateway health.

Auth:

- Public

Success response:

```json
{
  "status": "ok",
  "info": {},
  "error": {},
  "details": {}
}
```

FE notes:

- This is an operational endpoint, not a product feature endpoint.
- Individual service health endpoints exist when services are called directly, but FE should normally check gateway health only.
