# CV Parsing Service API Docs

Base path:

- Preferred internal service path: `/api/v1/internal/cv-parsing`
- These endpoints require `x-internal-service-token` and are intended for service-to-service calls.
- Manual/dev-only Gemini test endpoints live under `/api/v1/cv-parsing/manual`.

Responsibility: AI/NLP CV parsing.

Provider:

- Default provider: `GEMINI`.
- Optional fallback provider: `OPENAI` when `CV_PARSE_PROVIDER=OPENAI`.
- Gemini reads the CV document from the temporary signed `documentUrl`, extracts a strict JSON payload, normalizes it into shared `ParsedResume`, then applies it to candidate-service.
- Gemini parsing is most reliable with PDF files. DOC/DOCX can still be uploaded to the CV library, but parsing those formats may fail until a text extraction step is added.

## Endpoints

### `GET /api/v1/internal/cv-parsing/cvs/:candidateCvId/latest-result`

Summary: Return the latest parsed resume result for a candidate CV.

Auth:

- Required
- Internal service token only

Success response:

```json
{
  "success": true,
  "data": {
    "id": "parse-result-id",
    "parseRequestId": "parse-request-id",
    "candidateId": "candidate-id",
    "candidateCvId": "candidate-cv-id",
    "documentId": "document-id",
    "provider": "GEMINI",
    "providerVersion": "gemini-1.5-flash",
    "normalizedPayload": {
      "profile": {},
      "skills": [],
      "experiences": [],
      "educations": [],
      "certifications": [],
      "projects": []
    },
    "profileApplied": true,
    "createdAt": "2026-08-01T00:00:00.000Z"
  }
}
```

### `POST /api/v1/internal/cv-parsing/parse`

Summary: Create a CV parse request for asynchronous processing.

Auth:

- Required
- Internal call from candidate-service or trusted service
- Header: `x-internal-service-token`

Request body:

| Field               | Type | Required | Note                                                                       |
| ------------------- | ---- | -------- | -------------------------------------------------------------------------- |
| `candidateId`       | uuid | Yes      | Candidate profile id                                                       |
| `requestedByUserId` | uuid | Yes      | User id used for applying parsed profile                                   |
| `candidateCvId`     | uuid | No       | CV library record id; omitted for `TEMPLATE_FILL`                          |
| `documentId`        | uuid | Yes      | Uploaded document id                                                       |
| `documentUrl`       | url  | No       | Temporary signed file URL used by the parser provider                      |
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

| Env                              | Default                  | Note                                                 |
| -------------------------------- | ------------------------ | ---------------------------------------------------- |
| `CV_PARSE_PROVIDER`              | `GEMINI`                 | `GEMINI` or `OPENAI`                                 |
| `CV_PARSE_PERSIST_RAW_PAYLOAD`   | `false`                  | Whether to store raw provider payload in DB          |
| `GEMINI_API_KEY`                 | empty                    | Required when provider is `GEMINI`                   |
| `GEMINI_MODEL`                   | `gemini-3.5-flash`       | Legacy fallback; admin DB config has priority        |
| `GEMINI_MAX_OUTPUT_TOKENS`       | `8192`                   | Max JSON output tokens; increase for long CVs        |
| `GEMINI_PARSE_RETRY_ATTEMPTS`    | `0`                      | Retry count when Gemini returns invalid JSON         |
| `GEMINI_TIMEOUT_MS`              | `60000`                  | Timeout for fetching the signed CV document          |
| `GEMINI_PROVIDER_VERSION`        | same as `GEMINI_MODEL`   | Stored in `providerVersion` for audit                |
| `OPENAI_API_KEY`                 | empty                    | Required only when provider is `OPENAI`              |
| `OPENAI_BASE_URL`                | `https://modelapi.vn/v1` | OpenAI-compatible Responses API base URL             |
| `OPENAI_MODEL`                   | `gpt-5.5`                | Legacy fallback; admin DB config has priority        |
| `OPENAI_MAX_OUTPUT_TOKENS`       | `8192`                   | Max structured JSON output tokens                    |
| `OPENAI_TIMEOUT_MS`              | `60000`                  | OpenAI HTTP timeout                                  |
| `OPENAI_LOG_PROVIDER_ERROR_BODY` | `false`                  | Log raw provider error body for local debugging only |
| `OPENAI_PROVIDER_VERSION`        | same as `OPENAI_MODEL`   | Stored in `providerVersion` when using OpenAI        |

## Admin AI Management

Base path through gateway: `/api/v1/admin/ai-configs`

Auth:

- Required
- Roles: `ADMIN`

