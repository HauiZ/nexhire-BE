# Company Service API Docs

Base path through gateway:
- `/api/v1/companies`
- `/api/v1/hr-accounts`

Responsibility: company profile and HR accounts.

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
