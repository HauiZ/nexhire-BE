# Candidate Service API Docs

Base path through gateway:

- `/api/v1/candidates`
- `/api/v1/cvs`
- `/api/v1/cv-template-presets`
- `/api/v1/cv-templates`
- `/api/v1/followed-companies`
- `/api/v1/saved-jobs`

Responsibility: candidate profile, skills, education, experience, CV Library, public CV template presets, saved jobs, followed companies.

## Domain notes

Candidate-service is being designed around:

- profile as source of truth,
- CV Library as saved CV references,
- profile update from CV only after user confirmation,
- parsing only for `PROFILE_UPDATE` or `MATCHING_APPLICATION` contexts.
- `profile.contactEmail` falls back to auth-service login email when candidate contact email is empty.
- Candidate profile changes publish `candidate.profile-snapshot-changed` so application-service can refresh display snapshots.

## Endpoints

### Internal only: `GET /api/v1/internal/candidates/:candidateId/matching-snapshot`

Summary: Return a candidate profile/CV snapshot for matching-service scoring.

Auth:

- Internal service token only.

Query:

| Field           | Required | Note                                                     |
| --------------- | -------- | -------------------------------------------------------- |
| `candidateCvId` | No       | Validates the CV belongs to the candidate when supplied. |

Success response payload:

```json
{
  "candidateId": "candidate-id",
  "candidateUserId": "candidate-user-id",
  "candidateCvId": "candidate-cv-id",
  "fullName": "Nguyen Van A",
  "headline": "Backend Engineer",
  "summary": "NestJS developer",
  "location": "Ha Noi",
  "skills": [{ "name": "NestJS", "level": "ADVANCED", "yearsOfExperience": 2 }],
  "experiences": [{ "title": "Backend Engineer", "company": "NexHire", "startYear": 2024 }],
  "educations": [{ "degree": "Bachelor", "school": "HUST", "fieldOfStudy": "Computer Science" }],
  "certifications": ["AWS Cloud Practitioner"],
  "projects": ["Recruitment API"]
}
```

### Internal only: `POST /api/v1/internal/cvs/:candidateId/:candidateCvId/request-parse`

Summary: Request parsing for the exact CV used by an application before matching.

Auth:

- Internal service token only.

Request body:

```json
{
  "requestedByUserId": "candidate-user-id",
  "force": false
}
```

`force=true` is reserved for service orchestration recovery, for example when application-service sees `cvParseStatus=PARSED` but cv-parsing-service has no stored parsed result for that CV. Normal callers should omit it.

Success response payload is the candidate CV metadata with `parseStatus`.

### `GET /api/v1/candidates/me`

Summary: Get the current candidate profile aggregate.

Auth:

- Required
- Roles: `CANDIDATE`

Headers:

| Header                                | Required | Note                  |
| ------------------------------------- | -------- | --------------------- |
| `Authorization: Bearer <accessToken>` | Yes      | Sent by FE to gateway |

Success response:

```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "7e0e0bd7-ff3d-490b-9bbd-dfa697cbd8ef",
      "userId": "b7f07d2a-59d1-4f3e-91ec-f3ad07a01c4a",
      "fullName": "Nguyen Minh Khoa",
      "phone": "0912345678",
      "contactEmail": "khoa.nguyen@example.com",
      "avatarDocumentId": "b8b33c46-4bb0-4a33-8b0d-927e081a38a5",
      "avatarUrl": "https://storage.local/presigned-avatar-url",
      "headline": "Senior Frontend Engineer",
      "summary": "I build performant web products.",
      "location": "Ha Noi, Viet Nam",
      "portfolioUrl": "https://minhkhoa.dev",
      "linkedinUrl": "https://linkedin.com/in/minhkhoa",
      "language": "vi",
      "openToWork": true,
      "visibility": "PUBLIC",
      "createdAt": "2026-07-11T10:00:00.000Z",
      "updatedAt": "2026-07-11T10:00:00.000Z"
    },
    "skills": [
      {
        "id": "690f28c6-b623-4dc6-8196-c7efe2e7957b",
        "name": "TypeScript",
        "level": "ADVANCED",
        "yearsOfExperience": 3,
        "source": "MANUAL"
      }
    ],
    "experiences": [
      {
        "id": "8c58a157-8052-420f-8f82-8db18cc248b7",
        "companyName": "FPT Software",
        "position": "Senior Frontend Engineer",
        "employmentType": "FULL_TIME",
        "startMonth": 3,
        "startYear": 2022,
        "endMonth": null,
        "endYear": null,
        "isCurrent": true,
        "description": "Built recruitment web products.",
        "source": "MANUAL"
      }
    ],
    "educations": [
      {
        "id": "7ee22086-1401-4fcb-b1e7-6a4c12d06d9c",
        "schoolName": "Dai hoc Bach Khoa Ha Noi",
        "degree": "Ky su Cong nghe thong tin",
        "fieldOfStudy": "Cong nghe thong tin",
        "startYear": 2015,
        "endYear": 2019,
        "isCurrent": false,
        "description": null,
        "source": "MANUAL"
      }
    ],
    "certifications": [
      {
        "id": "e12f44a5-5b0e-4fcf-88bb-d8f7168b54ed",
        "name": "AWS Certified Solutions Architect - Associate",
        "issuer": "Amazon Web Services",
        "credentialUrl": "https://www.credly.com/badges/example",
        "issuedYear": 2025,
        "description": null,
        "source": "MANUAL"
      }
    ],
    "projects": [
      {
        "id": "05c5a1f7-9146-4d72-aea7-52712aa91062",
        "name": "NexHire ATS",
        "description": "Built candidate profile and CV workflow.",
        "technologies": ["NestJS", "PostgreSQL"],
        "projectUrl": "https://nexhire.example.com",
        "source": "MANUAL"
      }
    ],
    "defaultCv": null,
    "cvs": [],
    "completionPercent": 100
  }
}
```

