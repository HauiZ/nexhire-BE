# Matching Service API Docs

## HR display deduplication (2026-10-26)

Evidence-quality diagnostic `AI1_CLOSEOUT_013` found a separate limitation:
faithful citations can still be weak or wrong-task evidence. In four designed
synthetic CVs, bare tool queries confused SQL/NoSQL and AWS/Azure; a course-only
Azure self-tag scored100 while its limiting context fell outside Top3. The
existing negation cue did not flag the explicit denial forms in those fixtures.
One controlled task-rich query comparison recovered more work/course/denial
context but did not establish competence or solve cross-tool confusion. No
production query policy, weights, thresholds, dataset or API schema changed.
See [current AI1 acceptance](../training/ai1/AI1_ACCEPTANCE.md) and its single
synthetic paired receipt; this is not a representative accuracy estimate.

The FE may omit a redundant whole-component section when its text, single-item
logic, evidence (including raw scores/provenance), suggestions, retrieval state
and reason codes match the parent requirement. Its importance and technical ID
remain available. Other components retain their distinct metadata and warnings;
an identical evidence array references the parent passages instead of repeating
the same quote controls. Different evidence remains accessible. Single-component
logic does not display a redundant AND/OR explanation. Default relevance values
are rounded to one decimal; raw values remain in technical details. This is a
presentation rule: the HR-review API payload, stored results, source text and
model scoring are unchanged. UI regression evidence is synthetic and separate
from the authenticated local E2E described below.

## Authenticated Local E2E Verification (2026-10-26)

Playwright with a manually authenticated HR session exercised the real local
UI/gateway/services using one existing JD and its already-submitted CV. The
unchanged draft plan was confirmed once, then one matching request completed
with M1 `ai1-shadow:ranking-retention:871aeef8a305`. The new result/request IDs
correlated; the HR review used the confirmed plan's content hash and contained
10 requirements and 10 components. The JD remained PUBLISHED and the application
remained SUBMITTED/PARSED. Read-only backend checks found no new parse request
after this matching request. Backend processing took approximately 34.2 seconds;
this is not measured browser completion latency.

Actual UI checks covered requirement/source selection, keyboard selection,
human-readable source labels and displayed quote equality with the API in memory.
Aggregate scores, baseline diagnostics and hiring decisions remained null. No
CV text, credentials, screenshots, browser auth state or HAR/trace was exported.
No product implementation or dependency files changed for this verification;
Playwright tooling was isolated outside the repositories.

This is one successful integration case, not general model-quality or production
acceptance. The plan contained single whole-requirement components, so complex
AND/OR and joint-context semantics were not tested. Exact transient UI completion
wording/timing and broker consumer acknowledgement were not separately verified.

The subsequent `LIVE_E2E_012` check on 2026-10-26 verified the current compact
criteria table/modal and evidence deduplication using fresh HR authentication on
the original test tab. Exactly one new UI matching request completed; automatic
status polling and the refreshed HR review correlated to its new result. Local
AND/OR preview, blank-row blocking and Cancel/discard were exercised without
saving criteria. Parse counts and the confirmed plan remained unchanged. Backend
processing was 1.702s; exact UI transition latency was not measured. This remains
one existing-JD/CV case, not a committed complex-criteria or general quality test.

`AI1_CLOSEOUT_013` subsequently exercised the actual `MatchingService.process()`
with that separate HR-confirmed complex test plan and a synthetic parsed resume,
then again after the test JD became STALE. The current pinned M1 and real
job-service HTTP/DB were used. Confirmed components/groups were retained; stale
components were not reused. Both transactions always rolled back, with no
publisher/shared queue request or durable matching rows. This is service
integration, distinct from the authenticated UI matching E2E above; it avoids
events for nonexistent synthetic applications. Citation fidelity/contract success
must not be reported as passing the separate evidence-quality findings.

## Evidence-only runtime (2026-10-25, baseline-removal-005)

Runtime baseline scoring has been retired. Both `latest-result` and
`matching.completed` return `scoringStatus: "NOT_AVAILABLE"`, `totalScore: null`
and `matchLevel: null`, including reads/publication of archived numeric results.
No trained AI2 is available. No cosine, zero, heuristic score or fit recommendation
substitutes for it. Execution `SUCCEEDED` means processing completed, not a fit decision.

