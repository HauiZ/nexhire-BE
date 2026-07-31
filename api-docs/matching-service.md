# Matching Service API Docs

Base path through gateway:
- `/api/v1/matching`

Responsibility: CV-JD matching request queue and fit score calculation.

Implementation note:

- `matching-service` is a Python/FastAPI service inside the monorepo.
- It owns `matching_service_db`.
- It does not read other service databases directly.
- It consumes events and calls internal snapshot endpoints when it needs job/CV data.

## Endpoints

### Internal only: `POST /api/v1/matching/applications/:applicationId/requests`

Summary: Create a match request for one application after the caller has already verified ownership.

Auth:

- Internal service token only.
- FE should not call this endpoint directly.
- Recruiter manual flow should call `POST /api/v1/recruiter/applications/:id/match`.
- Request body must identify the application/job/candidate/CV pair.

Request body:

```json
{
  "applicationId": "application-id",
  "jobId": "job-id",
  "candidateId": "candidate-id",
  "candidateUserId": "candidate-user-id",
  "candidateCvId": "candidate-cv-id",
  "cvDocumentId": "document-id",
  "requestedByUserId": "recruiter-user-id"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "id": "match-request-id",
    "applicationId": "application-id",
    "status": "PENDING",
    "requestType": "RECRUITER_MANUAL"
  }
}
```

The background worker processes pending requests, stores `match_results`, then publishes `matching.completed`.

## Events

### Consumes `application.submitted`

The matching service creates an `AUTO_APPLICATION` match request.

Required payload fields:

```json
{
  "applicationId": "application-id",
  "jobId": "job-id",
  "candidateId": "candidate-id",
  "candidateUserId": "candidate-user-id",
  "candidateCvId": "candidate-cv-id",
  "cvDocumentId": "document-id",
  "submittedAt": "2026-07-31T00:00:00.000Z"
}
```

### Publishes `matching.completed`

`application-service` consumes this event and updates `applications.match_score` / `match_level`.

```json
{
  "matchResultId": "match-result-id",
  "matchRequestId": "match-request-id",
  "applicationId": "application-id",
  "jobId": "job-id",
  "candidateId": "candidate-id",
  "candidateCvId": "candidate-cv-id",
  "totalScore": 82,
  "matchLevel": "HIGH",
  "explanation": {
    "matchedSkills": ["nestjs", "postgres"],
    "missingSkills": ["redis"],
    "strongSignals": ["Candidate matches most required skills"],
    "weakSignals": [],
    "recommendation": "GOOD_FIT"
  },
  "matchedAt": "2026-07-31T00:00:01.000Z"
}
```

## Internal Snapshot Dependencies

Matching calls:

- `GET /api/v1/internal/jobs/:id/matching-snapshot`
- `GET /api/v1/internal/candidates/:candidateId/matching-snapshot?candidateCvId=:candidateCvId`

Use the template from [README.md](README.md#endpoint-section-template).
