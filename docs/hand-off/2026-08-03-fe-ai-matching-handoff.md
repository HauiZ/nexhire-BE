# FE Hand-off: AI CV Matching

This document explains what FE receives today and how to display the AI matching flow.

## Main FE Endpoints

### Candidate applies to a job

```http
POST /api/v1/applications
```

The response is the normal application response object. AI matching is async, so FE must not expect `matchScore` immediately.

Important fields:

```json
{
  "id": "application-id",
  "candidateCvId": "candidate-cv-id",
  "cvParseStatus": "PARSING",
  "status": "SUBMITTED",
  "matchScore": null,
  "matchLevel": null
}
```

### Recruiter requests fresh matching

```http
POST /api/v1/recruiter/applications/:id/match
```

If the CV is already parsed, BE creates a matching request:

```json
{
  "id": "match-request-id",
  "applicationId": "application-id",
  "status": "PENDING",
  "requestType": "RECRUITER_MANUAL"
}
```

If the CV must be parsed first:

```json
{
  "id": null,
  "applicationId": "application-id",
  "status": "WAITING_FOR_CV_PARSE",
  "requestType": "RECRUITER_MANUAL"
}
```

FE should show a waiting state and refresh the application list/detail after a short delay.

## Application Response Fields

Recruiter application list/detail responses expose the AI score through:

```json
{
  "cvParseStatus": "PARSED",
  "matchScore": 82,
  "matchLevel": "HIGH"
}
```

Recruiter application detail also exposes the AI recommendation fields:

```json
{
  "matchRecommendation": "GOOD_FIT",
  "matchDecision": "REVIEW_MANUALLY",
  "matchPriority": "HIGH",
  "matchSummary": "Candidate looks promising, but recruiter should verify gaps before shortlisting.",
  "matchMatchedSkills": ["nestjs", "postgres"],
  "matchMissingSkills": ["redis"],
  "matchNextActions": [
    "Review CV details before shortlisting",
    "Check whether missing skills are covered by related experience: redis"
  ],
  "matchRiskFlags": []
}
```

Application lifecycle/timeline fields are documented separately in `docs/hand-off/2026-08-03-application-progress-fe-handoff.md`.

## AI Recommendation Actions

The actions shown in matching-service code are generated as `explanation.nextActions`.
They are AI recommendations for recruiters, not application lifecycle/timeline events.

Example internal matching result:

```json
{
  "totalScore": 82,
  "matchLevel": "HIGH",
  "explanation": {
    "matchedSkills": ["nestjs", "postgres"],
    "missingSkills": ["redis"],
    "recommendation": "GOOD_FIT",
    "decision": "REVIEW_MANUALLY",
    "priority": "HIGH",
    "summary": "Candidate looks promising, but recruiter should verify gaps before shortlisting.",
    "nextActions": [
      "Review CV details before shortlisting",
      "Check whether missing skills are covered by related experience: redis"
    ],
    "riskFlags": []
  }
}
```

Where this data exists today:

| Location | Has `nextActions`? | FE can access today? |
| -------- | ------------------ | -------------------- |
| matching-service `match_results.explanation` | Yes | No direct FE endpoint; application-service reads it internally. |
| RabbitMQ `matching.completed` event | Yes | No, FE does not consume RabbitMQ. |
| recruiter application detail response | Yes, mapped as `matchNextActions` | Yes: `GET /api/v1/recruiter/applications/:id`. |
| recruiter application list response | No full recommendation | Currently only score/level. |
| candidate application response | No | Candidate does not see AI review/recommendation for now. |

So today FE can render `matchNextActions` from recruiter application detail, but not from candidate screens or recruiter list.

Recommended FE-facing field names should use the `match` prefix so they do not conflict with other application fields:

```json
{
  "matchScore": 82,
  "matchLevel": "HIGH",
  "matchRecommendation": "GOOD_FIT",
  "matchDecision": "REVIEW_MANUALLY",
  "matchPriority": "HIGH",
  "matchSummary": "Candidate looks promising, but recruiter should verify gaps before shortlisting.",
  "matchMatchedSkills": ["nestjs", "postgres"],
  "matchMissingSkills": ["redis"],
  "matchNextActions": [
    "Review CV details before shortlisting",
    "Check whether missing skills are covered by related experience: redis"
  ],
  "matchRiskFlags": []
}
```

Recommended mapping from matching-service result to FE fields:

| Matching-service field | Recommended FE/application field |
| ---------------------- | -------------------------------- |
| `totalScore` | `matchScore` |
| `matchLevel` | `matchLevel` |
| `explanation.recommendation` | `matchRecommendation` |
| `explanation.decision` | `matchDecision` |
| `explanation.priority` | `matchPriority` |
| `explanation.summary` | `matchSummary` |
| `explanation.matchedSkills` | `matchMatchedSkills` |
| `explanation.missingSkills` | `matchMissingSkills` |
| `explanation.nextActions` | `matchNextActions` |
| `explanation.riskFlags` | `matchRiskFlags` |