Errors:

| Status | Code         | Meaning                      |
| ------ | ------------ | ---------------------------- |
| 401    | unauthorized | Missing/invalid access token |
| 403    | forbidden    | User role is not allowed     |

### `PATCH /api/v1/candidates/me`

Summary: Update the current candidate profile aggregate. Arrays in the request replace the corresponding aggregate section.

Auth:

- Required
- Roles: `CANDIDATE`

Headers:

| Header                                | Required | Note                  |
| ------------------------------------- | -------- | --------------------- |
| `Authorization: Bearer <accessToken>` | Yes      | Sent by FE to gateway |

Request body:

Top-level fields:

| Field            | Type   | Required | Note                                                                                   |
| ---------------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| `profile`        | object | No       | Omitted means keep current profile fields unchanged                                    |
| `skills`         | array  | No       | Omitted means keep current skills unchanged; empty array clears skills                 |
| `experiences`    | array  | No       | Omitted means keep current experiences unchanged; empty array clears experiences       |
| `educations`     | array  | No       | Omitted means keep current educations unchanged; empty array clears educations         |
| `certifications` | array  | No       | Omitted means keep current certifications unchanged; empty array clears certifications |
| `projects`       | array  | No       | Omitted means keep current projects unchanged; empty array clears projects             |

`profile` fields:

| Field              | Type    | Required | Note                                                     |
| ------------------ | ------- | -------- | -------------------------------------------------------- |
| `fullName`         | string  | No       | Max 255; blank string is stored as `null`                |
| `phone`            | string  | No       | Max 30; blank string is stored as `null`                 |
| `contactEmail`     | string  | No       | Valid email, max 255; blank string is stored as `null`   |
| `headline`         | string  | No       | Max 255; blank string is stored as `null`                |
| `summary`          | string  | No       | Max 2000; blank string is stored as `null`               |
| `location`         | string  | No       | Max 255; blank string is stored as `null`                |
| `portfolioUrl`     | string  | No       | Full URL with protocol; blank string is stored as `null` |
| `linkedinUrl`      | string  | No       | Full URL with protocol; blank string is stored as `null` |
| `language`         | enum    | No       | `vi` or `en`; syncs to auth-service for `/auth/me`       |
| `openToWork`       | boolean | No       | Candidate availability flag                              |
| `visibility`       | enum    | No       | `PUBLIC`, `PRIVATE`                                      |
| `avatarDocumentId` | uuid    | No       | Document id for avatar; blank string is stored as `null` |

`skills[]` fields:

| Field               | Type   | Required | Note                                             |
| ------------------- | ------ | -------- | ------------------------------------------------ |
| `name`              | string | Yes      | Max 120, unique after normalization              |
| `level`             | enum   | No       | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT` |
| `yearsOfExperience` | number | No       | 0-60, max 1 decimal place                        |

`experiences[]` fields:

| Field            | Type    | Required | Note                                                            |
| ---------------- | ------- | -------- | --------------------------------------------------------------- |
| `companyName`    | string  | Yes      | Max 255                                                         |
| `position`       | string  | Yes      | Max 255                                                         |
| `employmentType` | enum    | No       | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE` |
| `startMonth`     | number  | No       | 1-12; requires `startYear` if present                           |
| `startYear`      | number  | No       | 1900-2100                                                       |
| `endMonth`       | number  | No       | 1-12; requires `endYear` if present                             |
| `endYear`        | number  | No       | 1900-2100                                                       |
| `isCurrent`      | boolean | No       | If true, end date is stored as `null`                           |
| `description`    | string  | No       | Max 2000                                                        |

`educations[]` fields:

| Field          | Type    | Required | Note                                   |
| -------------- | ------- | -------- | -------------------------------------- |
| `schoolName`   | string  | Yes      | Max 255                                |
| `degree`       | string  | No       | Max 255                                |
| `fieldOfStudy` | string  | No       | Max 255                                |
| `startYear`    | number  | No       | 1900-2100                              |
| `endYear`      | number  | No       | 1900-2100                              |
| `isCurrent`    | boolean | No       | If true, `endYear` is stored as `null` |
| `description`  | string  | No       | Max 2000                               |

`certifications[]` fields:

| Field           | Type   | Required | Note                   |
| --------------- | ------ | -------- | ---------------------- |
| `name`          | string | Yes      | Max 255                |
| `issuer`        | string | No       | Max 255                |
| `credentialUrl` | string | No       | Full URL with protocol |
| `issuedYear`    | number | No       | 1900-2100              |
| `description`   | string | No       | Max 2000               |

`projects[]` fields:

| Field          | Type     | Required | Note                                                                      |
| -------------- | -------- | -------- | ------------------------------------------------------------------------- |
| `name`         | string   | Yes      | Max 255                                                                   |
| `description`  | string   | No       | Max 2000                                                                  |
| `technologies` | string[] | No       | Max 30 items; each item max 80 chars; duplicate names are normalized away |
| `projectUrl`   | string   | No       | Full URL with protocol                                                    |

