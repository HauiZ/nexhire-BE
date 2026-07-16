# Company Service API Docs

Base path through gateway:
- `/api/v1/companies`
- `/api/v1/hr-accounts`

Responsibility: company profile and HR accounts.

## Endpoints

### `POST /companies`

**Auth**: Recruiter
**Purpose**: Create a new company profile. A recruiter can only have one company.

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

**Response**: `CompanyResponseDto`
```json
{
  "code": "SUCCESS",
  "message": "Success",
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
    "createdAt": "2023-10-01T00:00:00Z",
    "updatedAt": "2023-10-01T00:00:00Z"
  }
}
```

**Error Codes**:
- `401 Unauthorized`
- `403 Forbidden`
- `409 Conflict`: `COMPANY_ALREADY_EXISTS` or `COMPANY_TAX_CODE_IN_USE`

---

### `GET /companies/me`

**Auth**: Recruiter
**Purpose**: Get the currently logged-in recruiter's company profile.

**Response**: `CompanyResponseDto`

**Error Codes**:
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`: `COMPANY_NOT_FOUND`

---

### `PUT /companies/:id`

**Auth**: Recruiter
**Purpose**: Update the company profile. Requires the recruiter to be the owner. Updating `taxCode` or `name` will revert the company status to `PENDING`.

**Params**:
- `id` (UUID)

**Body**: `UpdateCompanyDto` (Partial of `CreateCompanyDto`)

**Response**: `CompanyResponseDto`

**Error Codes**:
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`: `COMPANY_NOT_FOUND`
- `409 Conflict`: `COMPANY_TAX_CODE_IN_USE`

---

### `GET /companies/admin/pending`

**Auth**: Admin
**Purpose**: Get a list of pending companies for verification.

**Response**: Array of `CompanyResponseDto`

**Error Codes**:
- `401 Unauthorized`
- `403 Forbidden`

---

### `PATCH /companies/:id/verify`

**Auth**: Admin
**Purpose**: Approve or reject a company.

**Params**:
- `id` (UUID)

**Body**: `VerifyCompanyDto`
```json
{
  "action": "APPROVE" // or "REJECT"
}
```

**Response**: `CompanyResponseDto`

**Error Codes**:
- `400 Bad Request`: `INVALID_VERIFY_ACTION`
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`: `COMPANY_NOT_FOUND`

---

### `GET /companies/public/:id`

**Auth**: Public
**Purpose**: Get public company profile. The company must be `APPROVED`.

**Params**:
- `id` (UUID)

**Response**:
```json
{
  "code": "SUCCESS",
  "message": "Success",
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

**Error Codes**:
- `404 Not Found`: `COMPANY_NOT_FOUND`
