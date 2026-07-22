# CV Parsing Service API Docs

Base path:

- Preferred internal service path: `/api/v1/internal/cv-parsing`
- These endpoints require `x-internal-service-token` and are intended for service-to-service calls.
- Manual/dev-only Gemini test endpoints live under `/api/v1/cv-parsing/manual`.

Responsibility: AI/NLP CV parsing.

Provider:

- Default provider: `GEMINI`.
- Optional fallback provider: `SKIMA` when `CV_PARSE_PROVIDER=SKIMA`.
- Gemini reads the CV document from the temporary signed `documentUrl`, extracts a strict JSON payload, normalizes it into shared `ParsedResume`, then applies it to candidate-service.
- Gemini parsing is most reliable with PDF files. DOC/DOCX can still be uploaded to the CV library, but parsing those formats may fail until a text extraction step is added.

## Endpoints

### `POST /api/v1/internal/cv-parsing/parse`

Summary: Create a CV parse request for asynchronous processing.

Auth:

- Required
- Internal call from candidate-service or trusted service
- Header: `x-internal-service-token`

Request body:

| Field               | Type | Required | Note                                                      |
| ------------------- | ---- | -------- | --------------------------------------------------------- |
| `candidateId`       | uuid | Yes      | Candidate profile id                                      |
| `requestedByUserId` | uuid | Yes      | User id used for applying parsed profile                  |
| `candidateCvId`     | uuid | No       | CV library record id; omitted for `TEMPLATE_FILL`         |
| `documentId`        | uuid | Yes      | Uploaded document id                                      |
| `documentUrl`       | url  | No       | Temporary signed file URL used by the parser provider     |
| `context`           | enum | Yes      | `PROFILE_UPDATE`, `TEMPLATE_FILL`, `MATCHING_APPLICATION`, `MANUAL_REVIEW` |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "e12f44a5-5b0e-4fcf-88bb-d8f7168b54ed",
    "candidateId": "b8b33c46-4bb0-4a33-8b0d-927e081a38a5",
    "requestedByUserId": "9e0f9786-4b63-4b29-9f80-59c2d7bc6cc5",
    "candidateCvId": "bb4f26c9-2bb3-4177-8483-ff057db9f675",
    "documentId": "2f67a247-7ff0-4e50-bff7-a2dcfbf6de2e",
    "context": "PROFILE_UPDATE",
    "status": "QUEUED",
    "provider": "GEMINI",
    "providerVersion": "gemini-3.5-flash",
    "createdAt": "2026-07-15T10:00:00.000Z"
  }
}
```

### `POST /api/v1/internal/cv-parsing/requests/:id/complete`

Summary: Persist a normalized parsed CV result and apply it to the candidate profile.

Auth:

- Required
- Internal call from parser worker or trusted service
- Header: `x-internal-service-token`

Request body:

| Field                | Type   | Required | Note                                                |
| -------------------- | ------ | -------- | --------------------------------------------------- |
| `normalizedPayload`  | object | Yes      | `ParsedResume` shape from `@nexhire/shared`         |
| `rawProviderPayload` | object | No       | Stored only when raw payload persistence is enabled |
| `confidence`         | object | No       | Optional parser confidence metadata                 |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "7fe45c31-0c44-4f2d-b071-25f7f5adf7a0",
    "parseRequestId": "e12f44a5-5b0e-4fcf-88bb-d8f7168b54ed",
    "candidateId": "b8b33c46-4bb0-4a33-8b0d-927e081a38a5",
    "candidateCvId": "bb4f26c9-2bb3-4177-8483-ff057db9f675",
    "documentId": "2f67a247-7ff0-4e50-bff7-a2dcfbf6de2e",
    "provider": "GEMINI",
    "providerVersion": "gemini-3.5-flash",
    "normalizedPayload": {},
    "profileApplied": true,
    "createdAt": "2026-07-15T10:01:00.000Z"
  }
}
```

Notes:

- This endpoint is not for FE.
- It is intended for a parser worker/trusted service that already has a normalized `ParsedResume`.
- Calling it persists the result.
- It applies parsed resume back into candidate-service only when request context is `PROFILE_UPDATE` and `candidateCvId` is present.

### `POST /api/v1/internal/cv-parsing/template-fill`

Summary: Parse a CV synchronously for CV template filling without applying candidate profile.

Auth:

- Required
- Internal call from candidate-service
- Header: `x-internal-service-token`

Request body:

| Field               | Type | Required | Note                              |
| ------------------- | ---- | -------- | --------------------------------- |
| `candidateId`       | uuid | Yes      | Candidate profile id              |
| `requestedByUserId` | uuid | Yes      | Current candidate user id         |
| `candidateCvId`     | uuid | No       | Usually omitted for template fill |
| `documentId`        | uuid | Yes      | Source document id                |
| `documentUrl`       | url  | Yes      | Temporary signed file URL         |
| `context`           | enum | Yes      | Sent as `TEMPLATE_FILL`           |

Success response:

```json
{
  "success": true,
  "data": {
    "id": "7fe45c31-0c44-4f2d-b071-25f7f5adf7a0",
    "parseRequestId": "e12f44a5-5b0e-4fcf-88bb-d8f7168b54ed",
    "candidateId": "b8b33c46-4bb0-4a33-8b0d-927e081a38a5",
    "candidateCvId": null,
    "documentId": "2f67a247-7ff0-4e50-bff7-a2dcfbf6de2e",
    "provider": "GEMINI",
    "providerVersion": "gemini-3.5-flash",
    "normalizedPayload": {},
    "profileApplied": false,
    "createdAt": "2026-07-22T10:01:00.000Z"
  }
}
```

## Environment

| Env                            | Default                | Note                                          |
| ------------------------------ | ---------------------- | --------------------------------------------- |
| `CV_PARSE_PROVIDER`            | `GEMINI`               | `GEMINI` or `SKIMA`                           |
| `CV_PARSE_PERSIST_RAW_PAYLOAD` | `false`                | Whether to store raw provider payload in DB   |
| `GEMINI_API_KEY`               | empty                  | Required when provider is `GEMINI`            |
| `GEMINI_MODEL`                 | `gemini-3.5-flash`     | Model used for CV parsing                     |
| `GEMINI_MAX_OUTPUT_TOKENS`     | `8192`                 | Max JSON output tokens; increase for long CVs |
| `GEMINI_PARSE_RETRY_ATTEMPTS`  | `0`                    | Retry count when Gemini returns invalid JSON  |
| `GEMINI_TIMEOUT_MS`            | `60000`                | Timeout for fetching the signed CV document   |
| `GEMINI_PROVIDER_VERSION`      | same as `GEMINI_MODEL` | Stored in `providerVersion` for audit         |
| `SKIMA_API_KEY`                | empty                  | Required only when provider is `SKIMA`        |
| `SKIMA_BASE_URL`               | `https://api.skima.ai` | Skima API base URL                            |
| `SKIMA_PARSE_PATH`             | `/resume/parse`        | Skima parse endpoint path                     |
| `SKIMA_TIMEOUT_MS`             | `30000`                | Skima HTTP timeout                            |
| `SKIMA_PROVIDER_VERSION`       | empty                  | Stored in `providerVersion` when using Skima  |