```json
{
  "profile": {
    "fullName": "Nguyen Minh Khoa",
    "phone": "0912345678",
    "contactEmail": "khoa.nguyen@example.com",
    "headline": "Senior Frontend Engineer",
    "summary": "I build performant web products.",
    "location": "Ha Noi, Viet Nam",
    "portfolioUrl": "https://minhkhoa.dev",
    "linkedinUrl": "https://linkedin.com/in/minhkhoa",
    "language": "en",
    "openToWork": true,
    "visibility": "PUBLIC",
    "avatarDocumentId": "b8b33c46-4bb0-4a33-8b0d-927e081a38a5"
  },
  "skills": [
    {
      "name": "TypeScript",
      "level": "ADVANCED",
      "yearsOfExperience": 3
    }
  ],
  "experiences": [
    {
      "companyName": "FPT Software",
      "position": "Senior Frontend Engineer",
      "employmentType": "FULL_TIME",
      "startMonth": 3,
      "startYear": 2022,
      "isCurrent": true,
      "description": "Built recruitment web products."
    }
  ],
  "educations": [
    {
      "schoolName": "Dai hoc Bach Khoa Ha Noi",
      "degree": "Ky su Cong nghe thong tin",
      "fieldOfStudy": "Cong nghe thong tin",
      "startYear": 2015,
      "endYear": 2019,
      "isCurrent": false
    }
  ],
  "certifications": [
    {
      "name": "AWS Certified Solutions Architect - Associate",
      "issuer": "Amazon Web Services",
      "credentialUrl": "https://www.credly.com/badges/example",
      "issuedYear": 2025
    }
  ],
  "projects": [
    {
      "name": "NexHire ATS",
      "description": "Built candidate profile and CV workflow.",
      "technologies": ["NestJS", "PostgreSQL"],
      "projectUrl": "https://nexhire.example.com"
    }
  ]
}
```

Success response: same shape as `GET /api/v1/candidates/me`.

Allowed enums:

| Field                          | Values                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `profile.visibility`           | `PUBLIC`, `PRIVATE`                                             |
| `profile.language`             | `vi`, `en`                                                      |
| `skills[].level`               | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`                |
| `experiences[].employmentType` | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE` |

Errors:

| Status | Code             | Meaning                                      |
| ------ | ---------------- | -------------------------------------------- |
| 400    | validation error | Invalid date/year/month or profile aggregate |
| 401    | unauthorized     | Missing/invalid access token                 |
| 403    | forbidden        | User role is not allowed                     |
| 409    | conflict         | Duplicate skill/profile conflict             |
| 422    | validation error | Invalid request body                         |

### `PATCH /api/v1/candidates/me/avatar`

Summary: Upload an avatar document and set it as the current candidate profile avatar.

Auth:

- Required
- Roles: `CANDIDATE`

Request body: `multipart/form-data`

| Field  | Type | Required | Note                                                 |
| ------ | ---- | -------- | ---------------------------------------------------- |
| `file` | file | Yes      | `image/jpeg`, `image/png`, or `image/webp`; max 5 MB |

Success response: same shape as `GET /api/v1/candidates/me`, with `profile.avatarDocumentId` set to the uploaded document id.

Avatar rendering:

- FE should render `profile.avatarUrl` directly when it is present.
- `profile.avatarUrl` is resolved by candidate-service through document-storage internal API; FE must not call `/internal/documents/:id/download-url`.
- `profile.avatarDocumentId` remains the stable document reference for update/delete/audit.
- Candidate-service caches resolved avatar URLs until shortly before their expiry, so repeated `/candidates/me` reads do not hit document-storage every time.
- If the signed URL expires or is missing, refetch `/api/v1/candidates/me`.

Errors:

| Status | Code             | Meaning                        |
| ------ | ---------------- | ------------------------------ |
| 400    | validation error | Missing file or invalid file   |
| 401    | unauthorized     | Missing/invalid access token   |
| 403    | forbidden        | User role is not allowed       |
| 503    | AI/service error | Downstream service unavailable |

### `POST /api/v1/cvs/upload`

Summary: Upload a CV document and create a CV library record. Parsing is optional and must be explicitly requested.

Auth:

- Required
- Roles: `CANDIDATE`

Request body: `multipart/form-data`

