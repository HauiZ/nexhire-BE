# CV Parsing Service API Docs

Base path:

- Internal service path: `/api/v1/cv-parsing`
- These endpoints require `x-internal-service-token` and are intended for service-to-service calls.

Responsibility: AI/NLP CV parsing.

## Endpoints

### `POST /api/v1/cv-parsing/parse`

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
| `candidateCvId`     | uuid | Yes      | CV library record id                                      |
| `documentId`        | uuid | Yes      | Uploaded document id                                      |
| `documentUrl`       | url  | No       | File URL used by Skima parser                             |
| `context`           | enum | Yes      | `PROFILE_UPDATE`, `MATCHING_APPLICATION`, `MANUAL_REVIEW` |

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
    "provider": "SKIMA",
    "providerVersion": null,
    "createdAt": "2026-07-15T10:00:00.000Z"
  }
}
```

### `POST /api/v1/cv-parsing/requests/:id/complete`

Summary: Persist a normalized parsed CV result and apply it to the candidate profile.

Auth:

- Required
- Internal call from parser worker or trusted service
- Header: `x-internal-service-token`

Request body:

| Field                | Type   | Required | Note                                              |
| -------------------- | ------ | -------- | ------------------------------------------------- |
| `normalizedPayload`  | object | Yes      | `ParsedResume` shape from `@nexhire/shared`       |
| `rawProviderPayload` | object | No       | Stored only when `SKIMA_PERSIST_RAW_PAYLOAD=true` |
| `confidence`         | object | No       | Optional parser confidence metadata               |

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
    "provider": "SKIMA",
    "providerVersion": null,
    "normalizedPayload": {},
    "profileApplied": true,
    "createdAt": "2026-07-15T10:01:00.000Z"
  }
}
```
