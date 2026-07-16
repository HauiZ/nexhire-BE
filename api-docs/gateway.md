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
| `/api/v1/admin/jobs/*`             | `job-service`              |
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