Current values FE should handle:

| Field | Values | FE behavior |
| ----- | ------ | ----------- |
| `cvParseStatus` | `NOT_PARSED` | Matching has not started parsing yet. Recruiter can click match. |
| `cvParseStatus` | `PARSING` | Show "Analyzing CV..." / loading badge. Disable duplicate match request or show waiting state. |
| `cvParseStatus` | `PARSED` | CV parse is ready. If `matchScore` is null, matching may still be pending. |
| `cvParseStatus` | `FAILED` | Show "CV analysis failed" and allow recruiter retry through `POST /match`. |
| `matchScore` | `null` | No score available yet. Show pending/empty state, not 0. |
| `matchScore` | `0..100` | Show score badge/bar. |
| `matchLevel` | `LOW`, `MEDIUM`, `HIGH`, `EXCELLENT`, `null` | Use as score label. If null but score exists, FE can derive visually or show score only. |

Recommended display bands:

| `matchLevel` | UI label |
| ------------ | -------- |
| `EXCELLENT` | Excellent match |
| `HIGH` | Strong match |
| `MEDIUM` | Partial match |
| `LOW` | Low match |
| `null` | Not scored |

## Current Async Flow

1. Candidate applies with a CV.
2. Application-service stores the application snapshot.
3. If the CV parse result already exists, application-service sends the parsed resume to matching-service immediately.
4. If the CV is not parsed, application-service asks candidate-service to trigger CV parsing.
5. Candidate-service publishes `cv.uploaded`.
6. Cv-parsing-service parses the CV and publishes `cv.parsed` or `cv.parse-failed`.
7. Application-service consumes that event:
   - `cv.parsed`: marks application CV as `PARSED` and creates a matching request.
   - `cv.parse-failed`: marks waiting application CV as `FAILED`.
8. Matching-service processes pending matching requests in the background.
9. Matching-service publishes `matching.completed`.
10. Application-service consumes `matching.completed`:
    - `status=SUCCEEDED`: updates `matchScore` and `matchLevel`.
    - `status=FAILED`: logs the failure and keeps the previous score unchanged.

## FE Polling Recommendation

There is no websocket/SSE contract for this flow yet. FE should poll application list/detail after apply or manual match.

Suggested polling:

- poll every 3-5 seconds while `cvParseStatus=PARSING` or `matchScore=null`;
- stop after 60-90 seconds and show "Still processing, refresh later";
- stop immediately when `matchScore` becomes a number or `cvParseStatus=FAILED`.

## What FE Should Show

### Candidate application detail

Candidate-facing UI should not show AI review/recommendation in this phase.

For candidate application timeline, use `docs/hand-off/2026-08-03-application-progress-fe-handoff.md`.

### Recruiter application list

Recruiter-facing UI should show:

- score column: `matchScore` and `matchLevel`;
- loading badge when `cvParseStatus=PARSING`;
- "Not scored" when `matchScore=null` and CV is not parsing;
- retry action when `cvParseStatus=FAILED` or recruiter wants a fresh score.

### Recruiter application detail

Display:

- `matchScore`;
- `matchLevel`;
- `matchRecommendation`;
- `matchDecision`;
- `matchPriority`;
- `matchSummary`;
- `matchMatchedSkills`;
- `matchMissingSkills`;
- `matchNextActions`;
- `matchRiskFlags`;
- CV parse status;
- button: "Run AI match" calls `POST /api/v1/recruiter/applications/:id/match`.

Button states:

| Condition | Button behavior |
| --------- | --------------- |
| `cvParseStatus=PARSING` | Disable or show "Analyzing CV..." |
| manual match response `PENDING` | Show "Scoring..." and poll |
| manual match response `WAITING_FOR_CV_PARSE` | Show "Analyzing CV..." and poll |
| `cvParseStatus=FAILED` | Enable retry |
| `matchScore` exists | Enable "Refresh AI match" |

## Important Notes

- FE should never call matching-service internal endpoint directly.
- FE should call recruiter manual endpoint: `POST /api/v1/recruiter/applications/:id/match`.
- `matchScore=null` means "not available yet", not bad fit.
- `cvParseStatus=FAILED` means CV parsing failed before matching could run.
- Matching failure after parsing currently does not expose a dedicated application field. The previous score remains unchanged; if there was no previous score, FE will continue seeing `matchScore=null`.
- The AI suggestion actions are exposed to recruiter detail as `matchNextActions`.
- Application lifecycle/timeline docs are in `docs/hand-off/2026-08-03-application-progress-fe-handoff.md`.