| Field       | Type    | Required | Note                                                    |
| ----------- | ------- | -------- | ------------------------------------------------------- |
| `file`      | file    | Yes      | PDF/DOC/DOCX; max 10 MB                                 |
| `title`     | string  | No       | Max 255; defaults to uploaded file name                 |
| `isDefault` | boolean | No       | If true, clears previous default CV for this candidate  |
| `parse`     | boolean | No       | Defaults to `false`; when true, trigger profile parsing |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "bb4f26c9-2bb3-4177-8483-ff057db9f675",
    "documentId": "2f67a247-7ff0-4e50-bff7-a2dcfbf6de2e",
    "title": "Backend Engineer CV",
    "isDefault": true,
    "parseStatus": "NOT_PARSED",
    "source": "UPLOADED",
    "sourceTemplateId": null,
    "sourceCvId": null,
    "parsedAt": null,
    "createdAt": "2026-07-15T10:00:00.000Z",
    "updatedAt": "2026-07-15T10:00:00.000Z"
  }
}
```

Notes:

- The uploaded file is stored through `document-storage-service`.
- The CV record is created in `candidate_cvs`.
- Upload does not trigger parsing unless `parse=true` is sent.
- If `parse=true`, candidate-service calls `cv-parsing-service` to create a parse request with context `PROFILE_UPDATE`.
- If the parse trigger fails, the CV record is still created but its `parseStatus` becomes `FAILED`.
- Profile update from parsed data is applied by the parsing flow once normalized `ParsedResume` is available.
- Deleted CV records are excluded when deciding the first/default CV.

Errors:

| Status | Code             | Meaning                        |
| ------ | ---------------- | ------------------------------ |
| 400    | validation error | Missing file or invalid file   |
| 401    | unauthorized     | Missing/invalid access token   |
| 403    | forbidden        | User role is not allowed       |
| 409    | conflict         | Duplicate CV document conflict |
| 503    | AI/service error | Downstream service unavailable |

### `POST /api/v1/cvs/:id/parse`

Summary: Trigger parsing for a saved CV and apply parsed data to the candidate profile.

Auth:

- Required
- Roles: `CANDIDATE`

Rules:

- The CV must belong to the current candidate and must not be soft-deleted.
- `NOT_PARSED` and `FAILED` CVs can be parsed.
- `PARSING` returns `409` because a parse request is already in progress.
- `PARSED` returns `409` for now; future `reparse=true` can be added if needed.
- Candidate-service resolves a temporary document download URL internally before calling cv-parsing-service. FE does not call document-storage internal download APIs.

Success response:

```json
{
  "success": true,
  "data": {
    "id": "bb4f26c9-2bb3-4177-8483-ff057db9f675",
    "documentId": "2f67a247-7ff0-4e50-bff7-a2dcfbf6de2e",
    "title": "Backend Engineer CV",
    "isDefault": true,
    "parseStatus": "PARSING",
    "source": "UPLOADED",
    "sourceTemplateId": null,
    "sourceCvId": null,
    "parsedAt": null,
    "createdAt": "2026-07-15T10:00:00.000Z",
    "updatedAt": "2026-07-15T10:00:00.000Z"
  }
}
```

Errors:

| Status | Code                       | Meaning                                      |
| ------ | -------------------------- | -------------------------------------------- |
| 401    | unauthorized               | Missing/invalid access token                 |
| 403    | forbidden                  | User role is not allowed                     |
| 404    | `APPLICATION.CV_NOT_FOUND` | CV does not exist, was deleted, or not owned |
| 409    | `COMMON.CONFLICT`          | CV is already parsing or already parsed      |
| 503    | AI/service error           | Downstream service unavailable               |

### `DELETE /api/v1/cvs/:id`

Summary: Remove a saved CV from the candidate CV Library.

Auth:

- Required
- Roles: `CANDIDATE`

Success response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

Notes:

- This is a soft delete on `candidate_cvs.deleted_at`.
- The document-storage file is not physically deleted by this API.
- Deleted CVs are hidden from `GET /api/v1/candidates/me` aggregate response.
- Deleted CVs cannot be used for a new application snapshot.
- Existing applications keep their CV snapshot/history unchanged.
- If the deleted CV was default, candidate-service promotes the newest remaining active CV to default.
- Physical document cleanup is asynchronous and only starts from soft-deleted CVs.
- Default cleanup waits `CV_DOCUMENT_CLEANUP_DELETED_GRACE_DAYS=30` after candidate deletion.
- Candidate-service then asks application-service whether the CV document is still referenced by active or recently terminal applications.
- If there are no active applications and all `WITHDRAWN`/`REJECTED`/`CANCELLED` applications are older than `CV_DOCUMENT_CLEANUP_TERMINAL_APPLICATION_RETENTION_DAYS=180`, candidate-service calls document-storage-service to remove the MinIO object and soft-delete document metadata.

CV cleanup env:

| Env                                                       | Default   | Note                                                                      |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| `CV_DOCUMENT_CLEANUP_SWEEP_INTERVAL_MS`                   | `3600000` | Scheduler interval; minimum 60s                                           |
| `CV_DOCUMENT_CLEANUP_DELETED_GRACE_DAYS`                  | `30`      | Minimum age of `candidate_cvs.deleted_at` before physical cleanup can run |
| `CV_DOCUMENT_CLEANUP_TERMINAL_APPLICATION_RETENTION_DAYS` | `180`     | Retention window for `WITHDRAWN`/`REJECTED`/`CANCELLED` applications      |
| `CV_DOCUMENT_CLEANUP_BATCH_SIZE`                          | `50`      | Max soft-deleted CV documents checked per sweep                           |

Errors:

| Status | Code                       | Meaning                                      |
| ------ | -------------------------- | -------------------------------------------- |
| 401    | unauthorized               | Missing/invalid access token                 |
| 403    | forbidden                  | User role is not allowed                     |
| 404    | `APPLICATION.CV_NOT_FOUND` | CV does not exist, was deleted, or not owned |

## CV Template Editor

### Public CV template presets

These endpoints expose published system templates for the public `/cv-templates` page and the FE CV builder template picker. They are separate from `/cv-templates`, which stores candidate-owned CV drafts.

#### `GET /api/v1/cv-template-presets`

Auth: public.

Query:

| Field           | Required | Note                                                           |
| --------------- | -------- | -------------------------------------------------------------- |
| `category`      | No       | `all`, `it`, `marketing`, `sales`, `hr`; defaults to `all`     |
| `includeCanvas` | No       | `true`/`false`; defaults to `true` so FE can render/apply them |

Behavior:

- Returns only `PUBLISHED` and non-deleted presets.
- Sorts by `sortOrder ASC`, then `createdAt ASC`.
- `includeCanvas=false` returns `canvas: null`.

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "0bafc70d-8a1e-4e56-83f6-cc0d16bbf895",
      "key": "professional",
      "name": {
        "vi": "Chuyên nghiệp",
        "en": "Professional",
        "ja": "プロフェッショナル"
      },
      "description": {
        "vi": "Header màu nổi bật, bố cục 1 cột rõ ràng.",
        "en": "A polished one-column layout with a strong header.",
        "ja": "印象的なヘッダーを備えた明快な1カラム構成です。"
      },
      "categories": ["it", "marketing", "sales", "hr"],
      "accent": "#2563eb",
      "thumbnailUrl": null,
      "canvas": {
        "id": "template-professional",
        "name": "Professional",
        "pageSize": { "width": 794, "height": 1123 },
        "pages": []
      },
      "version": 1,
      "createdAt": "2026-08-05T00:00:00.000Z",
      "updatedAt": "2026-08-05T00:00:00.000Z"
    }
  ]
}
```

Errors:

| Status | Code                       | Meaning               |
| ------ | -------------------------- | --------------------- |
| 400    | `COMMON.VALIDATION_FAILED` | Invalid query         |
| 500    | `COMMON.INTERNAL_ERROR`    | Unexpected server bug |

#### `GET /api/v1/cv-template-presets/:idOrKey`