New successful and failed rows store NULL in all eight score columns. Explanations
retain AI1 assessment, typed input snapshots, hashes, origin and reference date;
legacy decisions/recommendations/priorities, requirement scoring and ranking features
are excluded from runtime outputs. Events continue to exclude full input snapshots.
`latest-hr-review?includeBaselineDiagnostics=true` still returns `baselineDiagnostics: null`.
Historical rows and offline comparison artifacts are preserved without updates.

Before deploying/restarting the worker, the BE migration owner must apply
`apps/matching-service/migrations/003_evidence_only_runtime.sql` to the intended
matching database. It is transactional, guarded, rerunnable DDL dropping NOT NULL
and score defaults, with a five-second lock timeout and no historical UPDATE.
Local status (2026-10-25): BE applied **only SQL003**, twice, to the local matching
database. BE self-check confirmed all eight score columns nullable with no defaults
and the full-row hash unchanged for all ten historical rows. Evidence:
`logs/baseline-005/sql003-applied.json` (original path; completed evidence was moved
to the cleanup-006 archive, see [test/archive guide](../apps/matching-service/tests/README.md)).
Independent Tester read-only verification
confirmed local nullability/defaults and unchanged historical-row digest. A separate
disposable PostgreSQL/HTTP test verified idempotence and new null-score persistence.
This local result does not establish migration status in other environments.
Migration 001/002 prerequisites must already exist; the script fails if the table
or an expected column is missing. The existing `matching:migrate` command was not
executed for this verification: it also replays SQL002's conditional UPDATE.
Consumers must support unavailable scoring and nullable aggregate fields before rollout. Earlier integration
receipts below describe their original revisions, not validation of this revision.

AI1 receives normalized typed snapshots independently of legacy scorers. Disabled
AI1 returns `DISABLED`, HR `NOT_PERFORMED`, and loads no model; unavailable AI1
returns `UNAVAILABLE`. Neither invokes pretrained/lexical scoring, fixture sidecars,
or verifier fallback. Current local M1 remains restricted to development/test;
missing/bad manifest pins do not trigger queue retry or fabricate evidence.


## Optional In-Process AI1 Evidence Backend (2026-10-24)

