# Gateway API Docs

Base path: `/api/v1`

Responsibility: public HTTP entrypoint, JWT decoding, identity header forwarding, route proxying, Swagger aggregation per service.

## Routing map

| Public path                                | Target service             |
| ------------------------------------------ | -------------------------- |
| `/api/v1/auth/*`                           | `auth-service`             |
| `/api/v1/users/*`                          | `auth-service`             |
| `/api/v1/admin/users`                      | `auth-service`             |
| `/api/v1/admin/users/*`                    | `auth-service`             |
| `/api/v1/admin/ai-configs`                 | `cv-parsing-service`       |
| `/api/v1/admin/ai-configs/*`               | `cv-parsing-service`       |
| `/api/v1/candidates/*`                     | `candidate-service`        |
| `/api/v1/cvs/*`                            | `candidate-service`        |
| `/api/v1/saved-jobs`                       | `candidate-service`        |
| `/api/v1/saved-jobs/*`                     | `candidate-service`        |
| `/api/v1/companies`                        | `company-service`          |
| `/api/v1/companies/*`                      | `company-service`          |
| `/api/v1/admin/companies`                  | `company-service`          |
| `/api/v1/admin/companies/*`                | `company-service`          |
| `/api/v1/hr-accounts`                      | `company-service`          |
| `/api/v1/hr-accounts/*`                    | `company-service`          |
| `/api/v1/jobs`                             | `job-service`              |
| `/api/v1/jobs/*`                           | `job-service`              |
| `/api/v1/recruiter/jobs`                   | `job-service`              |
| `/api/v1/recruiter/jobs/*`                 | `job-service`              |
| `/api/v1/recruiter/dashboard/summary`      | gateway composition        |
| `/api/v1/admin/dashboard/overview`         | gateway composition        |
| `/api/v1/admin/dashboard/growth`           | gateway composition        |
| `/api/v1/admin/dashboard/users/growth`     | gateway -> auth-service    |
| `/api/v1/admin/dashboard/companies/growth` | gateway -> company-service |
| `/api/v1/admin/dashboard/jobs/growth`      | gateway -> job-service     |
| `/api/v1/admin/jobs`                       | `job-service`              |
| `/api/v1/admin/jobs/*`                     | `job-service`              |
| `/api/v1/categories`                       | `job-service`              |
| `/api/v1/categories/*`                     | `job-service`              |
| `/api/v1/applications`                     | `application-service`      |
| `/api/v1/applications/*`                   | `application-service`      |
| `/api/v1/recruiter/applications`           | `application-service`      |
| `/api/v1/recruiter/applications/*`         | `application-service`      |
| `/api/v1/cv-parsing/*`                     | `cv-parsing-service`       |
| `/api/v1/matching/*`                       | `matching-service`         |
| `/api/v1/notifications`                    | `notification-service`     |
| `/api/v1/notifications/*`                  | `notification-service`     |
| `/api/v1/documents`                        | `document-storage-service` |
| `/api/v1/documents/*`                      | `document-storage-service` |

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

### `GET /api/v1/admin/dashboard/overview`

Summary: Return one admin dashboard overview payload by composing auth, company, and job service counts.

Auth:

- Required
- Roles: `ADMIN`

Gateway calls:

- `GET /api/v1/admin/users/overview`
- `GET /api/v1/admin/companies/overview`
- `GET /api/v1/admin/jobs/overview`

Success response:

```json
{
  "success": true,
  "data": {
    "users": {
      "total": 120,
      "byStatus": {
        "ACTIVE": 96,
        "SUSPENDED": 4,
        "BANNED": 1,
        "ARCHIVED": 2,
        "INACTIVE": 0,
        "LOCKED": 0
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
}
```

FE notes:

- Use this endpoint for admin overview cards/charts instead of firing three service requests from FE.
- If one upstream service is down, gateway returns `503 COMMON.SERVICE_UNAVAILABLE`.