Auth: public.

Params:

| Field     | Required | Note                                |
| --------- | -------- | ----------------------------------- |
| `idOrKey` | Yes      | UUID preset id or key, e.g. `modern` |

Behavior:

- Returns only `PUBLISHED` and non-deleted presets.

Errors:

| Status | Code                           | Meaning                   |
| ------ | ------------------------------ | ------------------------- |
| 404    | `CV_TEMPLATE_PRESET.NOT_FOUND` | Published preset not found |
| 500    | `COMMON.INTERNAL_ERROR`        | Unexpected server bug     |

### Admin CV template presets

Auth: required, role `ADMIN`.

These endpoints manage the same `cv_template_presets` records used by public
`/api/v1/cv-template-presets`. Public pages only read `PUBLISHED` and
non-deleted presets; archived presets are soft-deleted and remain visible to
admin list/detail endpoints.

#### `GET /api/v1/admin/cv-template-presets`

Query:

| Field           | Type    | Default | Note                                  |
| --------------- | ------- | ------- | ------------------------------------- |
| `page`          | number  | `1`     | Pagination page                       |
| `limit`         | number  | `20`    | Max `100`                             |
| `search`        | string  | -       | Searches key, localized name, description |
| `status`        | enum    | `all`   | `all`, `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `category`      | enum    | `all`   | `all`, `it`, `marketing`, `sales`, `hr` |
| `includeCanvas` | boolean | `false` | Include full canvas JSON in list rows |

#### `POST /api/v1/admin/cv-template-presets`

Creates a draft preset. Admins only need `defaultName` and
`defaultDescription`; missing `vi`, `en`, or `ja` localized fields are filled
from those default values.

Request body:

```json
{
  "key": "professional",
  "defaultName": "Professional",
  "defaultDescription": "A polished one-column CV layout.",
  "name": {
    "vi": "Chuyên nghiệp"
  },
  "description": {
    "vi": "Bố cục CV một cột rõ ràng."
  },
  "categories": ["it", "marketing"],
  "accent": "#2563eb",
  "thumbnailUrl": "https://cdn.example.com/cv-template.png",
  "sortOrder": 10,
  "canvas": {
    "id": "template-professional",
    "name": "Professional",
    "pages": [
      {
        "id": "template-professional-page-1",
        "elements": []
      }
    ]
  }
}
```

Canvas validation is intentionally light for phase 1: `canvas` must be an
object with a non-empty `pages` array, and each page needs `id` plus an
`elements` array.

#### Admin actions

| Method | Path                                      | Behavior                        |
| ------ | ----------------------------------------- | ------------------------------- |
| `GET`  | `/api/v1/admin/cv-template-presets/:id`   | Detail with full canvas         |
| `PATCH` | `/api/v1/admin/cv-template-presets/:id`  | Update metadata, categories, thumbnail, canvas, sort order |
| `POST` | `/api/v1/admin/cv-template-presets/:id/publish` | Validate canvas and publish |
| `POST` | `/api/v1/admin/cv-template-presets/:id/archive` | Mark `ARCHIVED` and soft delete |
| `POST` | `/api/v1/admin/cv-template-presets/:id/restore` | Restore as `DRAFT` |
| `PATCH` | `/api/v1/admin/cv-template-presets/sort-order` | Bulk update sort order |

Errors:

| Status | Code                              | Meaning                      |
| ------ | --------------------------------- | ---------------------------- |
| 400    | `CV_TEMPLATE_PRESET.INVALID_CANVAS` | Canvas JSON is not usable   |
| 404    | `CV_TEMPLATE_PRESET.NOT_FOUND`    | Preset not found             |
| 409    | `CV_TEMPLATE_PRESET.KEY_CONFLICT` | `key` already exists         |

### `GET /api/v1/cv-templates/options`

Summary: Get supported template keys and fixed CV section keys.

Auth: required, role `CANDIDATE`.

Success response:

```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "key": "modern",
        "label": "Modern",
        "description": "Clean modern CV layout for product and engineering roles."
      },
      {
        "key": "classic",
        "label": "Classic",
        "description": "Traditional professional CV layout."
      },
      {
        "key": "minimal",
        "label": "Minimal",
        "description": "Simple ATS-friendly CV layout."
      }
    ],
    "sections": [
      "profile",
      "summary",
      "skills",
      "experiences",
      "educations",
      "projects",
      "certifications",
      "languages",
      "awards",
      "references"
    ],
    "sortableItemSections": [
      "skills",
      "experiences",
      "educations",
      "projects",
      "certifications",
      "languages",
      "awards",
      "references"
    ]
  }
}
```

### `POST /api/v1/cv-templates/from-cv`

Summary: Upload a CV, parse it, and create a saved template snapshot for the editor.

Auth: required, role `CANDIDATE`.

Request body: `multipart/form-data`

| Field         | Type   | Required | Note                           |
| ------------- | ------ | -------- | ------------------------------ |
| `file`        | file   | Yes      | PDF/DOC/DOCX; max 10 MB        |
| `templateKey` | enum   | Yes      | `modern`, `classic`, `minimal` |
| `name`        | string | No       | Max 255                        |

Important behavior:

- Does not create a `candidate_cvs` library row for the uploaded source file.
- Does not apply parsed data into candidate profile.
- Stores the uploaded source as `sourceDocumentId`.
- Stores parsed data into `contentSnapshot` so FE can render/edit without another Gemini call.
- After parse succeeds, candidate-service tries to delete the uploaded source document immediately.
- If source cleanup succeeds, `sourceDocumentId` is returned as `null` and `sourceDocumentDeletedAt` is set.
- If source cleanup fails, `sourceDocumentId` remains and candidate-service logs a warning for retry/audit.
- Supports template-only sections `languages`, `awards`, and `references`.

Success response:

```json
{
  "success": true,
  "data": {
    "id": "8b7c3b48-2f85-4d24-ae76-94ad31200ff5",
    "candidateId": "7e0e0bd7-ff3d-490b-9bbd-dfa697cbd8ef",
    "name": "Backend Engineer CV",
    "templateKey": "modern",
    "sourceDocumentId": null,
    "sourceDocumentDeletedAt": "2026-07-22T10:00:05.000Z",
    "sourceCvId": null,
    "sourceParseRequestId": "e12f44a5-5b0e-4fcf-88bb-d8f7168b54ed",
    "theme": {},
    "layout": {
      "sections": [
        { "key": "profile", "visible": true, "sortOrder": 1 },
        { "key": "summary", "visible": true, "sortOrder": 2 },
        { "key": "skills", "visible": true, "sortOrder": 3 }
      ]
    },
    "contentSnapshot": {
      "profile": {
        "id": "profile",
        "fullName": "Nguyen Minh Khoa",
        "headline": "Backend Developer",
        "visible": true
      },
      "skills": [
        {
          "id": "13ecb4bc-0cd1-4e37-bce4-58ca852799b3",
          "name": "NestJS",
          "visible": true,
          "sortOrder": 1
        }
      ],
      "languages": [],
      "awards": [],
      "references": []
    },
    "isDefault": false,
    "lastExportedCvId": null,
    "lastExportedAt": null,
    "createdAt": "2026-07-22T10:00:00.000Z",
    "updatedAt": "2026-07-22T10:00:00.000Z"
  }
}
```

### `POST /api/v1/cv-templates`

Summary: Create a CV template manually from empty state or current default profile data.

Auth: required, role `CANDIDATE`.

Request body:

```json
{
  "templateKey": "modern",
  "name": "Backend CV",
  "source": "DEFAULT",
  "theme": {},
  "layout": {
    "sections": [{ "key": "profile", "visible": true, "sortOrder": 1 }]
  },
  "contentSnapshot": {
    "profile": {
      "id": "profile",
      "fullName": "Nguyen Minh Khoa",
      "avatarDocumentId": null,
      "avatarUrl": null,
      "visible": true
    }
  }
}
```

Fields:

| Field             | Type   | Required | Note                                      |
| ----------------- | ------ | -------- | ----------------------------------------- |
| `templateKey`     | enum   | Yes      | `modern`, `classic`, `minimal`            |
| `name`            | string | No       | Max 255                                   |
| `source`          | enum   | No       | `EMPTY` or `DEFAULT`; defaults to `EMPTY` |
| `theme`           | object | No       | Optional initial theme                    |
| `layout`          | object | No       | Optional initial layout                   |
| `contentSnapshot` | object | No       | Optional initial content for autosave     |

Notes:

- `EMPTY` creates a blank template.
- `DEFAULT` fills from current candidate profile data, including candidate profile avatar if present.
- If `contentSnapshot` or `layout` is provided, it overrides the generated initial snapshot/layout. This supports autosave on the first user edit.
- Avatar URL is not persisted; BE resolves `avatarUrl` at response time from `avatarDocumentId`.

### `GET /api/v1/cv-templates`

Summary: List current candidate's saved CV templates.

Auth: required, role `CANDIDATE`.

### `GET /api/v1/cv-templates/:id`

Summary: Get template detail for editor rendering.

Auth: required, role `CANDIDATE`.

### `PATCH /api/v1/cv-templates/:id`

Summary: Save template metadata, theme, layout, or content snapshot.

Request body:

```json
{
  "name": "Backend CV July",
  "templateKey": "modern",
  "theme": {
    "font": "Inter",
    "accentColor": "#ef4444"
  },
  "layout": {
    "sections": [
      { "key": "profile", "visible": true, "sortOrder": 1 },
      { "key": "skills", "visible": true, "sortOrder": 2 }
    ]
  },
  "contentSnapshot": {},
  "isDefault": false
}
```

Validation:

- Section keys are fixed enum values.
- Missing sections are allowed.
- Unknown section keys are rejected.
- Duplicate section keys are rejected.

### `PATCH /api/v1/cv-templates/:id/sections/sort-order`

Summary: Bulk update top-level section order after drag/drop.

Request body:

```json
{
  "sectionKeys": ["profile", "skills", "projects", "experiences"]
}
```

Rules:

- FE may send only dragged/currently visible section keys.
- BE moves those sections first by request order.
- Existing sections not included are kept after the provided keys.
- Unknown or duplicate section keys are rejected.

### `PATCH /api/v1/cv-templates/:id/sections/:sectionKey/items/sort-order`

Summary: Bulk update item order inside a list section.

Allowed `sectionKey`: `skills`, `experiences`, `educations`, `projects`, `certifications`, `languages`, `awards`, `references`.

Request body:

```json
{
  "itemIds": ["project-3", "project-1", "project-2"]
}
```

Rules:

- `itemIds` must include every item currently in that section exactly once.
- Unknown, missing, or duplicate ids are rejected.
- `profile` and `summary` do not support item sort.

### `PATCH /api/v1/cv-templates/:id/avatar`

Summary: Upload or replace avatar for one CV template only.

Request body: `multipart/form-data`

| Field  | Type | Required | Note                                                 |
| ------ | ---- | -------- | ---------------------------------------------------- |
| `file` | file | Yes      | `image/jpeg`, `image/png`, or `image/webp`; max 5 MB |

Success response: `CvTemplateResponseDto`.

Behavior:

- Updates `contentSnapshot.profile.avatarDocumentId`.
- Returns runtime `contentSnapshot.profile.avatarUrl`.
- Does not update candidate profile avatar.
- Best-effort deletes the old template avatar document after the new avatar is saved.
- If old avatar cleanup fails, candidate-service logs a warning and still returns success.

### `POST /api/v1/cv-templates/:id/export`

Summary: Save an exported template file into the candidate CV library.

Request body: `multipart/form-data`

| Field       | Type    | Required | Note                                                     |
| ----------- | ------- | -------- | -------------------------------------------------------- |
| `file`      | file    | Yes      | PDF/DOC/DOCX exported by FE/template renderer; max 10 MB |
| `title`     | string  | No       | Defaults to template name or uploaded file name          |
| `isDefault` | boolean | No       | Defaults to `false`; when true, clears previous default  |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "bb4f26c9-2bb3-4177-8483-ff057db9f675",
    "documentId": "2f67a247-7ff0-4e50-bff7-a2dcfbf6de2e",
    "title": "Backend Engineer CV - Modern",
    "isDefault": false,
    "parseStatus": "NOT_PARSED",
    "source": "TEMPLATE_EXPORT",
    "sourceTemplateId": "8b7c3b48-2f85-4d24-ae76-94ad31200ff5",
    "sourceCvId": null,
    "parsedAt": null,
    "createdAt": "2026-07-22T10:00:00.000Z",
    "updatedAt": "2026-07-22T10:00:00.000Z"
  }
}
```