The existing request/worker/result flow can now attach `ai1-evidence-v1` via
`MATCHING_AI1_BACKEND=local_m1` plus a pinned local manifest path/SHA. Default is
disabled; current shadow-only checkpoints run only in development/test. There
is no new public model endpoint, external CV transport or verifier dependency.
The evidence-only revision now requires migration 003 described above. The existing latest-hr-review route projects the new
assessment separately from legacy scores and exposes unverified retrieval only.
See [the current contract](matching-data-contract.md#independent-ai1-backend-in-the-main-worker-2026-10-24)
for configuration, rollback, failure handling and the ten-request worker test.
Earlier shadow integration notes below remain historical; the new adapter is
application code, but production rollout/full AI1 acceptance are still pending.

## Organization And Integration Status (2026-10-23)

Shadow now also exposes `POST /api/v1/shadow/assessments` for pending-only,
source-bound assessment output. It does not accept reviews or infer skill gaps;
it is NOT added to the main gateway API. See the data contract for request,
response and verification details.

Runtime API/worker paths and payloads are unchanged. Optional shadow modules now
live in `app/experimental/`; the opt-in factory is
`app.experimental.shadow_main:create_app`, not the main service entrypoint.
See the [service directory map](../apps/matching-service/README.md) and
[matching data contract](matching-data-contract.md) for details and limitations.
Two fine-tuned AI1 checkpoints have been tested in isolation, not promoted to
production. The preparation note below describes its historical implementation.

## Dataset Preparation v2 Change Note (2026-10-08)

See [Matching / Dataset Data Contract](matching-data-contract.md) for implemented
snapshot/feature/preprocessing versions, evidence fields, input snapshots/hashes,
date rules, dataset requirements, compatibility changes and artifact migration.
The historical preparation used weighted/pretrained scoring; those scorers now remain offline only. Training/evaluation and structured JD parsing are not added by this change.

Base path through gateway:
- `/api/v1/matching`

Responsibility: CV-JD evidence request queue and source-bound retrieval; aggregate scoring is unavailable.

Implementation note:

- `matching-service` is a Python/FastAPI service inside the monorepo.
- It owns `matching_service_db`.
- It does not read other service databases directly.
- It processes match requests created by application-service after the applied CV is parsed.
- It does not consume `application.submitted`; application-service calls the internal HTTP request endpoint.
- Match requests may include a parsed CV snapshot from cv-parsing-service.
- It optionally retrieves M1 evidence; no runtime heuristic or aggregate ranking is computed.

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
  "requestedByUserId": "recruiter-user-id",
  "requestType": "RECRUITER_MANUAL",
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

The background worker processes pending requests, stores `match_results`, then publishes `matching.completed` when a request reaches terminal success or failure.

## AI1 evidence and offline scoring

The worker calls only the independent AI1 adapter. `app/matching/scorer.py`,
`ranking.py` and `semantic.py` remain for offline feature reproduction, pretrained
comparison and weighted/LR benchmark contracts. Their old scoring settings do not
activate runtime ranking. Preserve keyword/TF-IDF/BM25, pretrained and fine-tuned
comparison code/results, frozen data, and the pretrained retention teacher.
AI2 candidate-ranking LR/RF/XGBoost training and evaluation remain pending.

Install/update Python dependencies:

```bash
npm run matching:install
```

## Run Locally

First-time setup:

```bash
make dev
npm install
npm run matching:venv
npm run matching:install
npm run db:all:run
npm run matching:migrate
```

Start every service, including matching-service:

```bash
npm run start:all
```

Or start only matching-service after its dependencies are already running:

```bash
npm run start:matching-service
```

Required runtime dependencies for the full apply-to-match flow:

- PostgreSQL with `matching_service_db`;
- RabbitMQ, because cv-parsing-service publishes `cv.parsed` / `cv.parse-failed` and matching-service publishes `matching.completed`;
- candidate-service, cv-parsing-service, application-service, job-service, document-storage-service, and matching-service;
- matching-service migration `npm run matching:migrate`, including `match_results.matching_completed_published_at` for reliable result publishing.

Required env:

```env
INTERNAL_SERVICE_TOKEN=...
MATCHING_SERVICE_DB_HOST=localhost
MATCHING_SERVICE_DB_PORT=5436
MATCHING_SERVICE_DB_USER=nexhire_matching
MATCHING_SERVICE_DB_PASS=...
MATCHING_SERVICE_DB_NAME=matching_service_db
MATCHING_SERVICE_URL=http://localhost:3007
```

## Matching Prerequisite Flow

`application-service` owns the decision to request matching:

- if the applied CV is already `PARSED`, application-service fetches the latest parsed result from cv-parsing-service and creates a match request immediately;
- if the applied CV is not parsed yet, application-service asks candidate-service to trigger CV parsing and waits for `cv.parsed`;
- after `cv.parsed`, application-service marks active applications for that CV as parsed and creates match requests with the parsed resume snapshot;
- after `cv.parse-failed`, application-service marks active waiting applications for that CV as failed so future manual matching can retry parsing.
- matching-service receives match requests through `POST /api/v1/matching/applications/:applicationId/requests`, not through RabbitMQ.

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

`application-service` consumes this event. When `scoringStatus=NOT_AVAILABLE`,
`totalScore` and `matchLevel` are null. Consumers must represent aggregate scoring
as unavailable and must not substitute zero or retain an archived score as the
current result. Execution status and AI1 evidence remain separate from scoring.

```json
{
  "matchResultId": "match-result-id",
  "matchRequestId": "match-request-id",
  "applicationId": "application-id",
  "jobId": "job-id",
  "candidateId": "candidate-id",
  "candidateCvId": "candidate-cv-id",
  "status": "SUCCEEDED",
  "scoringStatus": "NOT_AVAILABLE",
  "totalScore": null,
  "matchLevel": null,
  "explanation": {
    "ai1Assessment": null,
    "featureLimitations": ["AI2_NOT_AVAILABLE", "AI1_RETRIEVAL_NOT_VERIFIED_SUPPORT"]
  },
  "errorCode": null,
  "errorMessage": null,
  "matchedAt": "2026-07-31T00:00:01.000Z"
}
```

The example omits optional provenance fields. AI1 assessments, when present, are
retrieval evidence only. No hiring decision, fit band, score priority or ranking
position is produced until an independently accepted AI2 contract is introduced.

## Internal Snapshot Dependencies

Matching calls:

- `GET /api/v1/internal/jobs/:id/matching-snapshot`
- `GET /api/v1/internal/candidates/:candidateId/matching-snapshot?candidateCvId=:candidateCvId`

The job snapshot includes `title`, `description`, `requirements`, `skills`, `benefits`, working arrangement, level, location, and salary bounds. `skills` and `requirements` are treated as primary matching signals; `description` and `benefits` are lower-weight supporting signals because recruiters may write requirements there.

Use the template from [README.md](README.md#endpoint-section-template).
