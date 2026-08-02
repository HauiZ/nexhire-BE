# Matching Service API Docs

Base path through gateway:
- `/api/v1/matching`

Responsibility: CV-JD matching request queue and fit score calculation.

Implementation note:

- `matching-service` is a Python/FastAPI service inside the monorepo.
- It owns `matching_service_db`.
- It does not read other service databases directly.
- It processes match requests created by application-service after the applied CV is parsed.
- Match requests may include a parsed CV snapshot from cv-parsing-service.
- It uses hybrid scoring: deterministic profile signals plus optional sentence-transformer semantic similarity.

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

## AI/NLP Scoring

Matching-service uses a hybrid scorer:

- deterministic signals: required skills, estimated years of experience, education, location, and level fit;
- semantic signal: job text is compared with parsed resume text through `sentence-transformers`;
- fallback signal: if the embedding dependency/model is unavailable, the service falls back to lexical overlap and continues processing.

Relevant env:

```env
MATCHING_ENABLE_SEMANTIC_SCORING=true
MATCHING_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
MATCHING_SEMANTIC_MIN_SIGNAL=0.35
```

Install/update Python dependencies:

```bash
npm run matching:install
```

## Matching Prerequisite Flow

`application-service` owns the decision to request matching:

- if the applied CV is already `PARSED`, application-service fetches the latest parsed result from cv-parsing-service and creates a match request immediately;
- if the applied CV is not parsed yet, application-service asks candidate-service to trigger CV parsing and waits for `cv.parsed`;
- after `cv.parsed`, application-service creates the match request with the parsed resume snapshot.

The request body may include:

```json
{
  "requestType": "AUTO_APPLICATION",
  "parsedResume": {
    "profile": {},
    "skills": [],
    "experiences": [],
    "educations": [],
    "certifications": [],
    "projects": []
  }
}
```

Matching-service no longer consumes `application.submitted` directly, to avoid scoring an unparsed CV.

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
    "recommendation": "GOOD_FIT",
    "decision": "REVIEW_MANUALLY",
    "priority": "HIGH",
    "summary": "Candidate looks promising, but recruiter should verify gaps before shortlisting.",
    "nextActions": ["Review CV details before shortlisting"],
    "riskFlags": []
  },
  "matchedAt": "2026-07-31T00:00:01.000Z"
}
```

Decision support fields are recruiter-facing hints:

- `recommendation`: score band, useful for filtering;
- `decision`: suggested recruiter action: `SHORTLIST`, `REVIEW_MANUALLY`, `KEEP_WARM`, or `REJECT`;
- `priority`: queue priority hint: `HIGH`, `NORMAL`, or `LOW`;
- `nextActions`: concrete follow-up checks;
- `riskFlags`: machine-readable reasons that need attention.

## Internal Snapshot Dependencies

Matching calls:

- `GET /api/v1/internal/jobs/:id/matching-snapshot`
- `GET /api/v1/internal/candidates/:candidateId/matching-snapshot?candidateCvId=:candidateCvId`

Use the template from [README.md](README.md#endpoint-section-template).