Notes:

- Export currently expects FE/template renderer to send the generated file.
- The saved export appears in candidate CV library and can be selected for job application.
- Candidate-service updates `candidate_cv_templates.lastExportedCvId` and `lastExportedAt`.

### `DELETE /api/v1/cv-templates/:id`

Summary: Soft-delete a saved CV template.

Success response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

### `GET /api/v1/saved-jobs`

Summary: List jobs saved by the current candidate.

Auth:

- Required
- Roles: `CANDIDATE`

Query: `page`, `limit`.

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "9d56926e-9583-47ec-8098-c21c85a7bbcc",
      "jobId": "d132e6a5-78a2-42e3-90e3-41199c920150",
      "title": "Backend Developer",
      "companyId": "390fe4c7-b65b-4780-ae87-79818cef8b6c",
      "companyName": "NexHire",
      "companyLogoUrl": "https://cdn.nexhire.vn/company/nexhire.png",
      "companyLogoDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
      "status": "PUBLISHED",
      "experienceLevel": "JUNIOR",
      "location": "Ha Noi",
      "salaryMin": 15000000,
      "salaryMax": 25000000,
      "salaryCurrency": "VND",
      "isSalaryVisible": true,
      "deadline": "2026-09-30T17:00:00.000Z",
      "publishedAt": "2026-07-15T10:00:00.000Z",
      "savedAt": "2026-07-16T10:00:00.000Z"
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

