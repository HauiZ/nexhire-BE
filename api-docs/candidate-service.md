# Candidate Service API Docs

Base path through gateway:
- `/api/v1/candidates`
- `/api/v1/cvs`
- `/api/v1/saved-jobs`

Responsibility: candidate profile, skills, education, experience, CV Library, saved jobs.

## Domain notes

Candidate-service is being designed around:

- profile as source of truth,
- CV Library as saved CV references,
- profile update from CV only after user confirmation,
- parsing only for `PROFILE_UPDATE` or `MATCHING_APPLICATION` contexts.

## Endpoints

### `GET /api/v1/candidates/me`

Summary: Get the current candidate profile aggregate.

Auth:
- Required
- Roles: `CANDIDATE`

Headers:

| Header | Required | Note |
| ------ | -------- | ---- |
| `Authorization: Bearer <accessToken>` | Yes | Sent by FE to gateway |

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
      "headline": "Senior Frontend Engineer",
      "summary": "I build performant web products.",
      "location": "Ha Noi, Viet Nam",
      "portfolioUrl": "https://minhkhoa.dev",
      "linkedinUrl": "https://linkedin.com/in/minhkhoa",
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
    "defaultCv": null,
    "cvs": [],
    "completionPercent": 70
  }
}
```

Errors:

| Status | Code | Meaning |
| ------ | ---- | ------- |
| 401 | unauthorized | Missing/invalid access token |
| 403 | forbidden | User role is not allowed |

### `PATCH /api/v1/candidates/me`

Summary: Update the current candidate profile aggregate. Arrays in the request replace the corresponding aggregate section.

Auth:
- Required
- Roles: `CANDIDATE`

Headers:

| Header | Required | Note |
| ------ | -------- | ---- |
| `Authorization: Bearer <accessToken>` | Yes | Sent by FE to gateway |

Request body:

Top-level fields:

| Field | Type | Required | Note |
| ----- | ---- | -------- | ---- |
| `profile` | object | No | Omitted means keep current profile fields unchanged |
| `skills` | array | No | Omitted means keep current skills unchanged; empty array clears skills |
| `experiences` | array | No | Omitted means keep current experiences unchanged; empty array clears experiences |
| `educations` | array | No | Omitted means keep current educations unchanged; empty array clears educations |

`profile` fields:

| Field | Type | Required | Note |
| ----- | ---- | -------- | ---- |
| `fullName` | string | No | Max 255; blank string is stored as `null` |
| `phone` | string | No | Max 30; blank string is stored as `null` |
| `contactEmail` | string | No | Valid email, max 255; blank string is stored as `null` |
| `headline` | string | No | Max 255; blank string is stored as `null` |
| `summary` | string | No | Max 2000; blank string is stored as `null` |
| `location` | string | No | Max 255; blank string is stored as `null` |
| `portfolioUrl` | string | No | Full URL with protocol; blank string is stored as `null` |
| `linkedinUrl` | string | No | Full URL with protocol; blank string is stored as `null` |
| `openToWork` | boolean | No | Candidate availability flag |
| `visibility` | enum | No | `PUBLIC`, `PRIVATE` |
| `avatarDocumentId` | uuid | No | Document id for avatar; blank string is stored as `null` |

`skills[]` fields:

| Field | Type | Required | Note |
| ----- | ---- | -------- | ---- |
| `name` | string | Yes | Max 120, unique after normalization |
| `level` | enum | No | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT` |
| `yearsOfExperience` | number | No | 0-60, max 1 decimal place |

`experiences[]` fields:

| Field | Type | Required | Note |
| ----- | ---- | -------- | ---- |
| `companyName` | string | Yes | Max 255 |
| `position` | string | Yes | Max 255 |
| `employmentType` | enum | No | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE` |
| `startMonth` | number | No | 1-12; requires `startYear` if present |
| `startYear` | number | No | 1900-2100 |
| `endMonth` | number | No | 1-12; requires `endYear` if present |
| `endYear` | number | No | 1900-2100 |
| `isCurrent` | boolean | No | If true, end date is stored as `null` |
| `description` | string | No | Max 2000 |

`educations[]` fields:

| Field | Type | Required | Note |
| ----- | ---- | -------- | ---- |
| `schoolName` | string | Yes | Max 255 |
| `degree` | string | No | Max 255 |
| `fieldOfStudy` | string | No | Max 255 |
| `startYear` | number | No | 1900-2100 |
| `endYear` | number | No | 1900-2100 |
| `isCurrent` | boolean | No | If true, `endYear` is stored as `null` |
| `description` | string | No | Max 2000 |

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
  ]
}
```

Success response: same shape as `GET /api/v1/candidates/me`.

Allowed enums:

| Field | Values |
| ----- | ------ |
| `profile.visibility` | `PUBLIC`, `PRIVATE` |
| `skills[].level` | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT` |
| `experiences[].employmentType` | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE` |

Errors:

| Status | Code | Meaning |
| ------ | ---- | ------- |
| 400 | validation error | Invalid date/year/month or profile aggregate |
| 401 | unauthorized | Missing/invalid access token |
| 403 | forbidden | User role is not allowed |
| 409 | conflict | Duplicate skill/profile conflict |
| 422 | validation error | Invalid request body |