### `GET /api/v1/admin/ai-configs`

Summary: Get the active CV parsing provider/model and supported model whitelist.

Success response:

```json
{
  "success": true,
  "data": {
    "currentConfig": {
      "activeProvider": "GEMINI",
      "geminiModel": "gemini-3.5-flash",
      "openAiModel": "gpt-5.5",
      "updatedByUserId": null,
      "updatedAt": null
    },
    "supportedModels": {
      "GEMINI": [
        {
          "id": "gemini-3.5-flash",
          "name": "Gemini 3.5 Flash",
          "isDefault": true
        }
      ],
      "OPENAI": [
        {
          "id": "gpt-4o-mini",
          "name": "GPT-4o Mini",
          "isDefault": false
        },
        {
          "id": "gpt-5.5",
          "name": "GPT-5.5 Compatible",
          "isDefault": true
        }
      ]
    }
  }
}
```

### `PUT /api/v1/admin/ai-configs`

Summary: Update the active provider and model config used by future parse requests.

Request body:

| Field            | Type | Required | Note                           |
| ---------------- | ---- | -------- | ------------------------------ |
| `activeProvider` | enum | No       | `GEMINI` or `OPENAI`           |
| `geminiModel`    | text | No       | Must be in supported whitelist |
| `openAiModel`    | text | No       | Must be in supported whitelist |

Example:

```json
{
  "activeProvider": "OPENAI",
  "geminiModel": "gemini-3.5-flash",
  "openAiModel": "gpt-5.5"
}
```

Notes:

- Gemini remains the env fallback/default provider.
- Config is stored in `cv-parsing-service.ai_system_configs`.
- API keys are never stored in this table; keep them in environment variables.
- OpenAI-compatible base URLs must support `POST /responses` and `input_file` payloads for CV parsing.

### `GET /api/v1/admin/ai-configs/usage-summary`

Summary: Get AI parsing usage grouped by provider/model for the last 30 days.

Success response:

```json
{
  "success": true,
  "data": [
    {
      "provider": "OPENAI",
      "model": "gpt-5.5",
      "totalRequests": 12,
      "succeededRequests": 10,
      "failedRequests": 2,
      "inputTokens": 12345,
      "outputTokens": 2345,
      "totalTokens": 14690,
      "estimatedCostUsd": "0.116033",
      "pricing": {
        "currency": "USD",
        "inputUsdPerMillionTokens": 5,
        "outputUsdPerMillionTokens": 30,
        "multiplier": 0.9,
        "formula": "((inputTokens * inputUsdPerMillionTokens) + (outputTokens * outputUsdPerMillionTokens)) / 1000000 * multiplier"
      }
    }
  ]
}
```

Notes:

- Usage rows are stored in `cv-parsing-service.ai_usage_logs`.
- Token fields are nullable at row level because provider-compatible endpoints may not return usage metadata.
- `gpt-5.5` cost is estimated from the current compatible-provider rate: input `$5 / 1M tokens`, output `$30 / 1M tokens`, multiplier `0.9`.
- Other models keep `estimatedCostUsd = null` until pricing is configured.

### `GET /api/v1/admin/ai-configs/usage-logs`

Summary: List individual AI usage rows for admin audit/debug tables.

Query:

| Field           | Type | Required | Note                                |
| --------------- | ---- | -------- | ----------------------------------- |
| `page`          | int  | No       | Default `1`                         |
| `limit`         | int  | No       | Default `20`, max `100`             |
| `provider`      | enum | No       | `GEMINI` or `OPENAI`                |
| `model`         | text | No       | Exact model id, e.g. `gpt-5.5`      |
| `status`        | enum | No       | `SUCCEEDED` or `FAILED`             |
| `candidateCvId` | uuid | No       | Filter by uploaded candidate CV row |
| `from`          | ISO  | No       | Inclusive `createdAt` lower bound   |
| `to`            | ISO  | No       | Inclusive `createdAt` upper bound   |

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "usage-log-id",
      "parseRequestId": "parse-request-id",
      "candidateId": "candidate-id",
      "candidateCvId": "candidate-cv-id",
      "context": "PROFILE_UPDATE",
      "provider": "OPENAI",
      "model": "gpt-5.5",
      "operation": "CV_PARSE",
      "status": "SUCCEEDED",
      "latencyMs": 19123,
      "inputTokens": 6976,
      "outputTokens": 758,
      "totalTokens": 7734,
      "estimatedCostUsd": "0.051858",
      "errorCode": null,
      "errorMessage": null,
      "metadata": null,
      "createdAt": "2026-08-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```