Notes:

- Saved jobs store a candidate-service snapshot for fast card rendering. FE should prefer `companyLogoDocumentId` for logo rendering and use `companyLogoUrl` as fallback.
- The current implementation saves only jobs that are public at save time.
- If the job later changes status, the saved record remains so the candidate does not lose history.
- On save, candidate-service calls job-service internal endpoint `GET /api/v1/internal/jobs/:id/saved-snapshot` using `x-internal-service-token`.

### `POST /api/v1/saved-jobs/:jobId`

Summary: Save a published job for the current candidate.

Auth:

- Required
- Roles: `CANDIDATE`

Rules:

- Idempotent: saving the same job again returns the existing saved job.
- Returns `409 JOB.JOB_NOT_PUBLIC` when the job is not currently public.

Success response: one saved-job object, same item shape as `GET /api/v1/saved-jobs`.

### `DELETE /api/v1/saved-jobs/:jobId`

Summary: Remove a saved job for the current candidate.

Auth:

- Required
- Roles: `CANDIDATE`

Rules:

- Idempotent: removing a job that is not saved still returns success.

Success response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

### `GET /api/v1/saved-jobs/status`

Summary: Batch-check which jobs are saved by the current candidate. Use this after loading a public job list to avoid one request per card.

Auth:

- Required
- Roles: `CANDIDATE`

Query:

| Field    | Type   | Required | Note                               |
| -------- | ------ | -------- | ---------------------------------- |
| `jobIds` | string | Yes      | Comma-separated UUIDs, max 100 ids |

Example:

```http
GET /api/v1/saved-jobs/status?jobIds=d132e6a5-78a2-42e3-90e3-41199c920150,0f78261e-775b-49ef-8990-8a27c2ff851f
```

Success response:

```json
{
  "success": true,
  "data": {
    "savedJobIds": ["d132e6a5-78a2-42e3-90e3-41199c920150"]
  }
}
```

FE card flow:

1. Load public jobs with `GET /api/v1/jobs`.
2. Send the returned job ids once to `GET /api/v1/saved-jobs/status?jobIds=...`.
3. Mark cards whose id appears in `savedJobIds`.

### `GET /api/v1/saved-jobs/:jobId/status`

Summary: Check whether the current candidate has saved a job.

Auth:

- Required
- Roles: `CANDIDATE`

Success response:

```json
{
  "success": true,
  "data": {
    "saved": true
  }
}
```

## Followed Companies

### `GET /api/v1/followed-companies`

Summary: List companies followed by the current candidate.

Auth:

- Required
- Roles: `CANDIDATE`

Query:

| Field   | Type   | Required | Default | Note        |
| ------- | ------ | -------- | ------- | ----------- |
| `page`  | number | No       | `1`     | 1-based     |
| `limit` | number | No       | `20`    | Max follows |

Success response:

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

### `POST /api/v1/followed-companies/:companyId`

Summary: Follow an approved company and receive in-app notifications when it publishes new jobs.

Auth:

- Required
- Roles: `CANDIDATE`

Rules:

- Idempotent: following the same company again returns the existing follow record.
- Candidate-service validates the company through company-service internal posting snapshot.
- `companyLogoUrl` is resolved by candidate-service through document-storage when `companyLogoDocumentId` exists; FE must not call internal document endpoints.
- Returns `409 JOB.COMPANY_NOT_APPROVED` when the company is not approved.