Errors: `401`, `403`, `503 COMMON.SERVICE_UNAVAILABLE`.

### `GET /api/v1/admin/dashboard/growth`

Summary: Return admin dashboard growth chart series by composing auth, company, and job service
growth endpoints.

Auth:

- Required
- Roles: `ADMIN`

Query:

| Field    | Type | Required | Note                                             |
| -------- | ---- | -------- | ------------------------------------------------ |
| `from`   | date | No       | Inclusive date. Defaults to 29 days before `to`. |
| `to`     | date | No       | Inclusive date. Defaults to today.               |
| `bucket` | enum | No       | `day` or `month`; default `day`.                 |

Gateway calls:

- `GET /api/v1/admin/users/growth`
- `GET /api/v1/admin/companies/growth`
- `GET /api/v1/admin/jobs/growth`

Success response:

```json
{
  "success": true,
  "data": {
    "users": {
      "from": "2026-07-01",
      "to": "2026-07-31",
      "bucket": "day",
      "points": [
        {
          "bucket": "2026-07-01",
          "registeredUsers": 12,
          "candidates": 8,
          "recruiters": 3,
          "admins": 1,
          "bannedUsers": 0,
          "suspendedUsers": 1,
          "archivedUsers": 0
        }
      ]
    },
    "companies": {
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
    },
    "jobs": {
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
}
```

FE notes:

- Prefer the three split summary endpoints below for dashboard range totals, so one upstream
  service failure does not block the other two chart sections.
- Use this endpoint only when FE needs detailed line/bar chart points by day/month.
- `recruiters` counts recruiter accounts, while `registeredCompanies` counts company profiles. They
  are intentionally separate so FE can show the recruiter signup -> company created -> company
  approved funnel.
- Empty days/months are returned with zero values so FE can render continuous charts directly.

### `GET /api/v1/admin/dashboard/users/growth`

Summary: Return user growth totals for the selected date range.

Auth:

- Required
- Roles: `ADMIN`

Query:

| Field  | Type | Required | Note                                             |
| ------ | ---- | -------- | ------------------------------------------------ |
| `from` | date | No       | Inclusive date. Defaults to 29 days before `to`. |
| `to`   | date | No       | Inclusive date. Defaults to today.               |

Gateway calls only:

- `GET /api/v1/admin/users/growth`

Implementation note: gateway requests one expanded date range from `comparisonFrom` to `to`, then
sums the current and previous periods in memory.

Success response:

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

### `GET /api/v1/admin/dashboard/companies/growth`

Summary: Return company growth and verification totals for the selected date range.

Auth:

- Required
- Roles: `ADMIN`

Query:

| Field  | Type | Required | Note                                             |
| ------ | ---- | -------- | ------------------------------------------------ |
| `from` | date | No       | Inclusive date. Defaults to 29 days before `to`. |
| `to`   | date | No       | Inclusive date. Defaults to today.               |

Gateway calls only:

- `GET /api/v1/admin/companies/growth`

Implementation note: gateway requests one expanded date range from `comparisonFrom` to `to`, then
sums the current and previous periods in memory.

Success response:

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

### `GET /api/v1/admin/dashboard/jobs/growth`

Summary: Return job lifecycle and application totals for the selected date range.

Auth:

- Required
- Roles: `ADMIN`

Query:

| Field  | Type | Required | Note                                             |
| ------ | ---- | -------- | ------------------------------------------------ |
| `from` | date | No       | Inclusive date. Defaults to 29 days before `to`. |
| `to`   | date | No       | Inclusive date. Defaults to today.               |

Gateway calls only:

- `GET /api/v1/admin/jobs/growth`

Implementation note: gateway requests one expanded date range from `comparisonFrom` to `to`, then
sums the current and previous periods in memory.

Success response:

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

Errors: `400`, `401`, `403`, `422`, `503 COMMON.SERVICE_UNAVAILABLE`.

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