Success response: one followed-company object, same item shape as `GET /api/v1/followed-companies`.

### `DELETE /api/v1/followed-companies/:companyId`

Summary: Unfollow a company for the current candidate.

Auth:

- Required
- Roles: `CANDIDATE`

Rules:

- Idempotent: unfollowing a company that is not followed still returns success.

Success response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

### `GET /api/v1/followed-companies/status`

Summary: Batch-check which companies are followed by the current candidate. Use this after loading public company cards to avoid one request per card.

Auth:

- Required
- Roles: `CANDIDATE`

Query:

| Field        | Type   | Required | Note                                   |
| ------------ | ------ | -------- | -------------------------------------- |
| `companyIds` | string | Yes      | Comma-separated company UUIDs, max 100 |

Example:

```http
GET /api/v1/followed-companies/status?companyIds=22222222-2222-2222-2222-222222222222,33333333-3333-3333-3333-333333333333
```

Success response:

```json
{
  "success": true,
  "data": {
    "followedCompanyIds": ["22222222-2222-2222-2222-222222222222"]
  }
}
```

### `GET /api/v1/followed-companies/:companyId/status`

Summary: Check whether the current candidate follows one company.

Auth:

- Required
- Roles: `CANDIDATE`

Success response:

```json
{
  "success": true,
  "data": {
    "followed": true
  }
}
```

### New-job notification flow

1. Candidate follows an approved company.
2. Admin approves a job and job-service publishes `job.published`.
3. Candidate-service consumes `job.published`, finds followers by `companyId`, fetches public job snapshot, and publishes `company-follow.job-published`.
4. Notification-service consumes `company-follow.job-published` and creates one in-app notification per followed candidate.

## Service-to-service contracts used by candidate-service

Candidate-service depends on these internal contracts:

| Caller flow            | Target service             | Endpoint                                                                                | Purpose                                                               |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Profile email fallback | auth-service               | `GET /api/v1/internal/auth/users/:id/contact-snapshot`                                  | Use login email when `profile.contactEmail` is empty                  |
| Avatar/CV upload       | document-storage-service   | `POST /api/v1/documents/upload`                                                         | Store candidate avatar/CV documents                                   |
| Template CV parsing    | cv-parsing-service         | `POST /api/v1/internal/cv-parsing/template-fill`                                        | Parse uploaded CV into template snapshot without applying profile     |
| Deleted CV cleanup     | application-service        | `GET /api/v1/internal/applications/cv-documents/:documentId/retention`                  | Check whether application retention allows physical document deletion |
| Deleted CV cleanup     | document-storage-service   | `DELETE /api/v1/internal/documents/:id`                                                 | Remove MinIO object and soft-delete document metadata                 |
| Application creation   | candidate-service internal | `GET /api/v1/internal/candidates/users/:userId/cvs/:candidateCvId/application-snapshot` | Provide candidate/contact/CV snapshot to application-service          |
| CV parse trigger       | cv-parsing-service         | `POST /api/v1/internal/cv-parsing/parse`                                                | Create a parse request only when candidate asks for parsing           |
| Company follow         | company-service            | `GET /api/v1/internal/companies/:id/posting-snapshot`                                   | Validate company is approved and store follow snapshot                |
| Saved job creation     | job-service                | `GET /api/v1/internal/jobs/:id/saved-snapshot`                                          | Validate job is public and store job card snapshot                    |

Internal caller requirements:

- Must send `x-internal-service-token`.
- Must send identity headers used by internal guards: `x-user-id`, `x-user-role`.
- Internal responses still use the standard response envelope.
- Candidate-service should map downstream 404 from job-service to `JOB.JOB_NOT_FOUND`.
- Candidate-service should reject saving when job-service returns `isPublic = false` or `status != PUBLISHED`.

## Internal endpoints

### `GET /api/v1/internal/candidates/users/:userId/cvs/:candidateCvId/application-snapshot`

Internal only.

Summary: Get candidate/contact/CV snapshot for application-service before creating an application.

Auth:

- Required
- Internal service token header: `x-internal-service-token`

Success response:

```json
{
  "success": true,
  "data": {
    "candidateId": "d6dd534c-fd20-4cec-87c9-a6178e78f933",
    "candidateUserId": "f9ae2e14-f689-4a3e-8c2f-249776d0b650",
    "fullName": "Nguyen Minh Khoa",
    "email": "khoa.nguyen@example.com",
    "phone": "0912345678",
    "avatarDocumentId": "9615d6c2-7d51-41bf-b2e9-4133abfe7b86",
    "candidateCvId": "3c31a5db-870d-4f70-a589-0556f35b46d4",
    "cvDocumentId": "7bb46232-eb8d-40c8-ae0a-7e49ab98e26b",
    "cvTitle": "Backend Engineer CV",
    "cvParseStatus": "PARSED"
  }
}
```

Notes:

- `email` uses `profile.contactEmail` first, then falls back to auth-service login email.
- CV metadata is snapshotted for application display/history; later CV changes do not mutate existing application CV snapshots.

Errors:

| Status | Meaning                                |
| ------ | -------------------------------------- |
| 401    | Missing/invalid internal service token |
| 403    | Internal caller is not allowed         |
| 404    | Candidate profile or CV not found      |

### `POST /api/v1/internal/candidates/:candidateId/apply-parsed-resume`

Internal only.

Summary: Apply normalized parsed resume data into candidate profile sections after parsing.

Auth: internal service token.

### `POST /api/v1/internal/candidates/:candidateId/cvs/:candidateCvId/parse-failed`

Internal only.

Summary: Mark a CV parse attempt as failed.

Auth: internal service token.
