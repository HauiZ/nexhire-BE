# Matching / Dataset Data Contract

## Current runtime contract: baseline removal (2026-10-25)

This section supersedes earlier runtime baseline score descriptions below;
offline benchmark contracts and historical datasets are retained separately.
Latest matching results and `matching.completed` use top-level
`scoringStatus:"NOT_AVAILABLE"`, `totalScore:null`, `matchLevel:null`.
Null is valid only with that explicit contract, never coerced with `Number(null)`.
No aggregate score, recommendation, ranking or hiring decision is available until
AI2 supplies a separately approved contract. AI1 retrieval similarity retains its
meaning as retrieval evidence, not candidate fit or support probability.

Application-service masks stored legacy aggregate/heuristic projections and
candidate best fields without rewriting historical rows. Score filters/sorts
return 400. Valid legacy numeric completion replay is acknowledged and ignored;
new null completion is a validated no-op for application score persistence.
Malformed null contracts follow bounded retry/DLQ, never legacy numeric fallback.
Status/count dashboard aggregates remain independent of scoring. AI1 HR review
and JD requirement plan schemas remain unchanged.

Completion polling uses authenticated company-owned
`GET /api/v1/recruiter/applications/:id/matching-status`, standard envelope
`data:null` if absent, otherwise `matching-status-v1` with only application/job/
candidate/CV IDs, resultId, matchRequestId, execution `status:SUCCEEDED|FAILED`,
non-null valid `createdAt` timestamp string, and `scoringStatus:NOT_AVAILABLE`.
Identity and explicit no-score contract are validated before projection.
FE must correlate the non-null POST request ID to matchRequestId; prior results
cannot complete a new request. POST dedup may return PENDING/PROCESSING. Null
POST ID means waiting on CV prerequisites; polling must be bounded with fallback.
See [application API](application-service.md) for the full allowlist and errors.

### Matching SQL migration boundary

SQL `003_evidence_only_runtime.sql` must run before the evidence-only worker.
It drops NOT NULL and server defaults on all eight heuristic score columns,
inside a transaction with a five-second lock timeout; it performs no row DML.
Existing values are preserved. Reapplying is idempotent.

The existing `npm run matching:migrate` invokes `scripts/matching-service.js`
then `app/migrate.py`; it executes every matching SQL file in name order and has
no migration history ledger. TypeORM `db:all:run` does not apply these SQL files.
For an existing local database under a no-row-update restriction, do not blindly
replay all SQL: 002 contains a conditional historical-row UPDATE. Verify 001/002
schema prerequisites and apply only reviewed 003 via the existing matching DB
connection settings, explicitly loading `.env.local` with loopback guards.
No TypeORM bridge or new migration framework is needed. This task's sanitized
local pre/post schema/count/history-hash and replay evidence is ignored under
`logs/baseline-005/sql003-applied.json` at its original location; cleanup-006 moved
these completed receipts/helpers outside the repo. See the
[archive/restore guide](../apps/matching-service/tests/README.md).
After explicitly restoring the evidence group, its historical reproduction command
is `node logs/baseline-005/sql003-local.cjs apply` (exact reviewed SQL hash pinned).
Restoring files is not authorization to reapply database changes; inspect the
target environment and current schema first.
No environment/deploy files or historical rows are rewritten.

## Independent AI1 Backend In The Main Worker (2026-10-24)

The main matching worker now has an optional in-process AI1 adapter:
`app/matching/ai1.py` calls `app/matching/m1_runtime.py`. No verifier, sidecar
URL, external model API or production import of `app.experimental` is needed.
The selected M1 weights and normalization/retrieval math remain unchanged.

Configuration, disabled by default:

| Variable | Meaning |
|---|---|
| `MATCHING_AI1_BACKEND` | `disabled` or `local_m1` |
| `MATCHING_AI1_MANIFEST_PATH` | Local manifest path, preferably absolute |
| `MATCHING_AI1_MANIFEST_SHA256` | SHA-256 of the exact manifest bytes |

Change backend/path/hash and restart the process for an intentional switch.
Use a separate immutable deployment directory for each checkpoint; retain the
old directory and configuration for rollback. The loader caches one configured
backend per process. Supported checkpoints retain the verified Transformer/
Pooling architecture,384 dimensions and256-token context. Another architecture
requires another backend implementation, not a controller/queue rewrite.

The currently selected manifest is explicitly shadow-only and not production
approved. `local_m1` is accepted only in `NODE_ENV=development|test`; other
environments yield an explicit unavailable assessment. Actual `.env`, local
and deploy settings were not enabled or rewritten by this change. No migration
or production rollout is performed.

Successful matching results gain optional `explanation.ai1Assessment`, schema
`ai1-evidence-v1`. Its independent states are READY/DISABLED/UNAVAILABLE; when
the backend is disabled the worker does not invoke it and the field remains
null. READY stores original requirement IDs/text, Top3 original passages with
cosine-derived similarity, retrieval status/reason codes, model/weights/manifest
version hashes, job/CV snapshot hashes and submitted CV identity. Candidate
support is always unverified, supportStatus=null, verifierUsed=false; none of
these outputs is a training label or hiring decision. Model errors do not
silently become lexical success or cause a matching-queue retry: existing
baseline computation can succeed while AI1 is explicitly UNAVAILABLE.

Only the current source-bound HR-confirmed plan drives component retrieval.
AND/OR groups and jointContextRequired are retained; draft/stale/unavailable
plans use whole requirements only. Component proposals do not confirm logical
coverage. Negation/source warning codes survive to HR; truncated context is
surfaced as M1_CONTEXT_TRUNCATED, never described as full-CV analysis.

The existing latest-hr-review/recruiter hr-review routes now project this
assessment with assessmentSource=M1_RETRIEVAL, verifierModelVersion=null,
modelSuggestion=null, retrievalStatus and optional FIXED_PLAN_RETRIEVAL
components. They still return null fit/decision/rank. Stored IDs, snapshots,
quotes and fixed-plan instructions are revalidated before projection; corrupt
data yields UNAVAILABLE, never a fallback to legacy labels. A present failed
AI1 assessment takes precedence over an older diagnostic field. Historical
verifier diagnostic records remain readable under their existing contract.

Turning the backend off or changing checkpoints affects future requests only;
stored results keep their original model/snapshot provenance and remain readable.
The legacy totalScore, semanticScore, requirementMatches and recommendations
are unchanged baseline outputs, not renamed as trained AI1/AI2 fit conclusions.
No stage, application or publishing decision is changed by evidence inference.

Local verification: actual request POST -> PostgreSQL queue -> existing worker
-> local M1 -> persisted result -> both HR projection reads. Ten fictional
requests cover absent/draft/confirmed/stale plan, bad pin, restored pin, disabled
and re-enabled backend. With max_attempts=3 each request still ran once; disabling
AI1 did not rewrite an earlier result. Verifier was not loaded. This is pre-parsed
CV JSON, synthetic HR headers, isolated DB and captured event publication, not
PDF upload, gateway JWT or full RabbitMQ application-consumer E2E. Raw receipt:
`training/ai1/review/local-ai1-worker-v1/results.json`.

## Selected M1 Can Run Without A Verifier (2026-10-24)

The existing isolated factory `app.experimental.shadow_main:create_app` serves
`POST /api/v1/shadow/requirements` from the pinned M1 manifest. It requires a
dedicated internal token and returns original requirements, Top3 source passages,
cosine-derived scores and explicit retrieval/manual-review flags. No verifier,
LLM, AI2 ranking or hiring decision is required. Retrieval states such as
CANDIDATE_EVIDENCE/INSUFFICIENT_SIGNAL/NO_EVIDENCE are NOT the final support
labels matched/partial/not-found, and similarity is not a support probability.

`training/ai1/M1_RELEASE.json` is the consolidated model/evidence record. Its
verification command audits saved baseline/fine-tuned reports and exercises the
M1-only API on12 authored CVs/four domains/24 requirements. Retrieval order,
text and scores match prior output without loading a verifier. This does not
change production worker routing or the recruiter HR-review endpoint, whose
current synthetic integration still uses its earlier diagnostic contract.

Additional verifier training is stopped. Existing verifier/legacy endpoints are
not silently removed or reclassified as M1 conclusions. Full AI1 support-status
and parse-to-recruiter integration acceptance remain explicit pending work.

## Auxiliary Verifier Scope Revision Outcome (2026-10-24)

`training/ai1/data/verifier-scope-v2/` is experimental support-status supervision,
not canonical semantic/ranking data. Its483 fit inputs preserve the exact scope
of351 reviewed passages and92 actual Top3 windows, plus40 fit-anchored synthetic
contrasts with separate supervised assistant review. Review notes are not model
input. The source/exposure ledger prevents using legacy calibration groups newly
included in fit as untouched evaluation evidence.

One fixed correction experiment completed offline and failed its prespecified
calibration export rule. No candidate checkpoint was exported. Current M1,
verifier runtime, thresholds, API response schemas and HR-review safety flags
are unchanged. Calibration31/evaluation32 are previously inspected development
data, not independent final gold. This revision does not certify AI1 acceptance
or enable AI2 training. Detailed outcome is centralized in AI1_ACCEPTANCE.md.

## HR Projection Binding Validation Hardened (2026-10-24)

The separate HR projection now recomputes the fixed-plan content SHA-256 from
the stored schema/job/snapshot/revision/requirements; two matching hash strings
alone are insufficient. It also checks inference plan context, exact parent
requirement text, component identity/query, unique IDs, complete AND/OR groups,
unique component queries, source-quote membership in the original requirement,
and authenticated-HR plan origin. This validates the stored diagnostic contract,
not the truth of a model's proposed support or a fresh HR login.

Malformed historical objects/arrays and mismatched bindings return UNAVAILABLE
without partial requirement projections or a legacy fallback. Malformed optional
baseline diagnostics, including nonfinite scores, are omitted without discarding
an otherwise valid HR assessment. The endpoint schema, null fit/decision/rank
fields, pending-review flags and production defaults are unchanged.

The four-domain local support diagnostic uses 12 authored English CVs and fixed
two-requirement JDs with AND/OR. It is assistant-reviewed silver, not independent
gold or a realistic long-CV retrieval benchmark. Frozen verifier suggestions
remain unreliable for exact tools, task ownership/handoff and OR requirements;
there is no model/threshold promotion or new train label from these outputs.

## HR Review Projection Separated From Baseline (2026-10-24)

New token-protected GET
`/api/v1/matching/applications/:applicationId/latest-hr-review` uses a UUID ID and
the latest persisted result; it does not trigger inference or rewrite stored
scores/labels. `includeBaselineDiagnostics=false` by default. Default response
contains no totalScore/matchLevel/SHORTLIST recommendation: overallFitScore,
hiringDecision and rankingPosition are null; candidateSupportVerified=false.
Every requirement/component `modelSuggestion` remains unverified and evidence
retains source text/ID with an explicitly non-probabilistic similarityScore.
AND/OR is preserved; draft/stale plans do not acquire component analysis.

Optional `?includeBaselineDiagnostics=true` nests the original numbers/labels
under a warning-tagged baselineDiagnostics object. It NEVER promotes them to HR
confirmation. The existing latest-result API/event schema is unchanged.
Missing HR inference becomes NOT_PERFORMED; failed/corrupt/identity-mismatched
assessments become UNAVAILABLE with no inferred low fit or silent legacy fallback.
Plan status is explicitly AT_MATCHING_TIME and currentPlanRevalidated=false;
job/candidate snapshot hashes identify the scored version. A stored review is
not a live confirmation of the currently edited JD.

Recruiter-facing application-service route:
`GET /api/v1/recruiter/applications/:id/hr-review`. Company-owned application,
job/candidate/CV identity and safe flags are checked; diagnostics are always
removed. See [application docs](application-service.md#separate-hr-evidence-review-2026-10-24).
No public service token, stage writes, auto rejection or new ranking is introduced.
The legacy list/detail/dashboard still require explicit migration to the new
view; no claim that existing UI consumers have changed. Projection separation
does NOT improve semantic model accuracy or resolve the database-administration
false matched observed in the previous local example.

## Local Synthetic API-Worker-Model Diagnostic (2026-10-24)

The opt-in integration now sends pre-parsed fictional CV JSON through actual
matching request POST, PostgreSQL queue, MatchRequestWorker claim/process,
trusted job/plan HTTP reads, frozen local retriever/verifier inference, result
persistence and latest-result GET. Six requests succeed: UNPREPARED, DRAFT,
three confirmed-plan CVs (PostgreSQL+AWS, SQL-only, accounting), and STALE.
The two-part plan remains database AND AWS and is never inferred afresh per CV.

This is deliberately NOT a production sidecar rollout. The initial arbitrary-URL
approach was rejected for candidate-data egress risk. Its replacement is
`app/clients/local_hr_test.py`: NODE_ENV=test plus explicit flag, random fixture
job/candidate ID allowlists, literal loopback HTTP only, dedicated token and
retriever weights pin. DNS hosts/private/external destinations, proxies and
redirects are not accepted. Defaults disable the adapter. No env files changed.

When explicitly enabled, `explanation.localHrFixtureAssessment` contains
`synthetic_test_only=true`, `assessment_status=PENDING_REVIEW`, plan state/hash
and raw source-bound inference. Candidate/job fingerprints, source requirements,
retrieved evidence text, fixed plan structure and safety flags are checked.
The existing aggregate totalScore/matchLevel/decision and requirementMatches
remain LEGACY BASELINE, NOT trained AI2 or confirmed requirement support.
This diagnostic does not redefine public application/recruiter result contracts.

Observed warning: SQL-only CV gets baseline87.60 / EXCELLENT / SHORTLIST, while
the new evidence proposal is partial and AWS is not established. A single
PostgreSQL skill still triggers the legacy CONTAINMENT path for the compound
requirement. The unrelated accounting CV gets baseline56.45 despite both new
component proposals being not-established. These contradictions are preserved,
not repaired or described as successful semantic accuracy. The SQL-only
database-administration proposal is also too generous for proven operational
ownership; HR still needs to verify it.

Boundaries: JD is pre-created in the isolated DB; gateway JWT login, full job
create/moderation/publication and PDF parsing are not tested. JD title change is
a direct test DB update, not the public job-update API. Actual worker outbox
publication is captured locally instead of sending fake applications into the
shared RabbitMQ/application consumers. No personal CV, external LLM call or
training is used. Raw fictional inputs/actions/outputs:
`training/ai1/review/local-api-worker-flow-v1/results.json` (local artifact).

## Local PostgreSQL Validation And Trusted Plan Read (2026-10-24)

The actual additive plan migration and seven transactional/HTTP integration
scenarios passed twice on random, local-only throwaway PostgreSQL databases.
Settings are parsed from `.env.local` only and verified against the local Docker
port; no deploy/application DB is used as a write target. The existing jobs table
is bootstrapped from its entity in the empty test DB; not all historical migrations
are replayed. Test DBs are removed after connections close; existing containers,
volumes and `job_service_db` remain unchanged. Full regression:88 job-service
tests and406 Python tests passed; TypeScript no-emit and migration lint passed.

New service-token guarded GET `/api/v1/internal/jobs/:id/requirement-plan` reads
latest plan plus its current matching-snapshot state. Python's optional
`InternalClient.get_job_requirement_plan(job)` checks identity/hash, approval
state and safe flags against the already-loaded snapshot. The immutable
`JobPlanContext` exposes `confirmed_plan` only for valid HR_CONFIRMED data.
STALE never supplies an old plan; a JD change between reads is also STALE.
UNAVAILABLE/INVALID never elevate to confirmation and do not add posting gates.
The real HTTP test exercises Python consumer -> Node -> PostgreSQL/validator.

Concurrency is tested with two synthetic HR identities and actual row locks;
confirmation cannot race through a changed JD, duplicate audit confirmation or
lose a revision. Injected audit failure rolls the plan insert back. This is NOT
a real gateway JWT login, HR UI, full ATS flow, semantic-accuracy test or model
deployment. Production worker inference remains unchanged; no trained model or
canonical dataset edits/LLM requests occur. See job-service docs for opt-in command.

## Optional Plan Persistence And HR API (2026-10-24)

Job-service now contains recruiter/company-owned plan create/read/edit/confirm/
history routes, transactional revision storage and audit events. See
[job-service contract](job-service.md#optional-jd-requirement-plans-2026-10-24).
Identity comes from the existing JWT gateway/internal-identity trust boundary;
job-service must not be publicly exposed to caller-forged identity headers.
Approvals are constructed server-side after ownership checks, never submitted
by the client. A matching-snapshot change makes approval stale; re-edit clears
approval and increments revision. Posting and applications have no new gate.

The stable contract lives in `app/schemas/jd_plan.py`, with no experimental/model
imports. Compatibility tests compare original shadow source IDs/serialized plans/
hashes, including the four saved fixed plans. Frozen experiment code is unchanged.
The matching app registers model-free internal POST routes:
`/api/v1/internal/jd-plans/draft`, `/inspect`, `/validate`. All require the
existing internal service token. They share the frozen plan validator, not an
LLM or trained inference path. Validation of a supplied approval is source/hash
integrity, NOT independent authentication of its HR author; the job-service
role/ownership transaction and stored audit event are the authority. Consumers
must obtain plans from that trusted storage, not arbitrary client JSON.

New schema tables are additive and require a job-service migration that has NOT
been applied to deploy DB. At this earlier implementation step tests covered
mocked storage plus loopback HTTP; the subsequent local PostgreSQL results are
documented above. Real JWT-session/full ATS E2E remains pending.
The production matching worker, M1/verifier weights, ranking features, status
thresholds and original datasets remain unchanged. HR UI and consumption of
stored plans by production matching remain pending. No new LLM calls/training.

## Fixed JD Plan Lifecycle And Shadow Adapter (2026-10-24)

The user approved one-time HR confirmation of a JD-level requirement plan.
`app/experimental/jd_requirement_plan.py` implements immutable draft/revision/
approval contracts. Drafts retain original source blocks without guessing AND/OR.
All original requirements must remain in source order; components quote source
text and declare AND groups of OR alternatives and importance. Content hash
includes revision and the complete JobMatchingSnapshot hash, never candidate data.
Any snapshot change invalidates the old plan. Editing clears approval and bumps
revision. Confirmation requires the expected content hash and a server-injected
authorization callback; a caller-supplied JSON claim is NOT authentication.

**At the preceding shadow-only step, not yet implemented:** the trusted HR role/job-ownership adapter, persistent
plan/audit storage, public approval endpoints, migrations and HR UI. Current
execution receipts are `assistant_offline`, not real authenticated HR approval.
The default adapter rejects offline approvals; isolated diagnostics explicitly
enable them. No production routes/app/worker/env changes are made.

`fixed_plan_shadow.py` reuses existing HrShadowEngine retrieval and classifier
proposals. `fixed_jd_plan` carries revision/hash/confirmation origin and fixed
requirements; `candidate_review_still_required=true`. AND/OR is preserved for
display/review, never inferred afresh per CV or automatically composed from
unvalidated argmax. Confirming a JD plan does not confirm any candidate evidence.

Actual frozen M1/verifier inference completed on16 synthetic CVs across4 JD
groups, one original English requirement per JD. Plan hashes match across each
group; all responses remain PENDING_REVIEW. This is not full-JD acceptance or
semantic accuracy improvement: a reviewed SQL/dashboard CV still receives
incorrect forecasting-component matched suggestions. These remain unverified.
No canonical datasets, model weights, thresholds or ranking features change.

## Nested Protocol Live Diagnostic Outcome (2026-10-24)

A separately authorized four-request pilot used the frozen nested contract on
different JD groups from the previous paid pilot, selected by fixed hash order
without labels/scores. Four requests completed, zero retries,23,136 tokens.
Three pass schema/citation checks; that is not a semantic accuracy measure.
IT inserts an ellipsis into an exact JD quote and is rejected. Sales produces
not-established but incorrectly makes required leads AND accounts into OR.
Finance disagrees with the assistant generic preferred skill-claim policy; HR
adds an unrequested shared-context restriction and remains REVIEW_REQUIRED.
These previously reviewed synthetic development cases are not independent gold.

Decision: `do_not_promote_nested_coverage`. All original responses remain saved;
no repair, retraining, canonical dataset edits, runtime routing or feature changes.
The new four-request authorization is exhausted. A JD-level fixed requirement
plan, confirmed once by HR and reused across CVs, is proposed for user approval;
it is NOT yet a mandatory workflow or evidence-relation truth. Existing shadow
capability plans can support that direction without replacing fine-tuned M1.

## Offline Nested Coverage Contract (2026-10-24)

`app/experimental/task_coverage_protocol.py` adds a non-routed experimental
contract. AND groups contain OR alternatives; claims nest under components.
Python generates component IDs and binds strict integer evidence indexes0..2
to the original source IDs. Components quote the JD; claims quote their indexed
CV passage exactly. Missing tasks may have empty claims. Unknown shared context
always requires HR confirmation; no model-generated context ID is accepted.
Source-anchored verification questions never confirm operational conditions.

Every output remains `PENDING_REVIEW`, with decomposition/task relations and
semantic accuracy unverified, no hiring decisions or training labels. A model
can still omit a required task or invent an OR while satisfying this schema;
quote validity is not completeness or entailment validation. Four assistant
fixtures and a replay of original responses demonstrate contract behavior only,
not new LLM accuracy. No provider requests, public API changes, model promotion,
ranking-feature changes or canonical dataset edits occur in this step.

## Task-Coverage Pilot Outcome (2026-10-24)

The separately approved four-request fictional-only pilot is complete. Its
offline schema extends the previous proposal with `verification_notes`,
`assessment_status=PENDING_REVIEW` and `operational_conditions_verified=false`.
These are experimental artifacts, NOT a public API/schema migration.
The frozen prompt excludes reviewer labels, similarity scores and personal CVs.
Original task gaps remain distinct from operational quantifiers/cadence.

Two responses pass structural/citation validation: Sales agrees with the
assistant partial reference; Finance proposes partial where the assistant
accepts broad cost-management experience. IT cites JD text as nonexistent CV
evidence; HR references `C1` instead of declared `c1`. Both are rejected and
preserved, without repair or retry. All four provider responses are saved;
usage totals24,861 tokens, currency cost unverified. This deliberately selected
failure analysis is not a representative accuracy estimate or independent gold.
The new operational-qualifier rule was not directly exercised by these cases.

Decision: `do_not_promote_llm_task_coverage`. Runtime routes, model pins, ranking
features and canonical datasets remain unchanged. Citation integrity does not
establish semantic truth. No model proposal becomes a training label or hiring
decision. Further requests require a separate grant; this four-request grant is
exhausted. See `training/ai1/AI1_ACCEPTANCE.md` for the consolidated report.

## Retrieval-Score Status Control And Confirmation

`training/ai1/compare_retrieval_status.py` fits two monotonic Top-1 cutpoints only
on92 reviewed fit windows. The67.1309/75.5780 values use `(cosine+1)*50`, not
support percentages or calibrated probabilities. They are diagnostic only,
not production thresholds. The earlier32 development cases favor this baseline,
but a frozen confirmation on48 windows from12 different source JD groups reverses
that ranking: cutpoints23/48 correct, old verifier30/48, window-corrected29/48.
False matched counts are10/31,9/31,10/31 nonfull targets respectively. No method
is promoted and no fitting occurs on confirmation. These are assistant-reviewed
development cases, not independent gold, real new CVs or canonical final test.

This control changes no request/response schemas, model pins, ranking features,
runtime thresholds or routes. Fine-tuned retrieval remains separate from support
coverage. Any later LLM assistance is an unverified explanation/coverage proposal
over retrieved evidence, not a replacement for M1 retrieval or learned AI2 ranking,
not an authenticated HR decision, and not an automatic training label. A new paid
pilot was subsequently authorized and completed as documented above; the
threshold-control step itself made no provider requests.

## Whole-Window Supervision Preparation (2026-10-24)

Auxiliary data in `training/ai1/data/status-windows-v1/` uses existing English
requirements and actual ordered Top-3 evidence from canonical snapshots. It does
not replace `dataset/current/semantic.jsonl` or `ranking.jsonl`. Status labels
0/1/2 mean full/partial/not-established, not binary relevance or candidate fit.
Forty source groups yield96 fit/32 calibration/32 evaluation windows. Calibration
and evaluation exclude JD groups fit in both original GPU and corrected verifier
stages. Canonical test is not used; development exposure/retriever train exposure
is disclosed. Every pair fits512 tokens under the pinned verifier tokenizer.

Assistant reviews are silver labels. On2026-10-24 the user approved separating
unverified operational scope/cadence into `verification_notes` when task evidence
is demonstrated. Mandatory technologies, substantive tasks, responsibility and
minimum tenure are not waived. Matched task evidence does not mean all conditions
or CV claims are independently verified. Original strict reviews remain intact;
policy adjudications change7 labels and add notes to15 cases before classifier
inference. Release155 windows uses92 fit/31 calibration/32 evaluation with5 holds.
Notes/review reasons are not model inputs. No silent relabeling or promotion is
allowed. The compiler refuses to create a training release while
`coordinator_audit.json.pending_policy_decisions` is nonempty. Python validates
structure/quote binding/context/splits, not semantic truth. No production/shadow
API schema, routing, checkpoints or thresholds change in this preparation step.

## Status Proposal Contract (Offline, Not Routed)

`app.experimental.matching_status_proposal` separates `status_proposal`
(`matched`, `partially_matched`, `not_found_in_provided_evidence`, or null when
abstaining) from the review workflow `assessment_status=PENDING_REVIEW`.
HR authentication, verified support, training-label use, rejection and production
approval remain false. A not-found proposal refers only to the provided evidence.
The contract binds original source IDs/sections/text, query and model weights;
the policy pins calibration results and class thresholds. It refuses a model
mismatch and abstains on incomplete context, missing evidence or query/window
scope mismatch. A failed winning class does not fall back to a lower-ranked class.
These are structural/caller-declared scope checks, not proof of semantic truth
or independent authentication of the input provenance.

This module is not registered in production or the frozen HR shadow app. Existing
component calibration concerned selected passages, not whole-requirement Top-K
windows. `training/ai1/check_status_proposals.py` only replays existing scores.
The subsequent32-window pilot locks assistant reviews before actual classifier
inference; on15 evaluable development cases, argmax confuses all3 partial cases
with full support, while transferred old thresholds propose no full matches.
Therefore neither pending-only responses nor this contract complete DOCX3.4;
runtime-window supervision/evaluation remains necessary. No API schema, routing,
canonical labels, checkpoints or production thresholds change in this step.

The subsequent bounded auxiliary correction runs69 CPU training steps using92
reviewed windows, selects a checkpoint/threshold on31 calibration windows before
opening32 evaluation windows, and is NOT promoted. Both models remain correct on
19/32, while false matched proposals increase10→11 among26 nonfull targets.
Calibration picks threshold0 (argmax/no abstention), not a safe confidence cutoff.
The new auxiliary artifact is experimental only; existing runtime model pins and
APIs remain unchanged. `verification_notes` are reviewed dataset annotations, not
evidence of an automatic qualifier-extraction capability in the model.

## Approved HR-Assisted Scope

On2026-10-23 the user approved HR assistance, explicitly without automatic
confirmation. This is not teacher acceptance or production approval. The frozen
evaluation profile is `training/ai1/final/hr-assisted-v1/protocol.json` and its
`test_opening.json` records consumption of the canonical held-out split. Historical
reports saying test was unscored describe their own earlier runs only.
The evaluation measures recovery of assistant-reviewed cited evidence, not
exhaustive relevance, candidate ranking, skill absence or autonomous acceptance.
It does not change API schemas, dataset labels, status thresholds or production
routing. Existing failed automatic-status gates remain failed; pending suggestions
must not be persisted as authenticated HR decisions or training ground truth.
Scope clarification against original DOCX section3.4: HR assistance does not
waive the requirement for matched/partially matched/not-found proposals under
validated thresholds. Automatic matching assessment is distinct from the final
hiring decision. The pending-only shadow API is an intermediate safety boundary,
not completion of that requirement; a proposal is never an authenticated HR review.

## Opt-In HR Shadow Proposals

Standalone entry `app.experimental.hr_shadow_main:create_app` wraps the old
shadow HTTP app with `HrShadowEngine`; production and the old entrypoint are not
changed. Existing snapshot request body/auth/size/deadline/busy/error controls
apply to `/api/v1/shadow/requirements` and `/api/v1/shadow/assessments`. It is
read-only: caller-supplied reviews are rejected, no database/HR decision is written.

Required startup configuration: existing `MATCHING_SHADOW_MANIFEST` and dedicated
`MATCHING_SHADOW_TOKEN`, plus `MATCHING_SHADOW_VERIFIER_DIR` and explicit
`MATCHING_SHADOW_VERIFIER_RESULTS_SHA256`. The full recruitment export is pinned
and verified locally; remote code/loading and pickle weights are not used.
Optional `MATCHING_SHADOW_JD_PLANS` points to a `nexhire-hr-shadow-plans-v1` file
binding job ID, exact requirement ID/text and prepared component queries. Plans
are declared assistant/HR JD interpretations, not model extraction or authenticated
reviews. Stale plan fails422; missing plan reports `NOT_PERFORMED`, not “no gaps”.

Additional response fields: `hr_proposals` contain original quote windows,
retrieval bindings, verifier version/weights, native `model_suggestion` and
uncalibrated probabilities. All `assessment_status` remain `PENDING_REVIEW`;
`verified_support=false`, `decision_threshold_applied=false`. No validated useful
operating point was found, so argmax is explicitly a suggestion, never acceptance.
`groups_flagged_by_model` is a non-authoritative hint; all prepared groups stay
in `groups_needing_hr_confirmation`. `confirmed_missing_groups=null`, not a claim
that the candidate lacks skills. `ranking_score/position=null`, no rejection,
no training labels, HR authentication or automatic promotion.

Work is bounded to32 verifier windows/request (including parent and component
queries); overflow returns422. Pair context>512 returns a no-score pending hint
before model forward, with no silent verifier truncation. Retrieval truncation
diagnostics remain visible. Verifier failures return503 without lexical fallback
or sensitive details; deadlines retain the shared busy slot until work finishes.

`training/ai1/check_hr_shadow.py` verifies both trained models over real loopback
HTTP on12 previously inspected synthetic snapshots. It is not PDF parsing,
independent model-quality evaluation, full system/HR write workflow or production
acceptance. Old automatic-status gates remain unpassed.

## Binary Full-Support Verifier Control

`training/ai1/compare_support_verifiers.py` compares local pretrained NLI and
the corrected recruitment verifier on the same frozen component inputs. NLI
`entailment` and recruitment `matched` are evaluated only as full-support proposals.
NLI neutral/contradiction and all other nonproposals remain unresolved, never
automatically partial, not-found, skill absence or candidate rejection. This is
not an API payload change or the three-way status acceptance benchmark.

Thresholds are selected only on calibration under a prospective minimum full
recall0.5 plus observed family false-full<=0.1 and denominator checks. Both models
have no admissible operating point in the frozen 22-threshold grid (not proof
that all possible thresholds fail); `selected_full_proposal=null` must not be
read as “all candidates fail” or as a calibrated probability. Native argmax is
diagnostic only. No verifier is promoted. Fine-tuned raw full recall is higher
on this small silver sample, with more false-full proposals; no independent
real-world superiority claim, label changes, training, production or AI2 changes.

## Uniform Evidence Review Policy

Revision execution: `prepare_component_revision.py` and
`evaluate_component_revision.py` re-review172 existing source pairs under this
policy. `training/ai1/COMPONENT_DATASET.json` binds `adjudicated_release.json`
and `adjudicated_inputs.json`:237 components,11 held;157 calibration,52 reused
evaluation,28 new component-query evaluation. Proposal targets and two coordinator
adjudications remain separate. Canonical semantic/ranking and old v1 targets stay
unchanged. These are assistant silver, not gold or a replacement training release.

All calibration sample checks pass; calibration-only selection still chooses
[0.70,0.50,0.50]. New-query argmax false-full5/21; selected thresholds give no full
and11/28 pending. Reused52 model input/probability pairs are identical to v1;
metric differences there reflect changed target policy, not improved model weights.
Do not promote this verifier or silently reinterpret pending as partial/full.
This is selected-passage support testing, not end-to-end CV matching or ranking.

`training/ai1/configs/evidence_review_policy.json` is the assistant-adopted review
standard, not a semantic inference engine. Generic skill/proficiency requirements
may be supported by affirmative CV skill entries (`basis=self_report`) or concrete
work (`basis=experience`). Neither is externally verified competence. Named levels,
years, ownership and specialized activities retain their qualifiers; a bare tool
entry does not prove advanced use, architecture or creation of a specified product.

Revised component labels include `evidence_basis` and `externally_verified=false`.
These are label-review metadata, not extra features passed to the model. They must
not be silently promoted to HR-verified claims or hiring decisions. Reviewers read
frozen JD-only plans and original passages without prior targets or model outputs;
Python checks IDs, literal quotes, provenance structure, duplicates and partitions,
not whether a passage semantically establishes a skill. Revised experimental data
is separate from `dataset/current`; old component targets/results remain intact.

Named OR alternatives can be assessed directly when another branch says related
or equivalent; undefined equivalence is held when relied on, not invented. The
revision's inherited globally ambiguous plans remain held. Generic "technical
expertise" headings are not automatically expert-level requirements. Clarifications
are recorded before revised model scoring in `component-calibration-v2/`.

## Reviewed Component Calibration Diagnostic (2026-10-23)

`prepare_component_calibration.py` selects 64 distinct source JD/passage pairs,
32 calibration/32 inspected-development validation, without labels/model scores
in selection. JD-only plans were locked before opening passages for component
review. The 108 component decisions yield 103 included/5 held (51 cal/52 val).
These are assistant silver, not independent gold or a corpus prevalence estimate.
`calibrate_components.py` feeds only original passage and frozen JD query to the
existing corrected verifier, not review quotes/labels/missing-component answers.

Three families have fewer than the predeclared ten nonfull calibration components,
so no new threshold is selected. On validation, argmax false-full is13/32; old
thresholds produce zero full and26/52 pending. Selected-passage component results
are not end-to-end retrieval, whole-CV fit or candidate ranking. No API/DTO,
weights, canonical dataset or production behavior changed.

Coordinator identified two disputed generic-proficiency labels after scoring;
targets/results remain frozen. Posthoc exclusion still yields11/30 false-full,
not a new selection result. The generic vs advanced evidence policy requires
adjudication before another calibration release. All raw decisions and metric
recomputation are in `experiments/component-calibration-v1/`; no model output may
be submitted as if it were authenticated reviewed evidence.

## JD-First Component Model Probe (2026-10-23)

`training/ai1/probe_jd_components.py` runs local retention retrieval and the corrected
cross-encoder on 12 new authored English CV scenarios, four prewritten JD plans.
Plans and source CVs are separate from authored targets; model predictions are
saved before targets are joined for metrics. Oracle support-only inference is
diagnostic only, never runtime evidence selection. Predictions have no review
origin and must not be converted into `EvidenceReview`/reviewed capability claims.

All 12 answerable component support sets were retrieved in top2. Whole and
component-composed argmax each got 11/12 whole requirements correct, with different
errors. Fixed prior thresholds yield 6/12 pending whole vs 9/12 pending composed;
no confidence retuning, production promotion or final-test scoring. This small,
simple assistant-authored probe is not independent real-world validation. Numeric
scores are uncalibrated softmax, not probability that a candidate meets the JD.
No API DTO/endpoint, canonical dataset, weights or ranking behavior changed.

## HR Consideration Policy (2026-10-23)

Experimental Python entry: `app.experimental.hr_consideration.assess_hr_consideration`.
No HTTP DTO, endpoint, production ranking, dataset labels or model weights changed.
It composes existing source-bound `assess_evidence` output, not raw cosine or
unverified model predictions. `RequirementPriorities` binds the exact capability
plan and one importance value per AND group (OR alternatives share that value):
`core`, `supplementary`, `preferred`, or `unknown`. Multiple core groups are valid.
Priorities must be declared from JD before CV review; the caller supplies this
provenance, not an independently authenticated or automatically verified claim.

`PARTIAL_SUPPORT_WORTH_HR_CONSIDERATION` means some direct reviewed support,
not full requirement satisfaction or a high candidate rank. `component_groups`
retain alternatives, importance and scoped support; `attention_codes` distinguish
core, supplementary and preferred clarification. Unknown importance stays unknown.
Missing support means not established in retrieved evidence, not absence of skill.
Ambiguous/unreviewed evidence stays pending. Fully covered evidence still does not
establish whole-candidate fit or eligibility. Eligibility remains separate.

`ranking_score` and `ranking_position` are null: no arbitrary weights, automatic
rejection or equal penalty per missing clause. AI2 remains paused. A validated
ranker/HR must decide ordering; this policy alone does not enforce a rank ceiling.
Tests verify logic with supplied reviewed claims, not model accuracy or new
independent data. Existing failed gates and unscored final test remain unchanged.

## Reviewed Verifier Corpus And Correction (2026-10-23)

`training/ai1/VERIFIER_DATASET.json` points to 589 included/11 held passage pairs
reviewed under the v2 support contract (351 fit,120 calibration,118 development
validation). All 600 selected pairs have decisions; 593 delegated blinded reviews,
seven earlier seeds, plus 26 coordinator source spot-checks. Quote and partition
checks do not imply independent gold or perfect labels. Selection by inherited
class cannot estimate corpus prevalence. Semantic/ranking canonical data unchanged.

A bounded 132-step cross-encoder correction used only reviewed fit text/targets;
annotations/component notes are not features. Same-validation argmax macro-F1
0.6461→0.6665, false matched23→13/81, true matched30→25/37. Shared confidence fails;
class-conditional thresholds selected on calibration improve coverage to64.41%
but still fail F1/coverage and propose no matched. No production/API/worker changes.
Inference must not use answer-derived supported/missing components as if they
were a JD-only plan. Final test remains unscored; component composition remains
an integration/research requirement rather than an automatically solved step.

## Verifier Supervision Scope Revision (2026-10-23)

`text-verifier-supervision-v2` separates relevance_role from support_status:
transferable relevance is retained but does not automatically establish direct
partial support. Semantic binary positives are not automatically whole-criterion
entailment targets; examples, conjunctions and qualification equivalence require
source review. Eight fit/calibration pairs reviewed, seven usable seed targets,
one held; remaining 6,791 pairs pending/held are NOT confirmed errors. The revision
is not full-training ready and does not modify canonical semantic/ranking data,
validation targets, HTTP DTOs, worker or production models. Details and source
bindings in training/ai1/experiments/text-verifier-supervision-v2/ and acceptance.

## Direct Text Verifier Prototype (2026-10-23)

Full fine-tuned verifier has now been returned, imported and CPU-replayed in
`training/ai1/exports/kaggle-text-verifier-v1/`. Inputs/code/weight hashes and
thresholded metrics reproduce; maximum CPU/GPU probability drift 3.46e-6 with
zero validation decision differences. Validation macro-F1 0.2568/coverage 0.2014
at calibration-selected 0.70 fails acceptance. No HTTP/worker change, no promotion.
The frozen-feature runtime helper still must not load this full-model export.

Historical preparation/prototype stage before this returned GPU run:

- Architecture extension approved: `app.experimental.text_verifier` exposes pure
  feature/head validation; `text_verifier_runtime.LocalTextVerifier` explicitly
  loads checksum-bound local artifacts. No HTTP endpoint or worker behavior changed.
- Prediction schema `nexhire-text-verifier-prediction-v1` preserves supplied text
  and evidence IDs, returns per-passage learned status/probabilities, and leaves
  `whole_cv_status=null`. A pair over 512 tokens is PENDING_REVIEW without silent
  truncation. Source passage IDs must be unique, 1..32 per call. This class is an
  experimental local helper, not an authenticated network API.
- English-first selected-passage silver inputs preserve JD source partitions;
  ambiguous flagged partials/source mismatches are held. No NLI neutral-to-partial
  rule or fabricated NOT_MENTIONED negative. Most partial labels remain inherited.
- Frozen-NLI contextual-feature prototype fails validation F1/coverage and is not
  promoted. Scores cannot be compared as a same-task improvement over whole-CV
  status metrics. CPU smoke verified actual cross-encoder backbone updates;
  full fine-tuning is prepared for GPU and has not run. No canonical test/private CV.
- Full cross-encoder exports require their own verified runtime adapter after
  quality review; do not load them into the frozen-feature prototype helper.
  See training/ai1/README.md and AI1_ACCEPTANCE.md for the bundle and current gate.

## Status Calibration Label-Scope Audit (2026-10-23)

Controlled follow-up: `check_scope_sensitivity.py` fits an isolated diagnostic
head with the same method and known scope-label corrections. Most labels remain
inherited; this is not approved calibration. A paired post-hoc comparison at the
same confidence 0.70, same revised targets and unchanged queries yields macro-F1
0.530383 to 0.529711 across 3,533 development variants. It does not establish an
improvement or justify promotion. The diagnostic head lacks the production head
schema and cannot be loaded as an approved runtime artifact. Final test unscored;
no HTTP/feature/canonical-data changes. Architecture proposal is in AI1_ACCEPTANCE.md.

The subsequent bilingual review closes the 46-group packet in
`status-scope-v2/closed_review.json`: one isolated VI translation override restores
wage-and-hour meaning, one agriculture/nursery interpretation remains on hold.
Reviewed sufficient support sets are not exhaustive alternatives. Five further
flagged annotations from fit/calibration were source-reviewed in a separate
overlay; all nine flagged development annotations now have review decisions.
These overlays do not automatically qualify unreviewed labels for a new fit.
No revised production API/status head or semantic_score is released. Keep the
46 inspected validation groups outside fitting and threshold selection.

Follow-up: `prepare_scope_review.py` freezes a whole-CV rubric, 1,768-group
development inventory and a 46-group outcome/family-stratified packet. Assistant
review of all 46 English requirements and full English CVs retains 35 statuses
and changes 11 in an isolated overlay. `compile_scope_review.py` checks packet
hashes, completeness, unique decisions and source evidence IDs, binding each
decision to its exact source record. These checks do not prove semantic truth.
Vietnamese equivalence and complete component support-set review remain pending;
every reviewed record is still ineligible for calibration. No production API,
canonical labels, encoder weights or AI2 features are changed. The sampled
transition rate is not an estimate of corpus label noise or model improvement.

`training/ai1/audit_status_errors.py` joins all 3,536 stored validation variants
to frozen source annotations and verifies the review and source artifact hashes.
132/155 partial-to-matched predictions include the annotated reference in Top-3;
reference retrieval alone cannot account for all status errors. Four source
annotations (eight variants) carry an excluded-selected-passage review flag but
were included by the old status experiment. Source-wide versus selected-passage
label scope requires adjudication in a new evaluation revision. Existing metrics
remain historical; counts do not establish semantic causes or change labels.
No HTTP schema or runtime change. Progress is consolidated in AI1_ACCEPTANCE.md.

## Frozen RRF Confirmation (2026-10-23, Offline Only)

- `training/ai1/confirm_rrf.py` scores eight fictional English CVs, two per domain,
  48 source requirements / 96 paired EN/VI variants, with labels locked before
  inference. Assistant-authored silver, not independent gold or canonical test.
- Frozen equal-weight k=60 fusion raises ranking-only full-support Top-3 from
  46 to 47/48 variants. Retention stays 45/48, while VI falls from 22 to 21/24.
  Direct MRR is already 1.0 for semantic methods; all fusion arms fail the locked
  +0.01 MRR-gain condition. No post-score retuning or production selection.
- Compound completeness and sufficiency statuses remain unresolved. Cosine is
  not entailment; RRF rank sums are not cosine or AI2 semantic_score. No endpoint,
  DTO, runtime, threshold, weights, canonical data or AI2 features changed.
- AI1 remains unfinished, AI2 paused. No paid API/private CV use. Concise evidence:
  `training/ai1/experiments/rrf-confirmation-v1/RESULTS.md`.

## AI1 Acceptance Reconciliation (2026-10-23)

- AI1 is NOT finalized and AI2 work is paused. Re-reading original C11_C14.docx
  confirms sections 3.3/6.1 require separate final-test evaluation and section 3.4
  requires matched/partial/not-found statuses with verified thresholds. Retrieval
  plus universally PENDING_REVIEW does not satisfy this complete requirement.
- See `training/ai1/AI1_ACCEPTANCE.md` and `configs/ai1_acceptance.json` for the
  requirement/status matrix. Numeric targets are local engineering proposals,
  not teacher-issued mandates; previous comparison guards are retained, not
  retrospectively waived to declare completion. No automated promotion allowed.
- One fixed post-hoc RRF screen combines stored BM25 and semantic ranks, k=60,
  equal weight, all evidence, shared competition ranks for source-score ties.
  `training/ai1/screen_rrf.py` writes isolated experimental reports only.
  It does not change embeddings, runtime matching, DTOs, labels or any AI2 feature.
- MRR improves for all three encoders in this already-seen diagnostic; pretrained
  and retention fusion both reach 1.0, preserving full-support Top-3. This is not
  evidence of fine-tuning superiority, a final-test pass or calibrated status.
  RRF scores are rank sums, NOT cosine/probability/semantic_score; the pair
  threshold 67 is never applied to them. No API endpoint was added or changed.

## Post-Hoc Retrieval Role Audit (2026-10-23)

- `training/ai1/analyze_fresh_evidence.py` reads the frozen fresh benchmark and
  verifies packet/code/report hashes before analysis. It does not call encoders,
  providers, runtime matching or training. Original grades/scores are unchanged.
- Top-1 roles distinguish full support, valid complementary component, partial
  support, explicit negative evidence, and non-supporting passages. Specific
  semantic causes are supplied only for source-bound assistant-reviewed pairs in
  `failure_review.json`; unreviewed grade-zero passages get no inferred cause.
  This review is explicitly post-hoc/non-gold, not independent evaluation labels.
- On 48 answerable EN/VI variants, each semantic method has four non-supporting
  Top-1 hits but zero incomplete Top-3 windows. BM25 has five such Top-1 hits and
  seven incomplete Top-3 windows. Partial components and relevant explicit denials
  are not automatically counted as retrieval failures or affirmative skill support.
- Earlier interim scope proposal, NOT final AI1 acceptance: a Top-K retrieval aid, not an entailment/absence/fit
  classifier. Existing checkpoints stay frozen for comparison, without promotion,
  new threshold, ad-hoc hybrid or blacklist. Review/feature decisions remain
  separate from embedding similarity. No endpoint/payload/model/data changes.

## Fresh Four-Domain Quality Experiment (2026-10-23)

- `training/ai1/evaluate_fresh_evidence.py` compares BM25, pretrained and both
  fine-tuned encoders on a new frozen assistant-authored packet: four fictional
  English CVs, ten passages each, 48 requirements / 96 paired EN/VI variants.
  Each domain includes short skills, standalone, compound and no-answer cases.
- Grades: 2 whole-requirement support, 1 partial/related foundation, 0 no support;
  complementary support sets require all reviewed passages in Top-K. No-answer
  queries are excluded from answerable-retrieval denominators, not counted as wins.
  Direct MRR and joint-support completion MRR are reported separately.
- Labels, methods, models, context and tie-breaking were locked before scoring;
  overlap was checked against train and two previous synthetic probes, not all
  pretraining/semantic duplicates. Results are not independent gold or real-CV quality.
- All three semantic models achieve 48/48 full-support Top-3 variants; BM25 41/48.
  Fine-tuning does not improve these main retrieval metrics over pretrained here;
  graded NDCG@3 is lower for both fine-tuned models. 39--41 of 48 no-full-support
  variants exceed inherited pair-reference 67, which is not an abstention classifier.
- This experiment does not change API payloads, runtime, model selection, weights,
  thresholds, canonical data or AI2 features. No paid API or private-CV use.
  Concise report: `training/ai1/experiments/fresh-evidence-benchmark-v1/RESULTS.md`.

## Fresh Four-Domain Quality Experiment (2026-10-23)

- `training/ai1/evaluate_fresh_evidence.py` compares BM25, pretrained and both
  fine-tuned encoders on a new frozen assistant-authored packet: four fictional
  English CVs, ten passages each, 48 requirements / 96 paired EN/VI variants.
  Each domain includes short skills, standalone, compound and no-answer cases.
- Grades: 2 whole-requirement support, 1 partial/related foundation, 0 no support;
  complementary support sets require all reviewed passages in Top-K. No-answer
  queries are excluded from answerable-retrieval denominators, not counted as wins.
  Direct MRR and joint-support completion MRR are reported separately.
- Labels, methods, models, context and tie-breaking were locked before scoring;
  overlap was checked against train and two previous synthetic probes, not all
  pretraining/semantic duplicates. Results are not independent gold or real-CV quality.
- All three semantic models achieve 48/48 full-support Top-3 variants; BM25 41/48.
  Fine-tuning does not improve these main retrieval metrics over pretrained here;
  graded NDCG@3 is lower for both fine-tuned models. 39--41 of 48 no-full-support
  variants exceed inherited pair-reference 67, which is not an abstention classifier.
- This experiment does not change API payloads, runtime, model selection, weights,
  thresholds, canonical data or AI2 features. No paid API or private-CV use.
  Concise report: `training/ai1/experiments/fresh-evidence-benchmark-v1/RESULTS.md`.

## Pending Assessment HTTP (2026-10-23, Shadow Only)

- New `POST /api/v1/shadow/assessments` is registered ONLY by
  `app.experimental.shadow_main:create_app`. The main service/worker and
  existing `POST /api/v1/shadow/requirements` response are unchanged.
- Same request as retrieval: `{job: JobMatchingSnapshot, candidate:
  CandidateMatchingSnapshot}`, same dedicated `x-internal-service-token`.
  Job/candidate IDs must be nonblank. No review/model-selection fields accepted
  at the top level; additional fields yield generic 422 before inference.
- The server verifies encoder-result model metadata against its loaded encoder
  and manifest, then adds `assessments[]` in requirement order. Each assessment
  binds the actual retrieval to JD/CV/model identities and preserves original
  scores/text/IDs. No second semantic model, LLM request or keyword rescoring.
- Response retains the full retrieval result and adds
  `assessment_mode="pending_review_only"`, `reviews_accepted=false`, and
  `assessments[]`. Every assessment has `assessment_status="PENDING_REVIEW"`,
  `review_origin=null`, `reviewer_id=null`, `composition=null`,
  `unresolved_component_groups=null`; all non-decision flags remain unchanged.
  A pending assessment does not mean either matched or missing skills.
- Example excerpt (not a full response):

  ```json
  {
    "assessment_mode": "pending_review_only",
    "reviews_accepted": false,
    "assessments": [{
      "assessment_status": "PENDING_REVIEW",
      "composition": null,
      "unresolved_component_groups": null,
      "requires_hr_review": true,
      "automatically_supported": false,
      "candidate_rejected": false
    }]
  }
  ```

- Both routes share the encoder/busy slot, 128-KiB request limit, validation,
  authentication, timeouts and failure behavior. No queue, DB, event, persistence
  or reviewer-authentication workflow was added. Empty CV stays pending with
  `next_action="CHECK_SOURCE_CV"`, never reject. Errors do not echo input.
- Actual two-checkpoint loopback test: 128 pending assessment variants alongside
  128 legacy retrieval variants, four fictional domains x EN/VI per arm.
  Citations/order/scores preserved; unauthorized 403, forged review 422, empty CV
  safely pending. Results: `training/ai1/experiments/shadow-http-v1/revisions/pending-assessment-v4/`.
  This is HTTP integration evidence, NOT automatic support accuracy or full E2E.

## Bound Evidence Assessment (2026-10-23, Experimental Only)

- `app/experimental/evidence_assessment.py` separates unreviewed retrieval from
  explicit source review. The initial step was offline; the pending-only path is
  now exposed by the shadow endpoint above. Explicit review submission is still
  NOT exposed. No production endpoint, score, feature, label, model or threshold changed.
- Input: `ShadowMatch`, `AssessmentContext(job_id, candidate_id, model_version,
  weights_sha256)` and optional `EvidenceReview`. SHA-256 binds these identities,
  exact requirement, retrieved text/source IDs/order/scores and retrieval flags.
  A changed binding rejects stale review; this is not authentication or a signed
  attestation that the supplied model identity is genuine. The caller must obtain
  verified model metadata and authenticate reviewers before any future API use.
- Without review: `PENDING_REVIEW`, `composition=null`,
  `unresolved_component_groups=null`. A high score cannot infer support or gaps.
  Empty evidence asks to inspect the source CV, never to reject the applicant.
- Explicit review must declare `assistant_review` or `hr_review`, reviewer ID
  matching the plan, exact requirement/quote and only in-window evidence.
  Unverified LLM proposals cannot use this review-origin field directly.
  Origin strings are caller assertions, not proof of independent human review.
  Persist the input review record alongside any assessment in a future workflow.
- Output statuses: `REVIEWED_EVIDENCE_COVERED`, `REVIEWED_EVIDENCE_PARTIAL`,
  `NOT_ESTABLISHED_IN_RETRIEVED_EVIDENCE`, or `REVIEW_UNRESOLVED`.
  Missing groups identify what was not established in the retrieved window, not
  what the candidate actually lacks. AND/OR/common-context composition reuses
  `shadow_pipeline.py`; it does not extract or judge semantic relations itself.
- All outputs retain `automatically_supported=false`, `candidate_rejected=false`,
  `requires_hr_review=true`, `is_training_label=false`, `independent_gold=false`,
  `semantic_accuracy_verified=false`, `review_identity_authenticated=false`.
- Offline replay: `training/ai1/check_evidence_assessment.py` uses actual cached
  two-arm retrievals plus explicit assistant-reviewed relations. 32 cases per arm:
  16 authored single-criterion/no-answer cases and 16 prior EN/VI component cases.
  All 64 preserve raw retrieval and non-decision flags; no automatic extraction
  accuracy, new-model quality or independent gold accuracy is claimed. The 16
  absent-support variants become not-established only AFTER explicit review.
  No new inference, paid API, personal CV read or canonical data modification.
- Current replay artifacts are under
  `training/ai1/experiments/evidence-assessment-v1/revisions/json-canonical-v2/`.
  Results are normalized to JSON arrays before immutable comparison; repeated
  replay succeeds without overwriting differing history or issuing requests.

## Runtime / Experimental Separation (2026-10-23)

- Shadow and optional evidence-analysis modules now live in
  `apps/matching-service/app/experimental/`, not `app/matching/`.
  Main API/worker, normalization, scoring, ranking, schemas and ML trainers stay
  in their original locations. No endpoint, payload, weights, label or algorithm change.
- Opt-in factory is now `app.experimental.shadow_main:create_app`.
  Old Python import paths are removed, not retained as duplicate implementations.
  Main Docker entrypoint remains `app.main:app`; experiments are not registered there.
- See `apps/matching-service/README.md` for the directory map and launch command.
  Scripts/tests use the new imports; immutable historical receipts still describe
  their original source paths/hashes. New offline/HTTP runs write the
  `experimental-layout-v3` revision instead of overwriting prior results.
- Existing paid-pilot journals and request limits are NOT reset. Changed prompt/code
  bindings require separate authorization, not a fresh silent retry.
- Architecture regression checks reject direct imports from production/ML source
  into `app.experimental`. HTTP regression checks actual checkpoints separately;
  passing integration does not establish entailment accuracy or production approval.
- Post-move loopback regression preserves all 128 requirement variants across two
  checkpoints, including original evidence IDs/text/order and non-decision flags.
- A new authored no-answer diagnostic (`training/ai1/check_no_answer.py`) uses four
  fictional profiles, sixteen queries per checkpoint, eight without complete
  supporting evidence. Both arms put 7/8 absent-evidence Top-1 results above the
  inherited pair reference. This is not gold, a calibrated false-positive-rate
  estimate, or grounds for selecting a model/threshold. Three passages per profile
  make positive Hit@3 non-discriminating. No labels/features/model settings changed.

## Nullable Job Snapshot Boundary And Redacted CV Probe (2026-10-22)

- Contract mismatch found: JobMatchingSnapshotDto in job-service permits explicit
  null description, requirements, workingType, experienceLevel and location, while
  Python matching snapshots require strings. New app/schemas/snapshot_boundary.py
  normalizes ONLY explicit nulls in those five fields to empty strings at the
  InternalClient response boundary and standalone shadow request validator.
  Missing required fields, title/id/skills validity and actual nonempty text are
  unchanged. Benefits/salary nulls stay nullable. No canonical schema/model edits.
- This is a receiving-boundary bug fix in active InternalClient, not a model
  promotion or scoring change. No DB mutation or production config change.
  Regression HTTP repeated in shadow-http-v1/revisions/nullable-boundary-v2;
  all 128 requirement variants preserved, 140 service tests pass.
- Runner training/ai1/check_live_cv_job.py prepares a manual redacted ParsedResume
  fixture from previously approved technical excerpts, runs the actual matching
  ParsedResume-to-snapshot adapter, and verifies expected technical terms in the
  user PDF in memory only. No PDF/raw extracted text, original identifiers,
  employers/institutions/dates, PDF filename/path/hash or parsed candidate metadata
  are persisted. This does NOT certify the production PDF/LLM parser.
- DB mode requires explicit environment selection; nonlocal hosts require
  --allow-remote-readonly authorization. Credentials stay in process, never printed.
  Connection defaults to READ ONLY, transaction additionally readonly=true,
  verified by SHOW transaction_read_only. Selection lists only published-job
  metadata, then fetches one explicitly selected JD body by bound UUID; no
  candidate/CV data transmitted to DB. SQL connection closes in finally.
- Direct DB projection follows JobService.getMatchingSnapshot fields exactly but
  must be labelled direct_db_readonly_projection, not successful job-service HTTP.
  No calls to MatchingService.process, persistence or event publication.
- User subsequently approved deploy DB READ ONLY. Eight published titles, no
  backend title: Data Analyst / Data Scientist selected explicitly before scores.
  Actual two-arm loopback inference succeeds: HTTP 200, 15 requirements/arm,
  zero truncated texts, ~.64s/request for this one profile. No DB write, provider
  CV call, application event or background server remains. No `.env` modification.
- Critical semantic diagnostic: retention retrieves NestJS for Tableau at 83.48,
  FCM for Power BI at 67.22; ranking-only also retrieves irrelevant evidence.
  Python/SQL self-retrieval at 100 establishes listed terms only, not proficiency.
  CANDIDATE_EVIDENCE (14/15 only, 12/15 retention at inherited pair reference) is
  NOT a verified support label. No overall fit/accuracy estimate or deployment
  approval inferred. Education/dates deliberately redacted cannot imply deficits.
- Raw results and assistant review preserved in experiments/live-cv-job-v1.
  This private profile is not training/calibration/model-selection data. Next
  generic skill/no-answer evaluation must be independent of this CV; do not fit
  a new threshold/blacklist or rewrite outputs to hide this failure.

## Isolated AI1 Shadow HTTP Integration (2026-10-22)

- Standalone factory: app.experimental.shadow_main:create_app. NOT imported or registered by
  app.main, MatchingService, worker, event publisher or active routes. No DB or
  RabbitMQ startup; no AI2 fit score, training label, LLM or hiring decision.
- Explicit MATCHING_SHADOW_MANIFEST and dedicated MATCHING_SHADOW_TOKEN (>=16
  characters) required. No `.env` edits, default checkpoint or production-token
  fallback. Bind loopback/internal only, one Uvicorn worker; this is not a public API.
- GET /health reports mode/model-version/readiness/busy, no body data or secrets.
  POST /api/v1/shadow/requirements accepts JSON {job: JobMatchingSnapshot,
  candidate: CandidateMatchingSnapshot}, requires x-internal-service-token.
  Output: model_version, weights_sha256, original requirement/hits/source IDs,
  comparison_score/order/reason codes and inference diagnostics. No totalScore.
  All automatically_supported/candidate_rejected/is_training_label=false;
  requires_manual_review=true, production_changed=false.
- Verified runtime: app/experimental/shadow_runtime.py. Manifest requires exact ten
  safetensors/Transformer/Pooling artifacts with SHA256, relative in-deployment
  path, no symlink/extra code, 256-token context and 384 dimensions. Offline CPU,
  trust_remote_code=false, safetensors/local-files-only; load error fails startup,
  inference error returns 503 without lexical fallback or raw exception details.
  Checksums bind configured artifacts; they are not a cryptographic signature.
- Per-request batch encoding reuses shared normalization, original text and IDs;
  (cosine+1)*50, no source weighting, containment shortcut or bins. Threshold 67
  remains inherited train-fit diagnostic, NOT entailment/fit probability.
  No persistent request/embedding cache, DB write or provider call. Truncation is
  reported in diagnostics; original text returned is not proof all of it was encoded.
- Limits: actual streamed body <=128 KiB (not just Content-Length), <=64 requirement
  blocks, <=256 evidence passages, <=5000 characters per normalized passage.
  Invalid snapshots return generic 422 without echoing input, wrong media 415,
  excessive body 413, invalid token 403, busy/model failure 503, wait deadline 504.
  Deadline defaults to 30 seconds. Native CPU work cannot be forcibly cancelled:
  busy slot remains held until actual completion after timeout/client cancellation.
  One encoder slot, no inference queue; not a multi-user capacity claim.
- Preparation: training/ai1/prepare_shadow_deployment.py --arm explicitly selects
  either arm and creates shadow-<arm>.json beside existing exported models without
  duplicating weights or promoting a winner. Optional --zip packages only manifest
  and model allowlist; runtime service code/dependencies are still required.
- Actual loopback Uvicorn integration: training/ai1/check_shadow_http.py. Both arms,
  four fictional snapshots x EN/VI = 8 pairs / 64 requirement variants per arm.
  Original ID/text, complete Top-3, order, flags and cues match previous diagnostic;
  max score difference 1.20e-5 on 0..100 scale. Actual HTTP error/empty-CV checks
  pass; model failure/checksum/timeout/no-overlap behavior additionally unit-tested.
- Warm sequential HTTP median .119s / .115s on these small fixtures, NOT SLA/load
  benchmark; first model initialization ~25.9s includes library imports/hash/load,
  later process-warm model load .895s is not a comparable cold-start measurement.
  130 service tests + 661 dataset/tool tests pass. Test servers shut down cleanly.
- Protected active code/config and canonical dataset pointer hashes unchanged.
  This verifies snapshot/encoder/HTTP integration only, NOT PDF parsing, real
  candidate/job-service snapshot correctness, DB/event workflows, UI, concurrency
  capacity, independent gold accuracy or production release approval.

## Automatic Component Analysis Pilot (2026-10-22)

- New isolated contract: app/experimental/automatic_evidence_analysis.py. Unverified
  LLM proposes components, AND-of-OR groups, context requirements and source-cited
  ENTAILS/PARTIAL/UNKNOWN/CONTRADICTS relations. Existing deterministic composition
  checks supplied relations; it does NOT independently prove their truth.
- Whole requirement ID/text and supplied evidence are externally bound. Unknown
  component/source IDs, invented or rewritten quotes, duplicate claims/groups,
  unused concepts and extra fit/hiring/priority-override fields are rejected.
  Exact citation integrity cannot establish semantic correctness or context truth.
- MODEL_PROPOSED_* statuses distinguish these outputs from assistant-reviewed
  claims. analysis_origin=unverified_llm_not_assistant_review, semantic_accuracy_verified=false,
  requires_hr_review=true, automatically_supported=false, candidate_rejected=false,
  is_training_label=false. Any inherited composition-engine metadata does not
  grant human-reviewed provenance to LLM relations.
- Runner: training/ai1/try_automatic_coverage.py. User-authorized four-request cap,
  exclusive pre-call request journal and run lock, max_retries=0, streaming/raw
  response checkpoints, immutable prompt/input/code/provider binding. Failed or
  uncertain requests never replay automatically; valid cached responses are
  revalidated without another request. Uses existing CV-parser-aligned provider
  transport, not a new active matching-service dependency or endpoint.
- Actual four ModelAPI responses: IT/Finance/Sales overall partial proposals
  agree with prior assistant review; HR proposes an additional continuity/context
  prerequisite and remains incomplete despite recruitment + onboarding support.
  Treat this as interpretation disagreement, not a verified candidate deficit.
  IT's Docker-to-IAM PARTIAL relation is also broader than its source warrants.
- Four schema/quote-valid outputs are NOT four semantically correct decisions.
  The 3/4 coarse agreement is not a reliable accuracy estimate. Previously
  inspected fictional cases, assistant-reviewed, not independent gold.
- 4/4 requests used, no retries; provider reports 3,669 input + 3,041 output =
  6,710 total tokens, currency cost unverified. Only requirement, priority and
  retrieved original Top-3 were sent: no personal CV, model score, expected labels,
  reviewed components or full-CV oracle. Raw outputs preserved unchanged.
- No runtime/API/AI2 feature/dataset changes. LLM remains optional unverified
  explanatory assistance, not a new authority for scores or training labels.
  Stored prompt refinements are proposals only, not re-tested; no further paid
  requests authorized by the resulting review artifact.

## Reviewed Shadow Coverage Pipeline (2026-10-22)

- New isolated module: app/experimental/shadow_pipeline.py. compose_retrieval_review
  accepts an actual ShadowMatch plus an exact-ID/text-bound CapabilityPlan and
  source-cited CapabilityClaims. Uses existing check_capabilities for reviewed
  AND-of-OR logic. This is NOT a semantic component extractor or encoder reasoning.
- All claims must be within returned hits. An out-of-window source, fabricated
  quote, mismatched requirement or reordered/duplicate retrieval window raises
  ValueError. No silent full-CV rescue for a Top-3 retrieval failure. Unknown
  relationships, missing common context or incomplete retrieval require review.
- Output separates retrieval, composition and unresolved OR groups, scoped to
  retrieved_evidence_only. automatically_supported=false, candidate_rejected=false,
  requires_manual_review=true, is_training_label=false. NOT_ESTABLISHED means no
  reviewed support in this window, not absence of candidate capability.
- Runner: training/ai1/check_shadow_coverage.py. Frozen reviewed packet and actual
  CPU checkpoints; simulated Candidate/JobMatchingSnapshots preserve all section
  IDs and original text. Container categories are fixture annotations, not a test
  of PDF parsing or real section classification. No personal CV scoring in this run.
- Each arm: 64 EN/VI requirement variants preserve prior raw-cosine ranking; max
  scaled-score difference 8.95e-6. Scores use (clamped cosine + 1)*50, no exact/
  substring shortcut, source multiplier, score bin or lexical fallback. Reference
  threshold 67 is inherited train-fit pair calibration, not an entailment decision.
- Focused composition: 8 reviewed source requirements, correlated EN/VI = 16
  variants/arm. Of 8 answerable multi-passage variants, retention covers 7 and
  ranking-only 3 inside Top-3. The 8 incomplete variants/arm remain non-covered;
  this verifies handling of supplied annotations, NOT automated classification
  accuracy. Sales closing at rank four remains a visible retrieval miss.
- Full-corpus manual-review result is separately recorded for diagnostic comparison
  only, never passed into window composition. Labels/plans authored after earlier
  retrieval scores were inspected; post-hoc development integration test, not gold.
- Not wired to service routes, default scorer, AI2 features or dataset export.
  Matching API payload and active runtime behavior unchanged. Automatic component
  extraction and claim assessment still require separate evaluation before wiring.

## External Ranking Diagnostics (2026-10-22)

- Runner: training/ai1/evaluate_external_ranking.py. New fictional four-domain
  packet: training/ai1/experiments/external-ranking-v1/stress_packet.json.
  Protocol hash 6868662a79f9e26878c02ac25508d33e6e282302da36bb1f28d93c971c8b263c
  binds labels, all model artifacts and scoring code before new stress scores.
  Source-overlap audit: zero exact/5-token-Jaccard>=.8 matches to canonical texts,
  max Jaccard .0625; this does not exclude semantic/pretraining overlap.
- Four fictional English CVs, 32 requirements, correlated EN/VI variants =
  64 queries. Strict MRR: 32 variants with direct evidence; complete-support@3:
  40 variants with single/joint full support. Other 24 queries excluded from
  success denominator, NOT classified as successful abstentions. Assistant-authored
  after earlier development results; not independent gold or representative CVs.
- MRR / complete-support@3: BM25 .724740 / 31 of 40; pretrained .968750 / 38;
  V3 .704241 / 25; ranking-only .937500 / 35; retention .968750 / 39.
  Retention: IT/finance/HR 10/10 variants each, Sales 9/10. Missing Sales result
  requires closing plus forecasting; closing passage ranked fourth on EN query.
- Previously inspected redacted real-CV packet replay: all three pretrained /
  ranking-only / retention retrieve full support on 6/6 answerable requirements;
  V3 3/6, BM25 3/6. This is old development data, not new independent evidence,
  not used for checkpoint/hyperparameter/threshold selection. No raw PDF read,
  original identifiers saved, external API call or new personal content retained.
- Encoder outputs embeddings, raw cosine and derived retrieval order only.
  Partial/full/joint/missing labels are fixed assistant annotations, not model
  reasoning or automatic judgments. Fresh stress and previously seen real-CV
  suites remain separate; no pooled claims or forced deployment winner.
- No training, threshold fitting, canonical edits, reserved test scoring or
  production/API changes. Results support further shadow integration checks,
  not universal superiority over pretrained or automatic entailment approval.

## GPU Ranking Result Verified (2026-10-22)

- Reviewer: training/ai1/review_ranking_result.py. Safe import, exact frozen
  input/config/code/base bindings, member hashes, epoch/guard recomputation and
  selected weight checks. Full Kaggle run: 465 steps / 3 epochs per arm; both
  eligible selected checkpoints are epoch 1. Model-only artifact location:
  training/ai1/exports/kaggle-ranking-v1/models/{ranking-only,ranking-retention}.
- Local CPU replay: 552 reference source queries / 1,104 EN/VI variants,
  all orders and aggregate metrics identical to GPU; max cosine difference
  4.18e-7. Pair diagnostics including train-fitted threshold match exactly.
  Token IDs match pretrained on all 7,691 replay texts; backend identical.
  Do not apply a Mistral regex patch to these BERT tokenizers.
- Reference MRR / Hit@3: ranking-only .689476 / .921068, retention .616519 /
  .883502; pretrained .549718 / .795397, historical V3 .702102 / .909859.
  Known-positive-reference retrieval, not exhaustive relevance or hiring accuracy.
- Existing train-only geometry protocol: effective rank 80.40 / 81.09 vs
  V3 13.92 and pretrained 83.46 on the same 496 texts. Unlabeled cross-family
  control mean cosine .2274 / .2408 vs V3 .7460; not inferred negative labels
  and not independent generalization evidence. No new threshold tuning.
- IT hard-negative FPR remains .607143 / .678571 at threshold 67 calibrated
  on train. No automatic entailment approval or production promotion. One seed,
  assistant-reviewed development validation already inspected, no independent
  gold. Personal CV excluded from training/selection; reserved test not scored.
- No canonical dataset, ranking feature, API payload or runtime changes.
  Next: fixed-protocol fresh authorized JD/CV evaluation before deployment,
  not another training iteration based solely on development validation.

## Portable GPU Ranking Experiment (2026-10-22)

- New isolated trainer: apps/matching-service/ml/train_ranking.py; input/bundle
  preparer: training/ai1/prepare_ranking_gpu.py. Frozen input ranking-b503be5ab1a1
  contains 1,233 inherited-label source comparisons, 5,814 unique train replay
  texts and 552 positive-reference validation source queries (paired EN/VI).
  No canonical labels, runtime extractor, matching API or AI2 feature changes.
- Uniform shuffled source-group traversal without replacement; EN/VI together.
  Correct minibatch ranking normalization uses fixed global mean variant weight,
  rather than a new denominator per batch. Full replay partitions ALL unique
  train texts exactly once per epoch. Two fixed lambda=0/1 arms share pretrained,
  seed, batch/replay order, optimizer and scheduler. No inferred negatives.
- Select each arm's earliest highest family-balanced job-macro reference MRR
  among trained epochs passing fixed engineering guards: MRR >= pretrained,
  reference Hit@3 and slice MRR drops <= .02, train replay cosine drift <= .10.
  No qualifying epoch means no exported candidate; no automatic guard relaxation,
  arm promotion or binary entailment approval. Previously inspected development
  validation, assistant-reviewed, not independent gold or teacher-mandated cutoffs.
- Full mode requires CUDA. Local trainer smoke completed two steps/arm with no
  model export; full CUDA/checkpoint save/reload remains to be exercised on Kaggle.
  Baseline smoke's eight variants match existing reference order, max cosine
  difference 1.49e-7. Pair classification is diagnostic, train-fitted threshold,
  computed separately after selected checkpoint reload, not a selection criterion.
- Bundle nexhire-ai1-ranking-ed4f9745d74a.zip uses explicit file allowlists and
  SHA256 verification, excludes personal CV experiments, environment files and
  reserved test. Notebook accepts original ZIP or Kaggle auto-extracted input,
  checks traversal/duplicate members, GPU availability and existing outputs.
  A repeated full run requires a fresh output directory/session, not overwrite.
- Input/config/code/model are hash-bound; dedicated notebook and RANKING_GPU.md
  are inside the bundle. Main entry is training/ai1/README.md. This is GPU package
  readiness, NOT a completed new AI1 model or production release.

## Ranking Retention Objective Smoke (2026-10-22)

- Source review covers all 27 flagged combinations / 22 negative records:
  24 relative preferences retained, three selected-text constraints held.
  These are assistant judgments, NOT fresh binary entailment gold. Other 1,209
  combinations inherit original annotations and were not manually re-reviewed
  in this step. Original labels and the immutable candidate plan are unchanged.
- `apps/matching-service/ml/ranking_objective.py` implements weighted cosine
  hinge ranking, margin .1, plus cosine retention to DETACHED frozen pretrained
  embeddings. Teacher and initial student are local pretrained Sentence Transformers,
  not LLMs or v3 continuations. No implicit in-batch negative labels are inferred.
- Source weights equalize family/job/anchor mass over a complete traversal;
  correlated EN/VI variants receive .5 each. This is loss weighting, not a claim
  that a full-training sampler is already implemented. Replay uses unique original
  train texts outside duplicated triplet slots and receives no inferred labels.
- `training/ai1/check_ranking_objective.py` checks source/review/model/code hashes,
  freezes objective_protocol.json, then trains two TEMPORARY CPU models for four
  steps each, lambda=0 and 1. Fixed seed and same source batches, 16 train source
  comparisons / 64 train replay texts. No full model export, validation/test inference,
  private CV training/hyperparameter selection, API calls or automatic promotion.
- Functional tests match official cosine TripletLoss explicitly, not its default
  Euclidean distance/margin=5; test finite gradients, teacher detachment, EN/VI
  weighting and source-split guards. Replay eval cosine drift .007672 vs .004416
  is a tiny functional diagnostic, NOT evidence of improved matching accuracy.
- 1,233 source combinations are eligible for smoke with inherited-label caveats;
  full_training_approved remains false. A full trainer, repetition-aware sampling,
  full replay schedule and retrieval validation/checkpoint protocol remain needed.
  No HTTP schema, matching response or AI2 feature/scoring changes.
- Read the latest section in training/ai1/review/train-geometry-v1/RESULTS.md.

## Train-Only Geometry And Ranking Preparation (2026-10-22)

- `training/ai1/diagnose_train_geometry.py` scores only 3,684 existing train
  source pairs / 7,368 correlated EN/VI variants with pretrained and v3. Input
  manifest, model artifacts and historical training code hashes are checked;
  protocol is frozen before scoring. No private CV/new-CV artifacts, API calls,
  validation/test inference, threshold search, training or runtime changes.
- Official installed ContrastiveLoss agrees with closed-form cosine-distance
  loss within 1e-6. Positive loss pulls cosine to 1; negative loss is zero at
  cosine <= .5 for margin .5. This boundary is NOT a runtime decision threshold.
- Train AUC .886 -> .989, but 256 UNLABELED cross-family pair mean cosine
  .237 -> .746. Mean off-diagonal cosine on 496 selected unique train strings
  .268 -> .754; centered effective rank 83.46 -> 13.92. Descriptive concentration
  evidence, not total collapse, causal proof, false-positive rate or external accuracy.
- Exact normalized pair-label conflicts: zero; 22 negative source groups lie
  within positive graph components. This is tension between ideal zero-distance
  positive constraints and negative constraints, not authorization to relabel.
  Graph anchor-string counts include EN/VI, not independent source requirements.
- `training/ai1/prepare_ranking_experiment.py` creates a NOT_TRAINING_READY
  candidate manifest from existing labeled train pairs: 1,236 source triplets,
  2,472 correlated variants, four families. 27 combinations have graph-tension
  flags requiring review. No unobserved pair is inferred negative. Combinations
  reuse original records and must not be treated as independent new examples.
- Proposed, not implemented/proven training objective: audited ranking constraints
  with pretrained representation retention. Constraint review, repetition-aware
  sampling and objective tests/ablation remain prerequisites. The private CV must
  not enter training, calibration, hyperparameter or checkpoint selection.
- Read `training/ai1/review/train-geometry-v1/RESULTS.md`. Canonical labels,
  dataset/HTTP schemas, semantic_score generation and production ranking unchanged.

## New Real-CV Technical-Excerpt Diagnostic (2026-10-22)

- `training/ai1/evaluate_new_cv.py` performs local Keyword/BM25/pretrained/v3
  inference only. Inputs: 14 deidentified technical excerpts from one user-provided
  real CV, 22 paraphrased selected requirements from five public employer JDs.
  Original PDF/path/name/contact/employers/institutions/dates/project names are NOT
  retained in experiment artifacts. Technical descriptions can still be linkable;
  do not publish or use this private diagnostic for training. No CV API calls.
- Sources, assistant grades and policy are frozen in experiments/new-cv-v1 before
  scores. No exact/five-token-Jaccard >= .8 canonical text duplicates detected;
  this is not proof of absence from pretraining or every historical pilot.
- Grade 2 = direct evidence, 1 = related/partial, 0 = no substantive support in
  retained excerpts. Strict metrics exclude unanswerable queries with explicit
  denominators, not as successes. Separate full-support@K requires a complete
  reviewed singleton/joint evidence set. Graded NDCG treats partial evidence as
  useful, NOT full proof. No threshold or automatic rejection is selected.
- Five strict-answerable queries: pretrained MRR .800 / Recall@3 1.000;
  v3 .567 / .600. Six singleton/joint-answerable queries: full-support@3
  pretrained 6/6, v3 3/6. All answerable queries are IT; other families are
  no-support controls, not a four-domain positive-retrieval benchmark.
- V3 top cosine on 16 no-full-support queries remains .884-.982; cosine is NOT
  fit probability. One snapshot excerpt ranks first in 13/22 v3 queries.
  This is a generalization warning, not causal proof of a training/data defect.
  One user CV and assistant judgments cannot establish independent accuracy.
- Hold v3 promotion pending train-only diagnosis. Do not silently swap runtime,
  regenerate data, relabel from predictions or change AI2 features. No HTTP schema,
  matching API, production score or reserved canonical test inference changes.
  Packet/model/code/cache hashes are checked on rerun. Original inputs must never
  be restored to public logs or committed datasets for reproducibility.

## Experimental Evidence Gap Analysis (2026-10-22)

- Offline only: `training/ai1/try_evidence_analysis.py` passes one requirement,
  authoritative priority, reference date and supplied passages to an LLM. Existing
  AI1 v3 retrieval supplies top3 for two cases; two extra cases are assistant-written
  synthetic controls, not unseen real CVs. No HTTP endpoint or runtime integration.
- Contract/prompt: `apps/matching-service/app/experimental/evidence_analysis.py`.
  Output separates `direct_support`, `related_support`,
  `not_established_components`, `contradictions`, `explanation`, `hr_questions`.
  Each positive/contradictory finding requires exact quotes and valid source IDs.
  Validation checks structure/source integrity, NOT entailment or truthful reasoning.
- Assessment is SUPPORTED / RELATED_BUT_INCOMPLETE / NOT_ESTABLISHED /
  CONTRADICTED / REVIEW_REQUIRED. These are evidence-only experimental assessments,
  NOT existing match-result fields, probabilities, candidate fit labels or decisions.
  Silence is not contradiction; preferred conditions cannot automatically reject.
- Four paid streaming requests, SDK retries disabled: three outputs passed local
  contract validation; one was blocked for a rewritten quote. The design-tenure
  case also showed an overly strict interpretation; a cloud probe conflated lack
  of professional experience with lack of familiarity. No claim of measured accuracy.
- Raw responses, prompt, packet and assistant review:
  `training/ai1/review/evidence-analysis-pilot-v1/`. Total reported usage 22,703
  tokens; money cost unverified. Failed/uncertain requests never replay automatically.
  Do not remove request states to bypass this control.
- No dataset edits, model training, ranking-feature changes, promotion or reopening
  of paused dataset generation. Requires HR review; not ready for production.

## Existing AI1 Candidate Evaluation (2026-10-22)

- `training/ai1/evaluate_candidates.py` compares actual local BM25/pretrained/v1/v2/v3
  inference, not reviewed-claim rules. Policy lives in configs/evaluation.json;
  source/model/code/pilot bindings and policy are frozen under
  review/candidate-evaluation-v1 before supplementary inference. No training,
  automatic promotion, HTTP/settings/schema/feature change or reserved test scoring.
- Canonical validation inventory: 76 jobs/304 CVs; reference evaluation uses 552
  ENTAILS requirement/CV cases from 206 CVs, two correlated EN/VI variants each.
  Only actual source evidence IDs with bound quotes are accepted. 731 PARTIAL,
  379 NOT_MENTIONED and 106 IRRELEVANT cells are excluded, not counted correct
  or converted to negatives. A missed known reference is NOT a proven semantic
  error: other unlisted passages may also be relevant.
- Same within-CV source corpus and context 256 for all embeddings, continuous raw
  cosine without runtime shortcuts, bins, weights or decision threshold. BM25
  uses rank-bm25, k1=1.5/b=.75, Unicode/IT tokenization without translation. Both
  languages, all four families, top ties and truncation are reported. No truncation
  among 1,717 encoded unique strings. This is not whole-CV or applicant ranking.
- Primary is family-balanced job-macro reference MRR: BM25 .591919, pretrained
  .549718, v1 .662417, v2 .701528, v3 .702102. Job-cluster resampling keeps CVs and
  languages together; intervals are descriptive development sensitivity, not
  independent population guarantees or corrections for repeated model selection.
- Under the frozen engineering policy, v3 is an exploratory retrieval candidate,
  not a production-selected model. V3-v2 difference .000574 is small and a separate
  paired job-resampling diagnostic spans roughly -.01489 to +.01507; v2 has higher
  reference Hit@3. Do not claim v3 is conclusively better than v2.
- Existing locked 100-case pilot is re-evaluated with all five methods and its
  same exhaustive reviewed support sets. V3 full-support@3 .954545 applies only
  to 33 full-answer cases/66 correlated variants, NOT every pilot case or CV.
- Pair classification remains separately reported from verified Kaggle/CPU replay
  artifacts with train-fitted thresholds. All three fail current family hard-FPR
  targets; automatic_entailment_approved remains false, production_model_selected
  remains null. Retrieval success cannot supersede classification/calibration failure.
- Engineering targets were chosen after exposure to prior development results,
  before these supplementary reference scores; they are not teacher mandates or
  a fresh independent preregistration. Assistant labels remain non-gold. Original
  v2/v3 pair-classification rejection remains valid for that separate task.
- Cached method results are source/lock/model-bound; ranks, exact query/language
  coverage, metrics and summaries are recomputed from stored scores on resume.
  Existing results are immutable. Decision artifact is decision.json in the same
  evaluation directory. No dataset relabeling, model-weight change or AI2 cache reuse.
- Next step is a versioned retrieval inference interface with evidence provenance
  and isolated integration tests, not automatic binary decisions or another v4 run.

## Reviewed Capability Composition Shadow (2026-10-22)

- `app/experimental/shadow_capabilities.py` adds explicit reviewed plans: multiple
  AND groups with OR alternatives, stable concept IDs, original requirement text,
  reviewer/rationale, interpretation confirmation and contextual composition policy.
  Each claim binds this requirement, concept, actual evidence ID, verbatim quote,
  reviewed relation (ENTAILS/PARTIAL/UNKNOWN/CONTRADICTS) and optional context ID.
- This is a logical checker of reviewed inputs, NOT semantic inference or keyword
  entailment. Full claims must cover every group; partials cannot become full.
  A clean OR alternative may satisfy its group even when another alternative is
  unknown; ambiguous concepts cannot themselves supply a full witness. Unknown
  and contradictory assertions remain visible for review.
- Where common engagement/team context is required, supporting claims must share
  an explicitly reviewed context. Independent competencies may span different jobs
  when explicitly allowed. The code does not infer contextual identity from prose.
  Source quote binding cannot establish that the reviewer chose the correct relation.
- Unconfirmed requirement interpretation forces REVIEW_REQUIRED, even if all
  proposed components appear covered. A future duty concerning a named product
  is not automatically a historical exact-product prerequisite. The two affected
  Sales diagnostics are held; canonical labels remain untouched, not auto-corrected.
- Results: REVIEWED_COMPONENTS_COVERED, PARTIAL_REVIEWED_COVERAGE,
  NOT_ESTABLISHED, REVIEW_REQUIRED. Covered means only that reviewed components
  compose; automatically_supported/candidate_rejected remain false, manual review
  remains true. No hiring/eligibility decision, numeric fit or feature replacement.
- `dataset/evaluate_shadow_capabilities.py` checks 12 exposed train cases across
  four families: 5 covered, 2 partial, 3 not established, 2 interpretation reviews.
  Covered witnesses agree with the prior locked source review and occur in cached
  v1 top3 for EN/VI. These are consistency/functional diagnostics, not model accuracy.
  A deliberately fabricated relation is unit-tested to surface a source-review
  disagreement; CLI fails when expectations or full-witness source checks differ.
- Source/model/cache/review/code hashes are bound in
  `dataset/evaluation/abstention-train-v1/capability_results.json`. Review explicitly
  acknowledges prior model-score exposure; no new blind/independent-gold claim.
  No new inference, training, API call, validation/test scoring or runtime integration.
- Conditions checker policy advances to reviewed-source-conditions-shadow-v2:
  conflicting positive/negative assertions of the same reviewed credential identity
  require review. Explicit disjoint designation_groups can establish alias identity;
  aliases are not guessed globally. An unmet different OR credential does not negate
  an established one. Updated seven-case diagnostic is condition_results_v2.json;
  condition_results.json remains the historical v1 result, not a new model version.
- All current dataset, snapshot, HTTP and eight-feature contracts remain unchanged.
  Automatic extraction/relation prediction and broad semantic validation remain
  unfinished; these checks do not resolve failed retrieval calibration or promote AI1.

## Reviewed Source Conditions Shadow (2026-10-22)

- `app/experimental/shadow_conditions.py` is a standalone structured-input checker;
  not integrated with retrieval, MatchingScorer, HTTP APIs, settings or AI2 features.
  No schema migration, canonical data/label change or automatic promotion.
- Input requires a reviewed requirement, explicitly accepted certificate names or
  month bounds, reviewer identity and source-bound claims. Claim quotes must occur
  verbatim under the supplied evidence ID. Polarity, accepted alternatives and
  professional scope are reviewed inputs, NOT inferred by this module. An incorrect
  reviewed extraction can still yield an incorrect result; no general parser claim.
- Certificate matching uses explicit reviewed names and token boundaries, never
  cosine or degree/tax-work inference. Affirmed/negative/unknown claims are distinct.
  No claim means `NOT_ESTABLISHED`, not the candidate lacks the credential. Supporting
  text cannot authenticate a certificate or prove current validity.
- Experience requires ISO YYYY-MM dates bound to quotes, explicit English
  present/current for open ends and an external fixed reference month. Scope must
  be confirmed; unknown scope requires review. Reject malformed/future intervals.
  Union overlapping periods; omit unknown boundary months for a conservative
  full-month lower bound. No wall-clock tenure or guessed year-only dates.
- Result statuses: `TEXT_SUPPORTED`, `NOT_ESTABLISHED`, `REVIEW_REQUIRED`,
  `OBSERVED_DURATION_BELOW_MINIMUM`, `OBSERVED_DURATION_ABOVE_RANGE`. Duration
  statuses concern only supplied reviewed periods, not complete career history.
  A lower bound inside an explicit range cannot prove its upper bound. Preferred
  criteria do not impose a fit cap. All results retain manual review, no automatic
  support decision and no candidate rejection; no composite hiring score is created.
- `dataset/evaluate_shadow_conditions.py` checks seven source-bound train examples
  against reviewed expectations. Outputs bind packet, condition review, canonical
  source and checker code hashes in `evaluation/abstention-train-v1/condition_results.json`.
  Seven matches are functional diagnostics, NOT evaluation accuracy or independent
  gold. No validation/test scoring, new model inference, training or paid calls.
- Automatic condition extraction, other skill/business conditions, broader
  evaluation and retrieval integration remain unfinished. Existing calibration
  failure is not resolved or reclassified as production-ready by these checks.

## Train-Only Retrieval Gate Calibration (2026-10-22)

- New offline tools: `dataset/prepare_abstention_calibration.py` and
  `dataset/calibrate_retrieval_gate.py`. Artifacts are isolated under
  `dataset/evaluation/abstention-train-v1/`; no payload, database, environment,
  runtime policy, canonical label, model weight or ranking feature changed.
- Four hash-selected train JDs, one per family, two annotation-stratified CVs
  each: 56 source cases, 24 full answer, 10 partial-only, 22 no supplied support.
  Exhaustive supplied-section assistant review and engineering criteria are
  hash-locked before encoding. This is in-sample development review, not gold.
- Calibration target is any partial/full support signal, NOT entailment, skill
  fulfillment or applicant fitness. Correlated bilingual cases count once:
  retention requires both EN/VI scores above threshold; a no-support case counts
  as a false candidate if either variant passes. Max cosine is mapped to 0–100
  and rounded to two decimals, without source weights or runtime bins.
- Predeclared integer grid 0–100, minimum 10 positive/10 negative source cases,
  any-support recall >=80%, full-answer recall >=90%, no-support false candidate
  rate <=10%. No grid threshold meets every criterion. No policy is published,
  no criterion is relaxed post-score; this is not proof against all continuous
  thresholds, larger calibration samples or alternative methods.
- Existing train-pair reference 91 is diagnostic only: train retains 30/34 any
  support cases, falsely flags 3/22 no-support cases. Fixed old validation retains
  51/58 and falsely flags 10/42 respectively. Retention does not verify that the
  selected passage itself supports the requirement. No validation threshold fit
  or reserved test scoring. Dataset/source and verified model hashes are checked.
- Existing retrieval selection/review helpers now allow explicit train opt-in;
  their defaults remain validation-only and test is prohibited. Historical result
  files retain their original code hashes; they are not rewritten as new results.
- Next work is source-grounded condition checking in shadow, not another model
  training run or automatic promotion. All assistant-review/non-gold and manual
  decision limitations remain. API calls=0, models trained=0, production_ready=false.

## Opt-In Matcher Shadow (2026-10-22)

- `app/experimental/shadow_requirement_matcher.py` is isolated from active
  MatchingScorer/MatchingService. No settings/env switch, HTTP endpoint, database
  schema or current MatchScores/RequirementEvidence field changed. No automatic
  production deployment, AI2 feature-cache replacement or artifact promotion.
- Policy version `requirement-retrieval-shadow-v1` requires explicit model
  version, weight SHA256, train-fitted pair reference threshold and top-k. The
  backend must remain that version throughout scoring; silent lexical fallback,
  malformed/duplicate evidence IDs and nonfinite scores fail closed.
- Shadow preserves requirements by HTML block/list/newline, never comma/semicolon
  token splitting. Unstructured description fallback is marked unreviewed. Each
  hit retains original text, ID, source and continuous cosine-derived score.
  No EXACT/CONTAINMENT bypass, SOURCE_WEIGHTS or semantic bins are applied.
- Shadow-only statuses: `CANDIDATE_EVIDENCE`, `INSUFFICIENT_SIGNAL`,
  `REVIEW_REQUIRED`, `NO_EVIDENCE`, `SCORER_UNAVAILABLE`. None is an entailment,
  verified PARTIAL label, hiring decision or candidate rejection. All results
  require manual review and set automatically_supported/candidate_rejected false.
  Narrow explicit-negation warnings do not claim general negation understanding.
- `dataset/evaluate_matcher_shadow.py` reuses hash-bound v1 cosine scores from
  the locked 100-case development pilot. Legacy evidence selection is compared
  on the same atomic queries; splitting changes are reported separately.
  Top-1 full support: legacy 30.30%, shadow 66.67% among 66 correlated answerable
  EN/VI variants. Shadow preserves raw-retrieval MRR/Recall from the pilot.
- Pair threshold 91 is a reference, not a retrieval-calibrated acceptance gate:
  19/84 no-reviewed-support variants still produce candidate evidence. All 200
  variants defer support decisions; this is not claimed as a classifier win.
  Output: `dataset/evaluation/retrieval-pilot-v1/shadow_v1.json`, with policy and
  source/review/benchmark/code/model bindings. No validation-based threshold fit.
- Further calibration requires train-only reviewed multi-evidence/no-answer cases
  and a new explicit policy. Source dataset, labels, reserved test and existing
  feature schema/extractor remain unchanged. Independent-gold/production flags false.

## Multi-Evidence Retrieval Development Pilot (2026-10-21)

- `dataset/prepare_retrieval_benchmark.py` freezes 2 hash-selected validation JDs
  per family, then annotation-stratifies 2 of the 4 source CVs by known support,
  not model predictions. 8 JDs / 16 CVs / 100 source queries, 200 correlated EN/VI
  variants. Canonical source manifests bind packet and model artifacts.
- Source-only assistant review explicitly lists full standalone passages, partial
  passages and jointly sufficient bundles. Unlisted passages do not establish the
  selected criterion; this is not candidate-level absence/rejection or new train
  negatives. All CV sections and requirements require explicit coverage before
  `review_lock.json` is written and scoring can start. No post-score relabeling.
- Existing validation history and same-assistant review preclude independent gold.
  33 source queries have full support, 25 partial only, 42 no support in supplied
  sections. Strict Recall/MRR/full-support exclude no-full-answer queries; graded
  NDCG handles partials separately. No abstention/no-answer accuracy is claimed.
- BM25 uses pinned rank-bm25 0.2.2, raw relevance, no translation, k1=1.5/b=0.75.
  Pretrained and verified v1 use direct cosine with the same 256-token context;
  no source weighting, runtime bins or selected threshold. Candidate corpus is
  each CV's 4-5 source sections, not cross-CV ranking.
- Aggregate MRR: BM25 0.738, pretrained 0.740, v1 0.811. Full-support@3:
  84.85%, 90.91%, 90.91%. Mixed family/language results and small answerable sample
  prohibit production promotion. Per-language results/ties are recorded.
- Results and source review live at `dataset/evaluation/retrieval-pilot-v1/`.
  No canonical label, API payload, runtime scorer, ranking feature or trained
  artifact changed; test remains unscored. No GPU training or paid API calls.

## Dataset Foundation Audit (2026-10-21)

- `dataset/audit_training_foundation.py` extends the existing immutable-release
  audit with exact normalized text/split checks, strict evidence ID/text/source
  binding, same-passage annotation/binary-policy comparisons, train-only batching
  risks and ranking label/constant-feature checks. Output is separate at
  `dataset/audit/foundation/audit.json`; canonical files are never changed.
- Runtime IDs such as `profile/summary` are accepted only when the corresponding
  frozen snapshot field maps to exactly one profile source section. A text match
  in some other section cannot validate an incorrect evidence ID.
- All technical checks passed. 22 shared cross-split passages were manually read
  as education text, not duplicate complete CVs or duplicate labeled input pairs.
  Exact-match audit does not certify absence of semantic/near-duplicate leakage.
- Different annotation/selected-passage scopes (1,854 rows) are not automatically
  label conflicts or negatives. Existing 21 reviewed train quarantine groups
  remain proposals in canonical data and are already excluded in v2/v3 input.
- Raw MNRL readiness remains false: positive evidence repeats and the same query
  can have several legitimate positive passages. No missing annotation is converted
  into a hard negative; no sampler/label changes or new model training were made.
- This audit does not certify semantic label correctness, translation equivalence,
  independent gold or final AI2 features. API fields, label/split contract and
  runtime feature behavior remain unchanged; test is not scored or used to tune.

## AI1 In-Process Matching Diagnostic (2026-10-21)

- `training/ai1/check_pipeline.py` replays production MatchingScorer/RequirementMatcher
  with explicit local pretrained/v1 embeddings and WeightedRanker, using all 76
  validation JDs / 304 frozen synthetic CV snapshots in EN/VI. Source IDs/text,
  profile reference dates and artifact/runtime-code hashes are recorded. No test,
  PDF parser, HTTP clients, database, API generation, deployment or `.env` changes.
- Results: `training/ai1/review/pipeline-v1/{pretrained,v1}.json`; interpretation
  and next actions live in the main AI1 README, not a new dataset release.
- Current runtime substring containment accepts Java/JavaScript and explicit
  negation probes; hardcoded score bins/source weighting and punctuation splitting
  are not the calibrated AI1 pair classifier. Atomic source requirements are
  fragmented (884 EN/VI requirements -> 1,673 pieces across this validation set).
- Whole-CV semantic text exceeds the diagnostic 256-token context for 212/304 CVs.
  Global semanticScore is not a hiring probability or proof of entailment for
  each requirement. One reference evidence annotation is not exhaustive retrieval
  gold, and its relation cannot be assigned to another selected passage.
- These are findings, not silently applied scoring changes. Any subsequent fix
  must explicitly version feature extraction, preserve original text/IDs, avoid
  substring/negation shortcuts and revalidate compatible ranking features/artifacts.
  Do not transplant train-fit pair threshold 91 into retrieval as a proven policy.
  Existing API payload/schema, runtime behavior, dataset labels/splits and AI2
  feature files remain unchanged. Tests characterize failures, not production readiness.

## AI1 V3 Result Review (2026-10-21)

- Full v3 completed 1,383 steps and selected epoch 2. Verified import:
  `training/ai1/exports/kaggle-full-v3/model/`; export equals best checkpoint.
- Local CPU replay exactly matches Kaggle metrics/threshold; tokenizer token IDs
  and backend components match the original pretrained tokenizer.
- V2/v3 use identical input manifests/checksums, hyperparameters except experiment,
  pretrained baseline metrics and library versions. V3 records zero emphasized
  groups and uniform weight 1. No dataset regeneration or canonical edits.
- V3 F1 is 94.41% versus v1 94.70% / v2 94.81%. IT hard-negative FPR is
  64.29% versus v1 60.71% / v2 67.86%. Independently recomputed v1 guard fails;
  v3 is not promoted. Main comparison table: `training/ai1/README.md`.
- No runtime config, API payload, semantic-score feature, label or split changed.
  Test remains unscored and independent-gold/production readiness remains false.

## AI1 Uniform-Weight Ablation V3 (2026-10-21)

- Explicit `filtered-uniform-v3` config consumes the exact immutable v2 input
  revision `ai1-v2-03536a06b0c2`, with identical artifact hashes, records, labels,
  train/validation order and quarantine exclusions. No new dataset or API calls.
- Trainer first validates the original reviewed v2 group policy and quarantine
  protections, then returns weight 1 for every retained train variant. EN/VI
  grouping remains unchanged. Unknown experiment names fail closed.
- Full hyperparameters, seed, initialization, batch order, threshold-fit split
  and checkpoint selection are unchanged from v2. Existing v1/v2 behavior remains
  unchanged. Manifest records the distinct experiment and zero emphasized groups.
- Separate `kaggle-full-v3` run/export and v3 notebook/package prevent overwrites.
  Full-run v1 comparison uses the same exploratory guard; v2 comparison follows
  import/replay. CPU smoke is not a full trained model or production approval.
- No request/response payload, runtime semantic score, ranking feature, dataset
  label, validation or test contract changed. Test remains unscored.

## AI1 V2 Result Review (2026-10-21)

- Offline diagnostics (`training/ai1/diagnose_v2.py`) score only the unchanged
  validation hard-negative pairs, verify both imported runs and canonical source
  hashes, and create source-bound v1/v2 transition/token-length packets. Reading
  shortlists use train-only lexical overlap, not a semantic quality score. No
  diagnostic row, validation decision or model prediction becomes a train label.
- All 108 hard-negative validation variants fit the existing 256-token context.
  Diagnostics do not authorize changes to evaluation labels or runtime thresholds.
- Full v2 training completed (1,383 steps, selected epoch 2); verified export is
  `training/ai1/exports/kaggle-full-v2/model/`. V1 remains a separate reference.
- The predeclared comparison guard failed: overall F1 improved slightly, but
  IT hard-negative FPR rose from 60.71% to 67.86%. No automatic promotion.
- No API payload, runtime model/config, ranking feature, canonical dataset or
  split changed. Validation is assistant-reviewed; test remains unscored and
  independent-gold/production readiness remains false.

## AI1 Controlled V2 Preparation (2026-10-21)

- Train-only source review covers 123 IT/Sales hard-negative groups without model
  scores or held-out text. Source-bound assistant decisions keep 102 negatives and
  quarantine 21 groups (1 E, 10 P, 10 N). No automatic relabel or gold promotion.
- `training/ai1/prepare_v2.py` creates an immutable experiment input revision with
  7,368 train rows and the original 1,492 validation rows byte-for-byte. Canonical
  dataset records/IDs/splits and v1 input remain unchanged. Test is not packaged.
- Input schema `nexhire-ai1-training-input-v2` adds checksummed group-policy,
  review-provenance and v1-reference files. Every train group has weight 1 except
  38 source-reviewed specific confounders with weight 3. Runtime loader rejects
  quarantine reintroduction, positive/non-hard emphasis, held-out weights and
  emphasis selected outside the source review. EN/VI are kept together.
- Explicit `hard-negative-v2` configs reuse the official ContrastiveLoss by
  grouping per-weight reductions, not replacing its cosine-distance objective.
  No oversampling, unreviewed in-batch negatives or validation-to-train transfer.
  V2 starts from the same pretrained base, not from the validation-selected v1.
- Best epoch still uses validation balanced accuracy. A predeclared comparison
  additionally checks overall/language/family degradation and target hard-negative
  FPR against the frozen v1 results. Passing is exploratory, not independent gold
  or automatic deployment. Full v2 requires GPU; CPU smoke has passed.
- `kaggle_train_v2.ipynb` supports auto-extracted private inputs and retained ZIPs.
  Packaging is allowlisted and excludes test/secrets/raw history. V1 provenance
  remains verifiable against its archived original code/input bundle after trainer
  evolution. No HTTP DTO/env/runtime model, AI2 feature or production flag changes.

## AI1 IT/Sales Error Analysis (2026-10-21)

- `training/ai1/analyze_hard_negatives.py` replays both pretrained and fine-tuned
  models on all 31 IT/Sales hard-negative validation groups (62 EN/VI variants).
  Diagnostic scoring explicitly rejects test/train rows. Existing train-fitted
  thresholds 67/91 are reused; no threshold tuning is performed.
- Bound packets include the exact JD quote, selected evidence, translations,
  annotation pointers and context. Assistant decisions are separate: 21 groups
  remain clear negatives; 10 are proposed P/N policy holds, not confirmed relabels.
  Of 28 positive predictions, 14 are confirmed model false positives and 14 are
  in boundary groups. Seven confirmed false positives are new versus pretrained.
- The original validation scores, all labels and files in `dataset/current/`
  remain unchanged. Do not report improved metrics by selectively removing cases.
  A whole-CV PARTIAL annotation on another passage does not invalidate a negative
  pair; decisions here examine the selected passage itself.
- Confirmed errors involve .NET/Python, web/mobile, application-domain and
  outbound/inbound scope. A prospective v2 must review/mine negatives only in
  train, retain EN/VI groups and document any annotation revision independently;
  never move the inspected validation cases into train. No retraining, test scoring,
  runtime gate/DTO/env change or automatic production promotion occurs here.
- The existing `training/ai1/exports/kaggle-full-v1/REVIEW.md` remains the single
  concise human-facing report; machine-readable packets/decisions live beside it.

## Kaggle AI1 Artifact Review (2026-10-21)

- The supplied results ZIP is verified/imported by `training/ai1/review_result.py`.
  Per-file CRC/SHA-256, source manifest, train-only input snapshot, training code,
  exported evaluation, epoch selection and export/best-checkpoint equality are
  checked. Only one model copy is extracted; the original ZIP remains untouched.
- Full training completed 3 epochs / 1,392 steps. Epoch 2 was selected by weak
  validation balanced accuracy: 78.69% -> 92.21%; F1: 83.34% -> 94.70%.
  CPU replay reproduces the complete Kaggle threshold/metrics/slices exactly.
- All 7,038 checked strings have identical original/export token IDs; backend
  tokenizer components match as well. No Mistral regex patch is applied to BERT.
  The library warning is retained, not treated as proof of tokenizer corruption.
- This is still assistant-reviewed weak validation, NOT independent accuracy.
  Hard-negative FPR remains 60.71% for IT and increases to 32.35% for Sales.
  Keep the epoch-2 candidate for targeted validation error analysis before final
  test/deployment decisions; do not rewrite validation labels to improve metrics.
- Candidate: `training/ai1/exports/kaggle-full-v1/model/`; one concise review is
  next to it at `REVIEW.md`. No HTTP DTO/env/runtime scorer/dataset/split/AI2 feature
  changes, test scoring, retraining or readiness/gold promotion are performed.

## AI1 Training Pipeline (2026-10-21)

- `apps/matching-service/ml/train_semantic.py` adds isolated experimental
  fine-tuning using Sentence Transformers' binary cosine-distance ContrastiveLoss.
  `ml/semantic_evaluation.py` shares the existing half-weight weak metrics and
  train-only threshold calibration with the baseline evaluator.
- `training/ai1/prepare.py` validates the complete canonical release and freezes
  a checksummed train/validation-only snapshot, without editing `dataset/current/`.
  The optional ZIP uses a code/data/model allowlist: no test rows, secrets, .env,
  provider state or raw source history. Uploads to Kaggle must remain private.
- Every batch keeps EN/VI together (each weight 0.5), without independent variant
  oversampling or unreviewed in-batch negatives. The first experiment does not
  apply class weights. Only train batches receive gradients; validation chooses
  the highest-balanced-accuracy epoch, and test is never evaluated by this trainer.
- Full preset: 3 epochs, 8 bilingual groups per batch, learning rate 2e-5, context
  256, margin 0.5, seed 42, one GPU in FP32. Local CPU is restricted to smoke;
  Kaggle is convenient, not intrinsically required. No account/session has been
  launched on the user's behalf. Preserve Kaggle's CUDA-enabled PyTorch wheel.
- Runs are immutable by name under `training/ai1/runs/`; model-only best checkpoints
  are not optimizer-resume checkpoints. Full-run candidates are separately saved
  under `exports/<run>/model/` with evaluation and input/config/version provenance.
  Smoke runs never create a final export. Reload verification and numeric parameter
  comparison supplement the saved weight checksum; failures retain a failed status.
- Two-step local smoke succeeded, including actual parameter updates, save and
  reload. This is pipeline validation on tiny subsets, not completed fine-tuning
  or measured production accuracy. No runtime DTO/env/model, label, split, ranking
  feature or readiness flag changes. See `training/ai1/README.md` for the one-page
  workflow and `training/ai1/kaggle_train.ipynb` for GPU execution.

## AI1 Base Encoder Evaluation (2026-10-21)

- Current release is evaluated read-only by `dataset/evaluate_semantic_baseline.py`:
  calibrate thresholds on 7,410 weak train rows; compare on 1,492 validation rows.
  Test is not scored or used to choose context length. All EN/VI variant weights
  are 0.5. Dataset hashes and split assignments are unchanged.
- `--report-name` safely separates immutable baseline results. Optional
  `--max-seq-length` requires a local model and a named report, checks positional
  capacity and changes memory-only settings. Truncation is counted before encoding;
  model weights and tokenizer/config hashes are recorded. Inference stays offline,
  safetensors-only, without remote model code or uploading CV/JD text.
- English MiniLM, lexical and multilingual MiniLM (128/256 contexts) are compared.
  The multilingual 256 configuration is a provisional fine-tuning candidate:
  no observed train/validation truncation, but hard-negative FPR remains 38.0%
  and balanced accuracy is slightly lower than context 128. This is weak-label
  agreement, not independent correctness or a production promotion.
- Candidate metadata and one consolidated summary are under
  `dataset/evaluation/continuous500-assistant-a95700a36f80/`.
  No API DTO, environment, runtime model, label, feature or readiness flag changes.
  Fine-tuning remains the next separate task; AI2 features must be rebuilt afterward.

## Whole-Corpus Review Integrated (2026-10-21)

- All 500 source JDs / 2,000 CVs, 11,812 annotation cells and 5,827 bilingual
  semantic groups were read-reviewed by assistants. Release
  `continuous500-assistant-a95700a36f80` is canonical at `dataset/current/`.
- The source-bound overlay records 111 fit changes, 913 cell overrides and 578
  semantic decisions. Export retains 10,508 semantic rows / 5,254 EN/VI groups
  and 1,376 ranking rows / 344 complete JD groups. Uncertain cases remain
  excluded, not zero-filled. Original sources, timelines, snapshots, split
  assignments and retained ranking feature values are unchanged.
- `integrate_full_review.py` verifies parent bindings, frozen decision digests,
  pair/cell coherence and the complete candidate audit before publication.
  Short unrelated excerpts are not confused with the entire source section.
  `whole_corpus_review.json` embeds the immutable overlay and integration receipt;
  `label_lineage.json` retains parent provenance. Verified ZIP history precedes
  cleanup. Publication can recover a move interrupted before pointer update.
- Legacy export cannot replace reviewed labels with old machine proposals.
  Repeated integration is idempotent. 506 dataset tests pass. No HTTP DTO,
  runtime scoring, provider API call or training change was made.
- Labels remain assistant-reviewed weak supervision, NOT independent gold.
  Training/production readiness remains false; choose/evaluate AI1 before
  rebuilding AI2 features. Earlier baseline metrics belong to the parent release.

## Whole-Corpus Re-Review (2026-10-20)

- User-authorized parallel assistant re-review now covers all 500 source JDs,
  2,000 English CVs, 11,812 existing annotation cells and 5,827 exported bilingual
  semantic groups, including the 94 JDs excluded from the current ranking export.
  This is the requested scope, not a claim that all jobs have already been read.
- `dataset/review_full_dataset.py` freezes a manifest/source/annotation-bound plan
  in `dataset/review/<version>/`, with twenty disjoint 25-JD shards. Each recorded
  job review requires explicit four-CV fit decisions, source-based notes, complete
  counts and targeted cell/pair corrections or holds. Missing decisions stay pending.
- `--diagnostics --write` scans the entire corpus for observable risks; it never
  approves or changes a label. `--status --write` validates actual review records
  and updates one short README. Source/code scans and assistant read-review counts
  remain separate. Lead QA flags cross-passage reasoning and cell corrections not
  reflected in exported pair review; they do not silently generate replacements.
- Single-passage semantic labels cannot borrow years, tools or degrees from other
  sections. Whole-CV fit may combine real evidence. P/N stay non-binary, preferred
  finite experience ranges do not automatically cap fit, and eligibility conditions
  remain outside professional matching judgments. No quotas force one CV per fit.
- `current/`, split assignments, runtime features and HTTP DTOs stay unchanged
  during review. Corrections require integration/adjudication before a new release;
  assistant completion never implies human gold or production training readiness.

## Offline Pre-Fine-Tuning Evaluation (2026-10-20)

- `prepare_evaluation.py` selects 40 exported-ranking test JDs, ten per family,
  without consulting proposed labels or scores: 160 blank fit tasks and 313
  bilingual semantic pair review tasks under `dataset/evaluation/`. CV scenarios,
  annotations, relevance and rationales are hidden. This is NOT independent gold
  until actually reviewed by a trusted independent reviewer.
- Baselines calibrate thresholds on frozen weak train labels and report validation
  metrics only. Test is never scored or used to tune thresholds. Existing grouped
  splits and `dataset/current/` stay unchanged. EN/VI variants have weight 0.5.
- The runtime lexical scorer and cached local `all-MiniLM-L6-v2` were run offline.
  Local encoder loading disables Hub/Transformers network access. No provider call,
  model download, training, DTO or runtime scoring change is performed.
- Metrics measure agreement with weak labels, not independently measured correctness.
  Language/family slices and hard-negative false positives are reported separately.
  Low VI-EN recall requires further multilingual evaluation before selecting AI1;
  AI2 features still need rebuilding with the selected AI1. No readiness/gold flag
  is promoted by template preparation or aggregate F1.
- `import_evaluation_review.py` validates both CSV sheets against reconstructed
  frozen test tasks and the blinded packet. Source-cell edits, missing/duplicate
  tasks, malformed fits and decisions without reviewer/notes are rejected.
  Blank decisions stay pending. Semantic E maps to 1, I/C to 0; P/N stay non-binary.
  Paired EN/VI eligibility additionally requires `translation_reviewed=equivalent`;
  `needs_fix` and `uncertain` never produce bilingual export eligibility.
- `--write-status` reports progress; `--import-complete` stores a checksum-bound
  review import only when both sheets are complete and valid. CSV completion and
  reviewer IDs do not prove independence: provenance remains unverified and gold/
  production training flags remain false. No HTTP endpoint, DTO, source label,
  split assignment or runtime feature changes are introduced.
- User-delegated assistant review is recorded separately with `reviewer_id`
  prefixed `assistant:` and `reviewer_provenance=assistant`. The first eight test
  JDs (two per family) now have 32 whole-CV fit decisions and 64 passage-level
  semantic/translation decisions. Five fits differ from previous weak labels;
  15 P/N decisions remain non-binary. No frozen test labels are overwritten and
  no test judgments are used for training or threshold tuning.
- `apply_assistant_evaluation_review.py` applies only explicit decisions from a
  manifest/packet-checksum-bound `assistant_review.json`; it never infers labels.
  It validates both staged sheets, rejects unknown/duplicate tasks and conflicting
  existing reviewer work, and preserves pending tasks. Reapplying identical
  decisions is idempotent. Assistant review completion still cannot enable gold
  or production training flags. Default import detects assistant-prefixed IDs;
  an explicit `--reviewer-kind assistant` also enforces this ID convention.

## Dataset Directory Cleanup (2026-10-20)

- The single active dataset is now `dataset/current/`: `semantic.jsonl` for AI1,
  `ranking.jsonl` for AI2, and `review.csv` for inspection. `CURRENT_DATASET.json`
  now uses `directory: current`; version, manifest checksum and all artifact bytes
  are unchanged. No data-contract, label, split, feature or readiness change.
- Ten historical exports, three old pilot runs and historical reports are retained
  in a SHA-256-verified ZIP under `dataset/_archive/`, not permanently discarded.
  The three working runs used for rebuilding and source provenance stay in place.
- `organize_dataset.py` previews by default; `--apply` verifies the active release,
  rejects unsafe paths/links and live worker locks, verifies archived file contents
  before deleting old directory copies, moves the active release, then atomically
  updates the pointer. Once this layout exists, future compiler exports refresh
  `current/` and archive the previous version. No provider calls are made.
- Paths in older dated sections below describe historical locations; resolve the
  active version through the current pointer. Do not unpack history over `current/`.

## Content Adjudication And Quarantine (2026-10-20)

- Current release: `continuous500-weak-c30870e0d727`. Original 500 JDs, 2,000
  English CVs and per-job split assignments are unchanged; the previous release
  below is historical and remains immutable. Current exports contain 11,654
  semantic rows / 5,827 bilingual groups and 1,624 ranking rows / 406 JDs.
  The earlier quarantine-only revision had 11,648 semantic rows.
  Selected-criterion coverage is now complete for 442 JDs versus 448 upstream;
  historical label-part coverage flags remain original provenance, not new approval.
- A source-bound offline review layer quarantines 24 positive semantic rows whose
  education evidence does not establish required employment experience, plus 20
  rows from mixed mandatory/preferred criteria in the earlier revision. Both language variants were held;
  no positive becomes a fabricated negative. Ten additional four-CV ranking groups
  were withheld, including the inconsistent Fullstack relative-fit rationale.
- Eleven JDs / 44 CVs / 284 cells are source-bound assistant-adjudicated. The six
  degree/experience cases are now repaired too. Degree and tenure are separate
  mandatory clauses; both stay in an AND core where the original compound was core.
  Preferred clauses never become mandatory. `postbaccalaureate` means after the
  bachelor's level, not postgraduate. No label quota or target-scenario order is used.
- The Financial Accountant's selected cells are repaired but its unrelated original
  incomplete-coverage hold stays null. Further qualification-passage review corrects
  four bilingual pair groups using literal education evidence, excludes nine groups
  with unsupported degree/equivalence/tenure scope, and withholds affected ranking
  groups. Total exclusions are 94 JDs, not unfilled zeros. Fund Master and integrated
  master schedule are not mistaken for educational qualifications.
- `pipeline/content_review_cases.py` pins complete original job/profile bindings.
  The replay validates literal JD anchors, all selected cells, unchanged CV text,
  evidence IDs, separate priority/core scope and the existing core-fit ceiling.
  Previously proposed extra negatives are not automatically carried into the
  regenerated eleven jobs. Remaining N/PARTIAL cells never become binary negatives.
- `content_quality_review.json.adjudication` stores prior/new cells and fits,
  assessments and hashes. Label lineage moves these eleven JDs from machine to
  assistant provenance (126 versus 374 total), retaining original parent parts.
  These are delegated synthetic weak labels, not human-approved ground truth.
- `qualification_evidence_review` records cell-only corrections without promoting
  the entire parent JD's provenance. CSV provenance adds `assistant_cell_review`.
- `release_dispositions.json` accounts for every source JD as included weak ranking
  labels or excluded from this release with a reason. Audit verifies all 500 unique
  decisions against the actual semantic/ranking exports. Preparation is closed as
  `closed_weak_release_with_exclusions`, NOT certified label correctness, independent
  gold or production training readiness. 374 machine-proposed JDs remain weak labels.
- `content_quality_review.json` records reasons and unresolved reannotation.
  For remaining holds, original relations/fit values remain visible in `annotations.json`,
  explicitly marked as held, NOT replacement training truth. In `review.csv`,
  affected fit cells are blank and the previous proposal has its own column.
- Default compilation applies these reviewed decisions and fails if their frozen
  English requirement text changes. Artifact hashes bind the review and policy;
  audit rejects held semantic pairs or ranking jobs leaking into training exports.
  These specific decisions do not certify all remaining weak labels or translations.
- `ranking_feature_policy.json` discloses constant certification/location signals.
  No fake features, silent feature dropping, HTTP endpoint, DTO or runtime scoring
  change. The eight-feature contract stays intact; normalized snapshots, selected
  AI1 features and independent evaluation remain required before production train.
- Offline only: zero provider calls, no new CVs, no training. `training_ready=false`.

## Continuous Source, Annotation And Experimental Export (2026-10-19)

- Closed first-pass release: `continuous500-weak-f4b209789cee`, 500 source JDs,
  2,000 English CVs, 11,692 semantic rows (5,846 EN/VI pair groups), 1,644 ranking
  rows from 411 JDs. All 500 JDs have at least selected valid annotations, not
  exhaustive correctness approval: 52 have partial criterion coverage. Provenance
  is 115 assistant-reviewed versus 385 machine-proposed JDs, never human gold.
- Ranking remains withheld for 89 JDs: 52 incomplete/invalid annotation cases,
  27 fit/evidence/core conflicts, 10 ambiguous source rubrics. Null fit is not zero.
  Source balance is 125/family; final relevance labels are not artificially balanced.
- Provider `403 insufficient_user_quota` stopped new API submissions. All in-flight
  workers drained; 17 remaining unattempted JDs were reviewed offline, not retried.
  Old failed states remain visible with explicit offline-resolution metadata.
  No new API authority, training run, HTTP endpoint or DTO change is implied.
- `compile_continuous_dataset.py --audit-current` checks frozen file hashes,
  literal CV-evidence/requirement bindings, EN/VI consistency and weights, complete
  four-CV ranking groups, all-source preview coverage and shared model splits.
  It neither downloads a model nor calls a provider. Contract validity is not gold.
- Literal HTML entities are decoded for numeric-constraint comparison only: digits
  in `&#39;` are not experience years. Frozen source anchors remain unchanged;
  real numeric differences still fail. Source-only assistant reviews now also
  reject passage entailment when the whole-CV assessment is partial/unsupported,
  including total-experience-range errors. Two pre-release corrections retain
  their initial plans/reviews under the relevant adjudication revision folders.

- Current execution uses `dataset/runs/continuous500_v1`, corrected selection-v3,
  136 inherited reviewed JDs and only 364 initially missing source requests.
  Historical unused grant slots are superseded, not extra calls. Source generation
  and annotation run concurrently with per-request checkpoints and no SDK retries.
- The user separately approved up to 436 paid blinded annotation calls. The frozen
  scope contains 428 previously unreviewed JDs. A rejected attempt before that
  approval made no annotation call. Source budget is not annotation authority.
- Machine outputs are `llm_rubric`, never `assistant_rubric` or human gold.
  Candidate order and evidence IDs are blinded to generator scenarios. Raw output,
  source hashes, prompt revisions and offline corrections remain traceable.
  Preferred criteria cannot become mandatory cores; absent evidence is N, not a
  negative. Partial support stays excluded from binary semantic labels. Conflicting
  extra negatives are discarded. Incomplete criteria coverage/core-fit conflicts
  withhold ranking labels rather than inventing fits or filling missing cells.
- `compile_continuous_dataset.py` merges disjoint active legacy corrections,
  explicit assistant adjudications and machine proposals without double counting.
  It quarantines duplicate CVs and conflicting semantic inputs, keeps paired EN/VI
  variants together and freezes source-component splits shared by both models.
  `dataset/CURRENT_DATASET.json` points to the latest immutable experimental release.
  Partial snapshots explicitly report missing JDs/labels; contract validity does
  not imply label correctness, independent gold or production training readiness.
- The snapshot adapter computes the eight existing runtime features, records actual
  hashes and uses `lexical-fallback` without downloads. Rebuild ranking features
  using the selected fine-tuned semantic model before training its production
  ranker. Weak validation/test scores must not be presented as independent results.
- No HTTP endpoint, DTO, database or runtime scoring formula changes. Older sections
  below are dated checkpoints, not current budget/progress instructions.
- Source acquisition is now complete: 500 JDs/2,000 English CVs, 125 JDs per family.
  Eight formerly failed sources used the account-listed `gpt-6-sol` fallback, with
  unchanged source prompt/contract and preserved previous failure/billing history.
  A read-only response retrieval probe returned provider 404; it was not a new
  generation and was not repeatedly probed. OpenAI's documented retrieve/stream
  behavior does not establish third-party provider support.
- An interrupted annotation session is reconciled only after Windows process
  enumeration proves no live runner. Original in-flight checkpoints are retained,
  unknown outcomes are not retried, and new sessions record their PID. Source
  completion is not annotation completion. Paid annotation remains bounded by its
  separate grant, and source-only assistant adjudications never masquerade as LLM
  responses or independent gold.
- Seventeen source JDs had 34 literal employment intervals missing in metadata.
  Explicit assistant review binds each full source hash and employment quote;
  corrections affect derived runtime snapshots only, not frozen CVs/annotations.
  `review.csv` is a spreadsheet-safe joined preview; `feature_qa.json` discloses
  constant features. Unknown atomic job skills/location and unscored certifications
  are not fabricated to make the ranker look ready.
- Offline recovery skips already adjudicated JDs. A later machine proposal cannot
  replace an immutable source-only assistant review; the latter stays bound to its
  original source/case/plan hashes and never acquires machine provenance.
- Partial machine criteria may survive only with complete four-CV coverage and
  literal validated evidence. Missing source-review notes withhold all ranking
  labels; duplicated/unknown criterion IDs are not guessed into alignment.
- Feature QA also reports exactly identical feature columns. The runtime
  RequirementMatcher derives `skill_score` from professional requirement text even
  when atomic job skills are absent; it is not automatically a constant/default.
  This does not remove the lexical-fallback, education-projection or unknown-location
  limitations. No runtime scoring formula or API response shape changed.

Transport reference: [Official OpenAI documentation: Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events),
[Retrieve a response](https://developers.openai.com/api/reference/cli/resources/responses/methods/retrieve).

## Corrected Selection And Execution Guard (2026-10-19)

- User approved a source-backed `selection-v3`, preserving old selections/raw
  responses/annotations. The revised 500 inputs remain 125 per family: four jobs
  reclassified, ten excluded, two valid unpaid Sales jobs reserved for quota, and
  twelve reviewed replacements from the same CSV. New/retained source hashes and
  replacement exact/near-duplicate checks are enforced. This is not human gold.
- Known false matches include hourly `hr` vs HR, landscape business developer vs
  software, CNC programming vs IT, enrollment recruitment vs employee recruiting,
  and marketing tax services vs tax accounting. Future title selection quarantines
  known collisions; legitimate hourly HR roles and Nurse Recruiters are preserved.
  Finance/IT and content/API hybrids are not automatically rejected by title.
- All 120 paid JDs/480 CVs from completed source batches are retained. The corrected
  derived view at `production_sources_v1/revisions/selection-v3/source_dataset.json`
  changes one paid job's group (landscape IT to Sales), with source hashes and
  taxonomy lineage; CV text/timelines/identities unchanged. It does not import fit
  labels or duplicate generation counts. Historical source bundle stays historical.
- Exactly 24 unattempted slots were rebound in existing grants, not appended as a
  new budget. The prior auth snapshot and activation receipt bind this transfer.
  `API_CONTROL.required_taxonomy_revision` binds a local selection path/hash;
  `check_taxonomy_guard` checks every paid input's title/text/hash/family before any
  reservation. The old-selection new-grant helper refuses further budgets once
  this corrected revision is required. Prompt/history/spent grants unchanged.
- The prepared reuse/migration manifests are immutable plans. Current execution is
  recorded by `activation_receipt.json`; the derived source view/export manifest
  are refreshed explicitly by `export_taxonomy_source_view.py`, not a train release.
- User authorized batch031's exact one-field offline repair: c1e3 `end_month`
  2026-10 becomes null, matching literal `2023-04 to present`. The receipt binds
  original raw/section hashes, corrections and recovered record. No CV text edits,
  API retry or additional reservation. Original journal and archived error hashes
  match; the generator prunes resolved errors from its current error list only.
  Original error archive: `batch031/pre_recovery_generation_errors.json`.
- Partial review now writes `partial_source_review.json`, never a complete-batch
  approval. Exact existing-ID continuation grant skips the three reviewed sources
  and calls only the unattempted HR JD. The immutable taxonomy activation receipt
  stays unchanged; the separately recorded authorization amendment permits only
  resume fields and rejects budget/job changes. Batch031..034 are fully reviewed.
- Current source progress: 136 JDs/544 English CVs, 364 JDs remaining. Existing
  40-request grant used 32, eight unattempted. Recovered accounting usage (8,756
  tokens) is counted once, not as a retry. One omitted literal employment interval
  in batch033 is added to the derived reviewed timeline, preserving the raw source.
  Two ambiguous experience clauses in batch032 remain annotation holds.
- User has confirmed sufficient budget for all 500 JDs and requested continuous
  source generation with later content review. The current runner still enforces
  review between batches; a continuous mode has not been implemented or started.
  Such a mode must retain immediate structural/provenance checks and checkpoints,
  distinguish pending from reviewed sources, and keep training locked. It must not
  silently authorize retries or annotation calls.
- 377 dataset + 38 matching tests passed. No HTTP endpoint, DTO, database, runtime
  scoring changes or training. Existing weak labels remain 64 JDs/256 CVs pending
  explicit provenance rebind; source readiness never means independent gold.

## Bounded Source Grant And Frozen Review Queue (2026-10-19)

- Explicit new user grant: up to 40 source requests in batch027..036, four per
  batch, review between batches, no automatic retries or annotation API calls.
  batch027..028 completed and reviewed: 8 JDs/32 CVs, zero errors/retries;
  32 granted requests remain. Source inventory is 112 JDs/448 English CVs.
- New offline `prepare_source_grant.py` records bounded grants only after prior
  blockers/unused grants are resolved and API is paused. It preserves prior grants
  and freezes a separate background plan. `run_source_batch.prepare_jobs` accepts
  optional `sampling_policy_file`, restricted to a local JSON filename; old grants
  still default to `background_sampling_v2.json`. Selection/prompt/plan hashes
  remain mandatory. Historical plans/prompts/source records are unchanged.
- New offline `record_source_review.py` requires explicit source decisions for
  every candidate and assigned background. It binds exact source hashes and invokes
  existing validators before a write-once review export. It does not infer review
  notes, approve labels or assert train readiness. Original paid records stay intact.
- `review_production_revision.prepare` retains its immutable 104-JD snapshot/plan
  when the current source inventory grows. Changed/removed inherited jobs fail;
  new source jobs are not silently marked reviewed or added to an old manifest.
- Added labels for batch009..010: 8 JDs/32 CVs/268 cells. Total 64 JDs/256 CVs,
  244 fit labels, 12 holds, 2,292 semantic EN/VI weak rows; 192 source CVs pending.
  Fit counts 0/1/2/3: 54/61/110/19. Corporate finance tenure is not automatically
  municipal executive tenure. Sales verb 'excel' is not the spreadsheet tool.
  PRA I/II/III specialized-year ambiguity is recorded separately for new source JD.
- 363 dataset + 38 matching tests passed. No HTTP endpoint, DTO, database, runtime
  scoring or model artifact changes. No training. New requests reported 65,585
  tokens; actual monetary cost remains unverified. Source readiness is not label
  approval, class balance or independent evaluation gold.

## Offline Review Of Batches 007 And 008 (2026-10-19)

- Added source-bound assistant review for 8 JDs/32 CVs/316 cells without paid calls,
  source edits or changes to HTTP endpoints, DTOs, database or runtime scoring.
- Aggregate coverage: 56 JDs/224 CVs/1,896 cells; 212 fit labels and 12 holds,
  2,048 semantic EN/VI weak rows. 192 generated source CVs await label review.
  Fit counts 0/1/2/3: 47/57/90/18; no forced class balance or slot-derived targets.
- Accountant JD3769551683 contains a conflicting emergency-nursing qualification.
  Its literal clause is retained; all four overall fits withheld, while clear
  accounting passage pairs remain reviewable. No nursing-to-accounting equivalence
  is inferred. The previous Tax Associate and iOS holds remain unchanged.
- Transferable office/customer/sales skills are recognized without inventing
  QuickBooks, design, recruiting or capital-markets experience. Interview scheduling
  does not prove interviewing; employee-relations intake does not prove conducting
  investigations. Citizenship/clearance and driving eligibility remain separate.
- 351 dataset + 38 matching tests passed. Frozen source and v1 hashes unchanged;
  cross-revision checks report no conflicting labels for identical normalized text.
  These remain weak labels, not independent evaluation gold or train-ready exports.

## Offline Annotation Continuation (2026-10-19)

- Reviewed five additional batches, `batch022..026`: 20 JDs/80 CVs/672 cells.
  Source remains 104 JDs/416 English CVs; previous annotation artifacts unchanged.
  No API calls, paid retries, HTTP/DTO/database/runtime changes or training.
- Aggregate v1/v2 coverage: 48 JDs/192 CVs/1,580 cells, 184 fit labels and eight
  withheld fits; 224 source CVs await annotation review. Fit counts 0/1/2/3 are
  41/49/76/18, not forced balanced. The iOS JD's unresolved `X years` withholds four
  overall fits without discarding clear technical passage annotations; four earlier
  Tax Associate holds remain. Held fits are absent from ranking weak JSONL.
- Semantic staging has 852 unique pairs/1,704 EN/VI rows; 500 PARTIAL and 228
  NOT_MENTIONED cells remain excluded, not converted to binary negatives. Shared
  source identities and 0.5 language-variant weights remain unchanged. Original
  HTML entities in frozen quotes are retained, not silently rewritten in source.
- Preferred degrees/years do not become mandatory rejection gates. Generic titles,
  reporting or coordination do not prove GAAP, contract negotiation, specialist
  tools or staff supervision. Combined tenure uses explicit source-backed roles.
- 346 dataset + 38 matching tests passed. These are assistant-reviewed weak labels,
  not independent evaluation gold or released production training inputs. Continue
  offline review, then corpus balance/leakage checks and shared runtime exports.

## Offline Annotation Extension (2026-10-19)

- Source inventory remains 104 JDs/416 English CVs. No paid request, source change,
  HTTP/DTO/database/runtime scoring change, model download or training in this step.
- `review_production_revision.py` freezes `annotations_v2/source_snapshot.json` and
  `revision_manifest.json`: 80 previously unannotated JDs/320 CVs in 20 source batches,
  excluding the immutable v1 snapshot. Preparation does not approve labels.
- First reviewed batch021 covers 4 JDs/16 CVs, one per family, with 144 selected
  professional requirement/evidence cells. EN/VI requirements use the same frozen
  English CV sources. Fit distribution is 0:4, 1:2, 2:8, 3:2, not forced per JD.
  There are 81 semantic pairs/162 language-variant rows, 56 positives/25 negatives;
  47 PARTIAL and 16 NOT_MENTIONED cells are excluded from binary export.
- Cases bind each entire source job with `source_job_sha256`; each output batch has
  source snapshot, case/parent hashes, review code hashes and artifact checksums.
  Existing outputs are write-once/idempotent. Changed source/case/label inputs need
  a new review revision; v1 artifacts are not regenerated. Selected-passage labels
  and whole-CV relations stay distinct, including a multi-role IT tenure assessment.
- The existing core/rubric and staging validators are reused without modifying the
  frozen v1 annotator: missing/partial evidence is not contradiction, OR alternatives
  stay alternatives, preferred criteria are not mandatory gates, target scenarios
  are not labels, and no runtime ranking features are fabricated.
- `completion_status.json.assistant_annotation_progress` now aggregates disjoint v1
  and completed v2 batches: 28 JDs/112 CVs, 908 cells, 108 fit labels + 4 old holds,
  970 semantic weak rows. 304 source CVs remain pending. It validates parent/source/
  case/label hashes, profile coverage and cross-revision normalized-text label
  conflicts. Duplicate/unknown batches and changed inherited sources are rejected.
  For aggregated revisions `source_snapshot_sha256` is null; use
  `source_snapshot_sha256_by_revision`. No single snapshot is falsely called fully
  annotated. Incomplete batch exports are not counted as completed review.
- 340 dataset + 38 matching tests passed. All labels remain assistant-reviewed weak
  supervision, not human gold or independent evaluation. Shared split, remaining
  annotations, sampling review and runtime feature exports are still required.

## Diversified Source Continuation (2026-10-19)

- Latest inventory: 104 JDs / 416 English CVs, 26 JDs per family. All 40 authorized
  source requests in batch017..026 completed; no unused paid slots, retries or
  annotation calls. This continuation used 24 requests / 96 CVs in batch021..026.
- New contract `source_raw_jd_diverse_en_v2` preserves the v1 source JSON format,
  reference date and stable candidate identities. A separate prompt hash and per-job
  schema/provenance hash bind `background_sampling` (`policy_version`, `background_id`).
  Old v1 instructions/hash and all 80 prior source jobs remain unchanged.
- `background_sampling_v2.json` freezes assignments for the 24 formerly unused
  granted JDs: 12 backgrounds used twice, six distinct backgrounds per family.
  Assignments guide c4 source generation only; they are never fit/passage labels.
  Strong/adjacent profiles still need actual competency evaluation, not slot labels.
- Grants bind the sampling-plan digest and original 500-JD selection digest.
  Each revised batch stores `prompt_snapshot.json` with actual rendered job prompts.
  `source_review.json.background_sampling_review` must cover every assigned profile
  exactly once with candidate/source hashes, assigned background and explicit review.
  Runner, inventory, recovery replay and offline audit resolve the versioned contract;
  unknown contracts, stale hashes and missing reviews are rejected.
- The quality hold allowed only batch021 for four-request validation, then was
  retained as `resolved_source_quality_hold` after review. New 24 assigned profiles
  match the plan and have zero library-token hits. The old 18 library backgrounds
  remain; corpus weighting/subsampling must be decided after actual annotation.
  This is assistant source review, not gold occupation labels or proven model quality.
- Annotation remains the immutable 24-JD/96-CV weak-label snapshot; 320 source CVs
  await annotation review. Preserve ambiguous `X years` in JD3833295504 and the
  Coordinator/Assistant Director title-body conflict in JD3884438525. Check near-JD
  clustering for recruiting JDs3884435954/3884435957 before shared split export.
- 331 dataset + 38 matching tests passed. New 24-request provider usage:
  159,481 prompt + 43,886 completion = 203,367 tokens; actual money unverified.
  Training remains locked; no HTTP endpoint, DTO, database or runtime scoring changes.

## Previous Source Diversity Hold (2026-10-19)

- Latest inventory: 80 JDs / 320 English CVs, 20 JDs per family. New grant used
  16/40 source requests in batch017..020, exactly one successful attempt per JD;
  24 authorized requests remain unreserved. No annotation calls or retries.
- All 64 new CVs have hash-bound assistant source reviews. Original paid responses,
  prompt snapshot and immutable 24-JD annotation snapshot remain unchanged.
  Source review is not label approval: 224 source CVs await annotation review.
- Corpus review found library-related text in 18/80 unrelated sampling profiles,
  including all four new HR unrelated profiles. Counts are a lexical triage signal
  plus manual inspection of the new profiles, not a gold occupation taxonomy,
  validated bias threshold or a final class distribution. Valid individual source
  records do not imply balanced backgrounds across the corpus.
- `API_CONTROL.json.source_quality_hold` records this manual quality stop. The
  runner refuses paid continuation before reservations even with an unused grant;
  `--check-readiness` returns `source_generation_ready: false` and the hold details.
  Inventory reports `production_source_quality_hold` without removing reviewed CVs.
  `SOURCE_DIVERSITY_REVIEW.json` binds observations to the source bundle checksum.
- Resolve with a versioned diversified sampling policy and review before using
  remaining slots. Do not overwrite old prompts/CVs, force target scenarios into
  labels, or claim independent evaluation gold. Shared split, weak-label review
  and runtime exports remain required before training.
- 325 dataset tests + 38 matching tests passed. New usage: 104,912 prompt + 29,270
  completion = 134,182 reported tokens; actual money unverified. No HTTP endpoint,
  DTO, database, runtime matching formula, model download or training changes.

## Previous Reviewed Continuation (2026-10-19)

- Latest source inventory: 64 JDs / 256 English CVs, 16 JDs per family. All 40 new
  source requests in batch007..016 completed, exactly one attempt per JD; no retries
  or unused paid slots. API paused. 436 original JDs remain unsourced.
- Four responses were stopped by validation, then recovered offline: one reversed
  start-month field and nine explicit `present` endpoints across ten CVs. Original
  CV text, failed request states and error archives remain unchanged. Receipts in
  `offline_recovery` bind raw response, journal/archive hashes, literal quote and
  before/after values. `pipeline/source_recovery.py` replays only date metadata;
  it rejects unsupported dates, non-experience sections, ambiguity and changed text.
- This is delegated assistant source review, not human label approval. Recovered
  responses retain their original provider usage exactly once; no re-generation,
  implicit annotation approval, relaxed source schema or prompt change occurred.
- `run_source_batch.py --resume-reviewed-batch` requires a grant listing exactly
  the validated existing job IDs plus valid partial review. Existing JDs are skipped
  without new reservations or provider calls; only uncalled JDs use remaining slots.
  Unknown/failed unresolved attempts continue to block paid continuation. Full review
  is required before the following batch. Historical errors are archived, not erased.
- Existing annotations still cover only their immutable 24-JD / 96-CV snapshot;
  all source identities/provenance and label hashes were checked unchanged. The 160
  newly sourced CVs await requirement/passage/fit annotation in a separate revision.
  Target scenarios must never become training labels or features automatically.
- Final lexical near-duplicate scan: 32,640 CV pairs, word-trigram Jaccard threshold
  0.8, zero flags (maximum 0.0502). Diagnostic only, not semantic independence or
  training approval. Shared split/runtime feature export/quality evaluation remain
  required. Accountant source-clause hold remains explicit for label adjudication.
- 322 dataset tests + 38 matching tests passed. No HTTP endpoint, DTO, database,
  matching feature formula changes, training or model downloads. New-request usage:
  263,020 prompt + 72,511 completion = 335,531 reported tokens; actual money unverified.

## Source Expansion And Failure Stop (2026-10-19)

- New user grant: at most 40 source requests, ten four-JD batches, review between
  batches, stop on failure, no retries or annotation API calls. Nine slots used:
  batch007/008 accepted 8 JDs / 32 CVs; first batch009 response failed validation.
- Current accepted source totals: 32 JDs / 128 CVs. Existing assistant annotations
  remain bound to their immutable 24-JD / 96-CV snapshot. Progress refresh now
  recomputes the source comparison after writing the bundle and reports the
  32 source CVs without annotation review, not falsely labeling all new CVs.
- `source_annotation_holds` records source-bound ambiguous JD clauses separately
  from source acceptance. Accountant JD 3769551683 includes an ED nursing condition;
  retain the original clause and hold overall fit for adjudication.
- JD 3722423668 returned full text but a reversed c1e3 timeline. Offline preview
  corrects only its start month using the exact existing employment quote, passes
  the normalized contract and preserves raw/journal hashes. It is NOT production
  accepted; ledger and error history remain unchanged. No implicit request retry,
  label approval, budget extension or bulk continuation is allowed by the preview.
- `failed_request_reported_usage` exposes known failed-attempt tokens separately
  from accepted-source usage; failed local validation can still incur provider fees.
- API paused after the failure; 31 approved request slots remain unused. 314 dataset
  tests passed. No HTTP/DTO, runtime feature formula or training behavior changes.

## Production Assistant Annotation (2026-10-18)

- Offline review covers 24 production JDs, 96 English CVs and 764 selected
  requirement/evidence cells. `annotations_v1/annotations.json` uses schema
  `nexhire-production-assistant-annotations-v1`; this is synthetic assistant weak
  supervision, not human-approved or independent evaluation gold.
- Staging exports: `semantic_weak.jsonl` has 404 source pairs / 808 EN_EN and VI_EN
  rows, weighted 0.5 per variant. Only ENTAILS / IRRELEVANT become binary labels;
  247 PARTIAL and 113 NOT_MENTIONED cells remain excluded, not false negatives.
  Both language variants must share the same future split and source identity.
- `ranking_weak.jsonl` has 92 overall fit labels, no fabricated runtime features,
  and unassigned splits. Four Tax Associate fit labels are withheld for source
  ambiguity. Whole-CV support is distinct from a selected passage label. Preferred
  conditions do not automatically cap fit; multiple core groups may cap it.
- Fit counts 0/1/2/3 are 18/28/35/11. No forced per-JD balance or relabeling for
  quotas. Finance fit-3 and HR fit-0/3 are sparse; future targeted sampling is needed.
- `source_snapshot.json` preserves exact annotation input bytes. Source, artifact
  and review-code SHA-256 values bind provenance. The source-only bundle's old
  annotation fields describe its frozen stage, not the latest label progress;
  `completion_status.json.assistant_annotation_progress` tracks labels separately.
- Required/preferred logic, AND/OR, numeric clauses, English source quotes and
  technical terms are retained in bilingual requirements. Personal eligibility is
  outside competency matching; CV silence does not imply contradiction.
- 311 dataset tests + 38 matching tests passed. No paid API calls, HTTP/DTO changes,
  feature formula changes, training or model downloads in this annotation step.
  Production training remains locked pending shared splits, runtime snapshot/feature
  exports and encoder/label quality evaluation. These staging files are not the
  final matching-dataset-v2 release and must not be silently promoted to gold.

## Controlled Production Source Batch (2026-10-18)

- Current production totals: six reviewed batches, 24 original JDs / 96 English CVs,
  six JDs per family. All 4 + 20 authorized requests completed; API paused, 476 JDs
  remain. No additional grant or production label release is implied.
- `source_dataset.json` is the consolidated source-only view. It retains source hashes
  and reversible evidence aliases, removes target slots and deterministically shuffles
  candidate order. It is synthetic, not independently blind/human-reviewed or train-ready.
  Provenance/target metadata must never become model input/features.
- Source review must explicitly resolve every proposed missing literal employment
  interval: approve it or reject a non-employment date range with a source-bound reason.
  Four corrections were verified for JD 3761818635; the derived bundle
  applies them, raw records and paid request journals remain unchanged. Source quote,
  section hash and identity bind each correction; dates from projects are excluded.
  Date-regex suggestions alone cannot approve employment history.
- 294 dataset tests + 38 matching tests passed. No matching DTO, HTTP endpoint,
  database migration or feature formula change; no training or model download.

Initial batch history:

- Production batch001 contains four original JDs / 16 newly generated English CVs,
  separate from all pilot and smoke artifacts. Assistant source review is hash-bound;
  it does not approve passage labels or fit. Candidate slots are never training labels.
- Source range mismatches and transferable skills are annotation concerns, not reasons
  to rewrite CVs or force one example per fit class. Production train remains locked.
- `dataset/production_status.py --write` performs offline inventory, checks frozen
  source selection/reservations/contracts/review hashes and duplicate CV text, and
  refreshes one production completion status. It excludes pilot/smoke from counts;
  proposed next JDs do not authorize paid calls.
- The batch runner supports separately user-approved recovery of one documented
  pre-HTTP Windows socket denial. It retains the journal; timeouts, HTTP responses,
  partial output or unknown transport outcomes cannot use this recovery path.
  Existing default no-retry and per-batch budget gates remain in place.
- All four authorized provider requests completed. API paused again; further paid
  batches require new grants. No HTTP DTO or matching feature formula changed.
- 284 dataset tests passed. Production requirements, labels, shared splits and final
  training exports are not yet released; source completion is 4/500 JDs.

## Experimental Pilot Runtime Export (2026-10-18, Current)

- `dataset/build_pilot_training_inputs.py` exports 474 semantic / 40 ranking rows
  under the dataset pilot, not the production ML data directory. Both pass the actual
  matching-dataset-v2 validators, all three partitions, shared job_candidate policy.
  label_source=rubric with annotator_id=assistant:codex-delegated-pilot-review-v1;
  manifests explicitly retain synthetic assistant weak provenance, never human gold.
- `MatchingScorer` accepts optional injected semantic scorer/ranker for offline export
  and testing. Default production construction and feature math are unchanged; no
  HTTP DTO/endpoint changes or feature schema version bump.
- Snapshot adapter conservatively maps source sections and validated employment dates
  to existing runtime schema. Profile evidence maps to profile/summary, multiple roles
  retain all intervals without repeating source paragraphs. Expected degrees remain
  description-only; projects do not become employment. No invented company/location.
- Job input is an explicitly versioned professional-requirements projection, not the
  raw JD. Contacts/eligibility remain outside scoring. Missing workingType/location
  stay blank; level uses literal title hints or UNSPECIFIED with documented defaults.
- Eight features come from actual MatchingScorer.score at the frozen reference date,
  using an explicit runtime lexical fallback and weighted baseline, no model downloads.
  Feature values remain 0..100 with exact feature order; training scaling divides by 100.
  Rebuild ranking features after choosing/fine-tuning the semantic model.
- One label-independent component split groups jobs/candidates, exact semantic inputs
  and lexical near-duplicate CV/JD candidates. EN/VI requirement IDs use @en/@vi
  namespaces; a sidecar retains original requirement/evidence identity, shared pair
  group and 0.5 variant weights. Class weights use training unique pairs only.
- Semantic split counts train/validation/test=182/144/148; ranking=16/16/8. Ranking
  test loses IT/Finance because their JD ambiguity holds fall in that partition.
  This small post-hoc reviewed pilot is not an independent four-domain benchmark.
- QA exposes certification=0/location=60 constants, generic education and experience,
  coarse skill paragraphs, low lexical skill scores and runtime comma splitting versus
  reviewed criterion atomicity. Do not tune thresholds to disguise these limitations.
- export_manifest.json, adapter_qa.json, frozen snapshots/splits and artifact/source
  hashes record experimental readiness only; production_training_ready=false and
  training_ready=false. Existing strict human-review helpers are not loosened.
- 277 dataset tests + 38 matching tests passed. No API calls, trained models, environment
  changes or production batch generation.

See [runtime export and limitations](../dataset/DATASET_STANDARD.md#16-snapshot-runtime-features-và-export-thử-nghiệm).

## Delegated Assistant Pilot Adjudication (2026-10-18, Label Stage)

- User delegated review to the assistant instead of reviewing every CV. Completed
  48 CVs / 444 passage relations offline; 40 fit labels, eight fit holds for original
  ambiguous Kafka/Tax clauses. Corpus fit counts 0/1/2/3 are 10/10/14/6; not forced.
- `review_pilot_labels.py` applies explicit source-bound pilot case decisions, reuses
  the source-guarded earlier eight-profile reference (not an independent blind review),
  and retains user-confirmed scoped Sales decisions. Input file hashes and exact
  candidate/requirement/evidence coverage prevent applying cases to changed data.
- `cv_requirement_assessments` separates whole-CV support across passages from the
  selected passage relation. Whole-CV evidence can establish a core competency while
  a selected passage stays PARTIAL. No fabricated merged quote or automatic relabeling.
- Staging schemas `nexhire-assistant-semantic-weak-v1` and
  `nexhire-assistant-ranking-weak-v1` have honest assistant_rubric provenance, unassigned
  split, human_reviewed=false, training_ready=false. They are NOT matching-dataset-v2.
  Existing strict human approval and runtime training validators are unchanged.
- Semantic staging retains 237 distinct pairs (194 positive, 43 negative), represented
  by 474 correlated EN/VI rows with shared pair IDs and 0.5 variant weights. Excludes
  119 PARTIAL, 83 NOT_MENTIONED and five gap-worded passages. Ranking staging has
  40 labels but no fabricated runtime features. Eight ambiguous fits are not exported.
- Assistant review completion is separate from human approval counters, which remain
  zero. These are synthetic weak labels, not independent gold or demonstrated model
  accuracy. Finance lacks fit-3 examples in reviewed fit groups; positive/negative
  semantic balance needs attention when expanding. Never change labels for quotas;
  any class weighting must be fitted on the eventual training partition only.
- 265 offline tests passed, no new API requests. Snapshots/features, final split/dedup
  and actual fine-tune/evaluation remain separate work; no HTTP API changes.

See [delegated pilot result](../dataset/DATASET_STANDARD.md#15-kết-quả-assistant-duyệt-thay-người-dùng).

## Blinded Pilot Label Review (2026-10-18, Preparation History)

- Offline `prepare_label_review.py` prepares `nexhire-blinded-label-review-v1` from
  12 source JDs / 48 CVs, with 444 requirement/evidence cells and 48 overall fit tasks.
  Unassigned labels are null, never placeholder zero/NOT_MENTIONED ground truth.
- Requirements/EN-VI review precedes accepting CV labels. Raw source, requirement/core
  content, date and ordering are immutable against regenerated frozen inputs.
  Aliased evidence IDs e01/e02 remove old c1e1/c2e1 slot hints. Lineage and prior
  assistant drafts are separate and must not be shown before a blind review.
- `blinded_label_proposals` builds annotation-only prompts/JSON schemas. It exposes
  neither generation scenario nor previous labels/candidate UUIDs. The parser derives
  exact quotes and records pending LLM proposals; it cannot overwrite existing labels.
  This module has not been connected to a paid runner or live quality-validated here.
- Label audit requires exact in-CV quotes and complete cell coverage, explicit human
  identity/notes for approved review, reviewed requirements before label acceptance,
  and no unresolved source hold for fit. Declared provenance is not identity authentication.
- Accepted counts are reported separately from drafts, by family/fit/relation. Missing
  binary classes, missing corpus fit classes, uncontrasted JD groups and core/fit
  conflicts block label completeness. The audit never changes labels to balance them.
  PARTIAL and NOT_MENTIONED are excluded from binary semantic training eligibility.
- There are currently 0 approved cells and 0 approved fits. The 68 historical reference
  decisions remain drafts, not new human ground truth. Even a complete review packet
  keeps training_ready=false pending snapshots/features, final exports, split/dedup
  and independent held-out evaluation. This is not matching-dataset-v2 training data.
- No HTTP endpoints/runtime matching behavior changed. No new API calls/charges;
  258 offline tests passed. Source technical readiness remains distinct from the
  recommendation to hold production spending until label quality is demonstrated.

See [dataset label workflow](../dataset/DATASET_STANDARD.md#14-luồng-gán-nhãn-pilot-trước-khi-mở-rộng-dữ-liệu).

## Controlled Raw-JD Source Batches (2026-10-18, Current)

- User approved source acquisition separately from training, plus four additional
  live raw-JD smoke requests. Completed the 14-request pilot (12 source JDs / 48 CVs)
  and four-request smoke (four JDs / 16 CVs). No remaining paid authorization.
- `source_profiles_en_v2` preserves the old paid prompt and fixes employment/project
  timeline instructions and scenario-correlated gap wording. The known Marketing
  response has a separately traced employment-only timeline correction, unchanged text;
  it is not silently promoted to human-reviewed labels.
- `source_raw_jd_en_v1` / `nexhire-raw-jd-cv-sources-v1` supports the actual 500 raw JDs,
  which do not yet have reviewed bilingual requirements/core groups. Sources explicitly
  have `requirements=[]`, `requirements_status=not_extracted`, no annotations/fit labels.
  This is a distinct acquisition schema, NOT a relaxed matching-dataset-v2 contract.
- `validate_source_sections` now shares existing evidence/text/leakage validation with
  raw source acquisition; existing bilingual bundle behavior is unchanged.
- `source_batch_gate` binds review to source hashes, current prompt/schema and live
  response provenance, with a source-only assistant review of all 16 smoke CVs. It also
  verifies the unchanged 500-JD parent selection. This is not human label approval.
- `run_source_batch.py --check-readiness` is offline. Paid batches require an explicit
  selection-bound grant listing 1..4 exact JD IDs and request count. Global budget lock,
  pre-send reservations, no retries, API pause restoration, failure stop and reviewed
  prior-batch checks prevent unattended continuation. Every CV in these small startup
  batches is reviewed; 20%/10% sampling reduction is not enabled in this runner.
- Controlled source acquisition is technically ready, but no production grant exists
  and no production batch was executed. Training/export label gates remain unchanged;
  requirement EN/VI review, annotation, runtime features/snapshots and final split/dedup
  checks are still required. No HTTP API or production matching behavior is changed.
- 248 offline tests passed. Recorded usage across the two grants is 164478 tokens;
  currency charges and cached pricing have not been reconciled with the provider.

Current standards and exact prompt references: [dataset standard, section 13](../dataset/DATASET_STANDARD.md#13-bản-chốt-sinh-nguồn-theo-lô-và-prompt-đang-dùng).

## Source-Only Pilot And Readiness (2026-10-18, Historical)

- User explicitly increased the shared pilot ceiling to 14 provider requests, including
  the two annotation experiments. Eight responses are recorded; six remain unused.
  No automatic retries or bulk authorization. API is paused after a validation failure.
- Offline `source_profiles_en_v1` / `nexhire-cv-sources-only-v1` generate English CV
  source sections and employment timelines only. Wire output excludes annotations,
  proposed relevance and rationale. Sampling scenarios are not training labels.
- Imported historical CV sources retain provenance hashes, not their old model labels.
  Raw failed responses remain quarantined. Projects can be evidence but do not silently
  become employment years. Timeline errors now identify candidate/evidence/type.
- `check_dataset_readiness.py` checks original provenance, merged source counts and
  cross-model split identity where final exports exist. `audit_source_pilot.py` adds
  heuristic wording/timeline review hints and recorded usage including validation failures.
  Neither tool approves labels or authorizes bulk. Review hints are not semantic guarantees.
- Reference rules v3 resolve 68 cells as drafts; no new independent gold approval.
  Five JDs / 20 CVs pass source structure, one further JD / four CVs is quarantined.
  Matching HTTP endpoints, runtime features and matching-dataset-v2 are unchanged;
  source-only records must not be sent directly to either training pipeline.

Current scope, standards and blockers: [dataset standard, section 12](../dataset/DATASET_STANDARD.md#12-trạng-thái-hiện-tại-và-chuẩn-cần-giữ-khi-mở-rộng).

## Grouped English Generation And Marketing Trial (2026-10-18)

User approved the exact 2/3/3 competency groups for the selected Marketing,
Accounting and HR JDs. --approve-core-groups records scoped approval separately
from pending translation/label review. It preserves prior proposals/raw data.
source_grouped_en_v1 now accepts these frozen bilingual requirements and policies,
generating English CVs only. Wire output omits JD/requirement copies and quote
text; candidate-scoped evidence IDs and a complete requirement matrix are required.
Code reconstructs v3.2 source bundles, source-based UUIDs, pending metadata and
full-section quotes. Grouped cap violations are quarantined, never auto-relabelled.
Schema/policy/requirements fingerprint guards resume/export; inputs cannot silently
fall back to legacy generation. Existing HTTP/runtime contracts are unchanged.

Requirement-only preflight is shared with validate_bundle, avoiding fake placeholder
CVs for source generation. It checks exact JD anchors, numbers/terms and shape,
not complete bilingual logical equivalence. Old contract defaults/hashes remain.

One Marketing request returned four English CVs/28 proposals, 9327 input + 2501
output tokens in 18 seconds. It failed the core cap: c2 proposed 2 with PARTIAL r6.
The source manifest therefore has zero accepted jobs, not zero received CVs or
zero charges. Accounting/HR were not called. API paused; no retry. Actual fees
unverified. Reviewer also flagged r6's old VI AND->OR mistranslation, a past-role
scope statement misused as CONTRADICTS, and an unnatural list of absent duties.

Review tools can derive a normalized VIEW from the quarantined wire, retaining
quarantine status and provenance. Offline --prepare-marketing-review restores
source AND in a new translation draft and reuses the four CVs unchanged, with
annotations cleared. It neither approves/changes old labels nor regenerates CVs.
That revision is blocked pending grouped annotation-contract integration; existing
source generation cannot be reused accidentally. 142 offline tests pass. No new
long report; current concise status is dataset/README.md. Bulk/train remain closed.

## Multiple Core Competencies (2026-10-18)

Offline grouped proposal revision other_families_v2 preserves the original
other_families selection and all raw data. It proposes two Marketing groups
(design delivery, request coordination), three Accounting groups (bookkeeping,
bank reconciliation, closing support), and three HR groups (recruitment operations,
employee records/compliance, executive administration). Related requirements such
as Adobe proficiency and design delivery belong to one competency group, not
separate weighted failures. HR gains two source-anchored executive duties; its
11 requirements remain within the draft limit. Priorities/qualifier ORs are unchanged.

core-groups-v1 explicitly uses all_of across groups, and all_of/any_of within a
group. Current proposals use all_of only. any_of requires explicit alternative
review; the evaluator does not infer OR from related skills. Duplicate group IDs,
cross-group repeated criteria, unknown relations/IDs and preferred-as-core criteria
are rejected. Missing/partial relations do not satisfy a criterion. Evaluation
returns met/unmet group IDs, never a ground-truth label or runtime ranking score.
One evidence section may legitimately support more than one criterion.

The proposals remain pending_user_review, not active core_policy. New grouping
algebra is not wired into production scoring or the flat v4 annotation contract;
generation/annotation integration is still required after approval. Requests
remain blocked before SDK/network. 132 offline tests pass; no paid call/new CV
generation or semantic certification occurred. Current summary: dataset/README.md.

## Three-Family Core Proposals (2026-10-18)

Offline --prepare-families prepares one frozen JD each for Marketing, Accounting
and HR at english_first/revisions/other_families/. It reuses the proposed bilingual
requirements, not Vietnamese CVs, and checks source identity/hash/exact core quotes.
Core proposals are Adobe Creative Cloud design, AP/AR plus bank reconciliation,
and resume-screening/interview coordination plus employee-record administration.
They are pending user review, not confirmed policies or general family-wide rules.

The HR draft adds two actual JD duties omitted by earlier extraction. Their
source priority remains unspecified; choosing them as business-core duties must
not silently upgrade the JD to explicit required qualifications. Current v4 only
accepts reviewed required criteria, so duty-core handling and frozen-requirement
English generation need explicit integration after approval. Preferred criteria,
experience ranges and OR alternatives are retained, not converted to core gates.

Selections store core_policy_proposal (not active core_policy), no candidate CVs,
and generation_contract_status pending review/integration. CLI and generate_jobs
reject proposal inputs before any request; offline preparation is still allowed.
125 offline tests pass. No new API calls, charges confirmed, or English CVs created
for these three proposals; API remains paused and bulk/training readiness false.
Only concise status is updated in dataset/README.md; no new long report.

## Core Policy Live Verification (2026-10-18)

One annotations_en_v4 request passed structure and the approved core-cap check:
four unchanged English CVs/IDs, eight unchanged bilingual requirements, 32 pending
annotations and exact derived quotes. Proposed relevance is 3/1/1/0; Python and
Java profiles lacking PHP are capped at 1 without forcing a Good Fit label.
The earlier frontend and domain-learning overclaims did not recur on this sample.

Provider-reported usage: 5165 input + 765 output = 5930 tokens in 8 seconds.
Actual pricing/cache and reproducibility are unverified; the usage difference
alone does not establish prompt-driven savings. No retry/regeneration or extra
call occurred. API is paused again. A residual c3/r5 concern remains: independent
work is explicit, remote work is not, yet PARTIAL became NOT_MENTIONED. Independent
review is still required; no labels were automatically corrected or approved.

119 offline tests pass, but bulk/training readiness remains false. Missing class-2
examples must be addressed through source diversity, not relabeling existing CVs.
Core identification for other jobs/families is not inferred from the PHP policy.
Current concise status and next action are in dataset/README.md; no new report.

## Approved Core-Skill Relevance Cap (2026-10-18)

User approved the policy: missing identified core expertise may be considered
(relevance 1) but is not Good Fit (2). New offline annotations_en_v4 consumes an
explicit per-job core_policy, selecting r1_php only for the reviewed PHP pilot.
It never infers that every required requirement is core. Other jobs/families need
their own reviewed selection; preferred criteria cannot silently become core.

Proposed relevance 2/3 requires ENTAILS for every named core criterion. PARTIAL,
IRRELEVANT, CONTRADICTS or NOT_MENTIONED on a core criterion caps relevance at 1;
0 remains possible but is not automatic. Alternatives explicitly allowed within
the criterion may satisfy it. Satisfying all core criteria alone does not force
a high label. Relations still need independent semantic review; a falsely proposed
ENTAILS can pass this consistency check, so the policy is not semantic proof.

Violation is quarantined with its original response, never silently relabeled or
retried. The wire schema is unchanged, but per-job schema/policy fingerprint and
v4 prompt provenance prevent mismatched resume/export. Existing paid v1-v3 labels
are retained unchanged. --prepare-core creates core_v4 from validated domain_v3
sources and preserves IDs, CVs, bilingual requirements and atomic lineage.

119 offline tests pass. No v4 API request was made; API pause and bulk/training
gates remain active. Approval of the core policy is NOT human approval of individual
labels or translations. This changes dataset preparation only, not runtime HTTP
API schemas or live matching-service scoring. Concise status: dataset/README.md.

## Domain Rubric Live Verification (2026-10-18)

One annotations_en_v3 call completed: four unchanged CVs/IDs, eight unchanged
requirements, 32 pending annotation cells and exact derived quotes. Provider usage
was 9378 input + 842 output = 10220 tokens in 15.25 seconds. Total tokens are about
1.4% below v2's 10370; money/cache billing and repeatability remain unverified.
No retry, CV regeneration, historical relabeling or extra request followed.

On this inspected sample c3/r3 frontend changed PARTIAL -> IRRELEVANT and c4/r7
domain-learning changed ENTAILS -> IRRELEVANT, addressing the two targeted concerns.
Four relations changed overall. The same Python CV's proposed relevance changed
1 -> 2, so ranking-label policy for missing core expertise still needs explicit
review; structural success is not semantic approval or label stability. Accepted
relevance remains null. All reviews pending, API paused, bulk/training gates closed.
Concise status and next decision are in dataset/README.md; no new report file.

## Domain-Aware Rubric Revision (2026-10-18)

Offline only: annotations_en_v3 adds direct hands-on evidence and domain-aware
learning rules while preserving generic communication/organization transferability.
API-team coordination alone is not frontend proficiency; accounting-guidance
updates alone are not emerging software-technology learning in a developer JD.
The prompt includes payroll, campaign and spreadsheet counterexamples without
changing the wire or normalized source schema. Distinct prompt provenance prevents
mixing v2/v3 exports; v2 prompt text/hash and paid outputs remain unchanged.

review_dataset.py --contract source_v3 --prepare-domain validates the compact
parent's schema/prompt provenance and prepares a separate domain_v3 revision.
CV IDs/text, eight bilingual requirements, dates and atomic lineage are retained;
new annotation lists are empty and all reviews pending. No historical relabeling.
112 offline tests cover source preservation, version guards, four-family contract
compatibility and refusal to export unapproved labels. They do not evaluate an
actual model's semantic accuracy. No v3 request/cost measurement yet; API remains
paused, bulk/training readiness false. Concise current status is dataset/README.md.

## Compact Pilot Verification (2026-10-18)

One annotations_en_v2 call passed structural validation: four unchanged English
CVs, eight frozen requirements, 32 cells, exact derived quotes and pending labels.
Usage was 9151 input + 1219 output = 10370 tokens in 16.234 seconds. This is about
7.1% fewer total tokens than v1's 11163, not the offline 32% byte reduction; the
two inputs also have different requirement granularity. Actual fees/cache and
repeatability are unverified. No retry or further request; API is paused again.

PHP/OOP and e-commerce proposals improved on this sample. Remaining semantic
review concerns are c3/r3 frontend PARTIAL from API-integration collaboration and
c4/r7 emerging-technology ENTAILS from accounting-guidance updates. The scenario-2
CV now has proposed relevance 1; labels are not forced to cover 0/1/2/3. No labels
were approved, automatically corrected or promoted to training. Bulk stays locked.
Current concise findings and next action are in dataset/README.md; no new report.

## Atomic Requirements And Compact Input (2026-10-18)

Offline preparation only, no new API calls: review_dataset.py --contract source_v3
--prepare-atomic creates english_first/revisions/atomic_v2 from the validated paid
English annotation revision, checking parent prompt/schema provenance first.
The explicit IT pilot split replaces bundled r1 with r1_php and r1_oop; the eight
resulting requirements retain exact JD anchors and bilingual text. Other OR and
preferred requirements remain unchanged. This is a targeted draft, not a generic
automatic JD splitter or human approval. Historical raw/labels/IDs/CV text remain
unchanged; new annotation lists are empty. Parent/child requirement lineage is
retained in annotation_input_provenance for review and future ranking weighting.

New --contract annotations_en_v2 has distinct prompt and dynamic wire-schema hashes,
while retaining the v3.2 normalized source schema. Each required matrix cell is an
enum string E:<evidence_id>, P:<evidence_id>, C:<evidence_id>, I:<evidence_id> or N.
The local explicit lookup restores relation/evidence fields and exact full-section
quotes; candidate-specific enums reject missing cells, unknown IDs/codes and
cross-candidate references. No fuzzy quote repair or automatic label approval.
Existing v1 contracts/hashes are not changed; export/resume cannot silently mix them.

The compact prompt retains the entire original English JD and every CV section,
reference date, EN requirement text and priority. Duplicate VI text/source quotes,
timeline metadata and language declarations are omitted from the LLM context, not
deleted from frozen source. Dates remain in verified CV text. This step proposes
English semantic relations, not translation correctness; independent bilingual
approval is still required before EN/VI training examples can be emitted.

Rubric explicitly requires direct material subcondition evidence for PARTIAL:
logistics/payment alone is not e-commerce, and Python/Java OOP alone is not PHP
expertise. These prompt rules are not semantic guarantees and do not relabel
historical outputs. Ranking aggregation must account for changed granularity;
splitting a criterion must not silently double its importance.

Offline serialized prompt+schema size on the same eight-requirement input:
22750 -> 15413 UTF-8 bytes (about 32% less). This excludes tokenizer/provider
overhead and is not a token, fee or quality benchmark. No live compact request
yet; 106 offline tests pass; API pause and bulk/training gates remain active.
The only concise status document to read is dataset/README.md.

## English Annotation Verification (2026-10-18)

One annotations_en_v1 call succeeded structurally for the frozen IT job: four
existing English CVs, 28 annotation cells, exact program-derived section quotes.
Local comparison confirms unchanged requirement text, source sections and candidate
IDs. Accepted relevance is still null and all annotations remain pending review.
source_manifest complete=true refers only to this one-JD annotation revision, not
the eight-JD/four-family pilot or bulk training readiness. No runtime API changed.

Provider-reported usage: 9260 input + 1903 output = 11163 tokens, 32.984 seconds.
Output is lower than the 3854-token generation response, but total tokens exceed
that request's 9754. Actual pricing/cache billing is unverified; cost savings are
not established. No retry/regeneration or additional request followed. The API
pause is active. Existing raw generation failures are preserved for provenance.

Semantic issues remain: bundled PHP/OOP permits ambiguous PARTIAL labels, and
logistics/payment passages are still proposed as PARTIAL for e-commerce. These
require rubric/independent review, not automatic relabeling or binary conversion.
Current concise status lives in dataset/README.md; user-facing reports are brief
chat summaries instead of new long documents each round.

## English Pilot Result And Annotation Repair (2026-10-18)

One authorized source_en_v1 call returned four English CVs and seven EN/VI
requirements in 24.36 seconds (provider usage: 5900 input, 3854 output tokens).
The complete response is quarantined: four of 28 evidence quotes are not exact
substrings. No record is accepted for training. The response/history is retained;
no regeneration, fuzzy quote replacement, automatic relabeling or retry occurred.
Actual money/cache billing is unverified. The parent API pause is active again.

New annotations_en_v1 reuses the fixed annotation matrix implementation with the
English v3.2 normalized schema, language=en and frozen 2026-10-18 reference date.
The shared validator now accepts explicit schema/language/date/validator arguments
while retaining Vietnamese defaults and previous prompt/schema hashes. The CLI
contract and prompt provenance distinguish English generation from reannotation.

Offline --prepare-repair now detects English source records/complete validation
failures, preserves their bilingual requirements and CV text, assigns stable
source-based UUIDs and creates a separate annotation_input revision. It never
promotes old annotations or rewrites the original response. Mixed EN/VI source
repair batches are rejected; each uses its own explicit contract. Candidate
sources and timelines are reused; annotation lists are empty until reannotation.
The future LLM response selects evidence IDs, not quote text. Code derives the
full-section quote, with relation/relevance still pending independent review.

No paid call has been made for annotations_en_v1. Prepared inputs are not proof
of semantic correctness or measured cost savings. 100 offline tests pass; bulk
remains locked. See dataset/docs/ENGLISH_PILOT_REVIEW.md for detailed findings.

## English-First CV Pilot (2026-10-18)

The user now prioritizes English CVs. `--contract source_en_v1` generates draft
`nexhire-source-v3.2-en-draft`: four independent English CVs per JD with aligned
English/Vietnamese requirements (1..12) and original English JD quotes. It does
not generate a second translated CV per candidate. The original 500-JD selection,
16 Vietnamese pilot profiles, legacy v3/v3.1 schemas and their hashes are retained.
Default CLI `legacy` remains backward-compatible; English generation requires
explicit contract selection in a separate revision.

English sections require language=en in the schema; source-grounded dates,
pending machine annotations/null accepted relevance and no automatic retries
remain enforced. Reference date is frozen at 2026-10-18 in this new contract.
Declared language is not automatic proof of fluent English or correct semantics.
The annotation-only v3.1 repair contract still accepts the existing Vietnamese
input only; it is not silently extended to English CVs.

Offline source-example preparation supports EN->EN and VI->EN after independent
human/pair translation approval, preserving actual schema, shared pair identity,
split and total per-pair weight. Ranking must not duplicate an applicant because
the requirement has two language views. No runtime HTTP API contract changed.

An eight-JD/four-family selection is prepared at
`dataset/runs/sourcev3_pilot8/revisions/english_first/`, with zero English requests
or generated English profiles. The parent API pause remains active. The next
live trial is at most one JD after connection/billing reconciliation, not bulk.

## Bilingual Source Examples Follow-Up (2026-10-18)

The user authorized continuing pilot review. One annotation-only attempt for IT
ended in APIConnectionError without response ID or usage. It was not retried;
the run is paused again to avoid duplicate unknown-outcome charges. This is not
evidence of zero billing or provider success. Frozen repair_plan.json describes
preparation only; request_states/errors/manifests track actual execution.

The 500-JD selection remains unchanged English source. EN/VI requirements belong
in generated source revisions, not independent duplicate JD records. Offline
REQUIREMENTS_REVIEW.md presents both languages for the four frozen pilot inputs.

prepare_semantic_examples now accepts the v3.1 requirement limit/case policy and
retains the actual source_schema instead of hardcoding v3. It still requires
explicit reviewed-pair allowlisting and human-approved relation labels. Each EN/VI
view has sample_weight 0.5; a future trainer must implement those weights or a
group-aware sampler. The helper is not the runtime v2 adapter or a complete trainer.
Ranking rows must not be duplicated solely because a requirement has a translation.
No runtime HTTP request/response schema changed. Bulk readiness remains false.

## Offline Repair And API Pause (2026-10-17)

Four source-v3 pilot requests returned 16 synthetic profiles. Only the IT job
(four profiles) passed structural validation; three complete responses remain
quarantined. Passing structure does not approve semantic labels. All are pending
review; bulk/training readiness remains false. No runtime HTTP API contract changed.

At the user's request, `runs/sourcev3_pilot8/API_CONTROL.json` has `paused: true`.
Generation checks this file in the output directory and ancestors up to dataset/,
before constructing the CLI SDK client or starting a programmatic request.
Descendant repair revisions inherit the pause. Only explicit user instruction
can authorize resuming; offline prepare/review/extract remain available.

`--job-id` selects jobs within a frozen selection without changing checkpoint
identity. `review_dataset.py --contract source_v3 --prepare-repair` reads accepted
and quarantined complete JSON offline, retaining original raw/errors/request history.
Reports count known usage across attempts; missing usage is unknown, not zero cost.

New `--contract annotations_v1` consumes a separate frozen annotation_input revision
with the 16 existing CVs and proposed bilingual requirement corrections. It does
not regenerate CVs or silently accept quarantined labels. The wire schema is a
required requirement-by-candidate matrix, with candidate-specific evidence ID enums;
quotes are copied from the selected full source section by code, not generated.
Previous scenario/relevance labels are hidden from the annotation prompt. Machine
relevance remains proposed only; accepted relevance stays null and review is pending.

Normalized schema `nexhire-source-v3.1-draft` allows up to 12 requirements, narrowly
case-insensitive protected technical names (word boundaries), and YYYY-MM/MM/YYYY
equivalence only if that month/year appears in the cited CV section. It preserves
CV source text/identity and exact JD anchors. It does not relax original v3 records
or approve translations. Per-job dynamic schema hashes and source revision data
are checked for resume. Offline preflight validates frozen anchors before calls.
Annotation-only cost reduction is not yet measured. Neither contract is a finished
semantic/ranking training dataset; independent review and runtime-feature adapters
are still required. See `dataset/docs/PILOT_ROUND1_REVIEW.md` for the full status.

## Source-v3 Pilot Integration (2026-10-17)

`dataset/prepare_dataset.py` creates a conservative selection candidate revision
and an eight-JD/four-family pilot without APIs. It preserves the original 500-JD
selection, records retain/quarantine/replacement mappings, refills from the source
CSV in the same family, and keeps human_reviewed/bulk_ready false. Quarantine is
triage, not a claim that every flagged JD is objectively wrong. Duplicate detection
is content-based, not title-only. Exact representatives and near-duplicate
decisions remain traceable for human review.

The generator now accepts `--contract source_v3 --selection-file PATH`, using
`pipeline/source_generation.py` with a strict schema, bilingual source quotes,
independent CV sections, anchored YYYY-MM timelines and pending annotations.
Reference date is frozen at 2026-10-17 and included in prompt/schema provenance.
Candidate UUIDs exclude annotation/proposed labels; accepted relevance stays null.
LLM output cannot approve itself or claim a human reviewer. PARTIAL and
NOT_MENTIONED are not converted to binary negatives. Local shape validation also
runs for JSON-only chat. Full translation truth/atomicity still need review.

The existing streaming/journal/lock and no-API-retry behavior is reused. Source-v3
raw records are stored in `source_v3_dataset.json`; successful legacy records may
not coexist in the same run. Resume checks active prompt/schema/provider/model.
Source-v3 schema hash is retained even for chat mode. No endpoint/model fallback.
Actual source-v3 calls require `--max-jobs 1 --confirm-paid-call` before SDK client
construction. This authorizes one request, not an overall monetary budget.

`--stage prepare` is offline; `--stage extract` creates pending_review.jsonl,
source_manifest.json and SOURCE_REVIEW.md without APIs. These are source-review
artifacts, NOT semantic/ranking matching-dataset-v2 training exports. Training
readiness remains false. Existing public runtime APIs and the v2 training validator
are unchanged. Schema/provider compatibility has only been tested offline so far.

Current revision: 414 baseline JDs retained and 86 replaced, 125/family. Pilot is
prepared with eight JDs and zero new paid calls; source review/budget approval and
real four-family generation/evaluation are still pending.

See [source-v3 pilot guide](../dataset/docs/SOURCE_V3_PILOT.md). Older sections below
describe the historical pre-integration state where explicitly noted.

## Dataset Folder Layout (2026-10-16)

Public CLI paths remain `dataset/build_recruitment_dataset.py`,
`dataset/quality_audit.py` and `dataset/review_dataset.py`. Internal modules now
live in `dataset/pipeline/`, offline tests in `dataset/tests/`, and detailed
guides/plans in `dataset/docs/`. Start at [dataset index](../dataset/README.md).

Kaggle CSV/archive/auxiliary tables moved to `dataset/source/`; the obsolete root
selection is retained at `dataset/source/legacy/selected_jobs.json`. Default CSV
discovery prefers source/, and legacy `--csv postings.csv` still resolves there
when no root file exists. The selected `source_csv` remains the basename, so this
relocation does not change frozen selection metadata or invalidate resume.

Existing `runs/pilot10` and `runs/multidomain500jd` retain their paths and original
JSON/JSONL content, including request journals. No labels, paid requests, runtime
API shapes or dataset versions changed in this reorganization.

## Four-Family Bilingual Quality Audit (2026-10-16)

`python dataset/quality_audit.py --run-dir runs/pilot10` (or
`runs/multidomain500jd`) writes QUALITY_AUDIT.json/.md offline. It checks source
hashes, quota counts, duplicate content, conservative family signals, annotation
red flags and explicit training blockers. Regex warnings are triage, not grounds
for automatically rejecting/relabeling a JD. Exit 0 means audit finished, not
bulk/training approval. Audit currently fails readiness closed.

CLI generation of selections >10 JDs now requires `--max-jobs 1`; larger or
unbounded batches fail BEFORE constructing the SDK client. This temporary safety
gate has no bulk bypass until a reviewed four-family bilingual pilot is in place.
Prepare/dry-run/extract are unaffected. Source data and existing prompt/schema
remain unchanged; <=10-JD generation still uses the legacy synthetic contract.

`dataset/pipeline/bilingual_contract.py` implements an OFFLINE `nexhire-source-v3-draft`
validator and source-example preparation functions, not an API generation schema
or the final matching-dataset-v2 exporter. It checks JD/CV quote anchors, numeric
constraints written as digits, declared protected terms, explicit relation/review
provenance, and job/candidate/translation split consistency. It cannot certify
translation, atomicity, semantic label truth, or complete near-duplicate grouping.
PARTIAL/NOT_MENTIONED do not become automatic binary negatives. Only human-approved
annotations on an explicit bilingual-equivalence allowlist enter prepared pairs.
LLM approvals do not masquerade as human labels. Candidate IDs are source identity,
not a hash of labels. Stable ID assignment/persistence still belongs to the source
adapter, not this validator.

Prepared EN-requirement/VI-evidence and VI/VI views share one pair_group_id/split.
They each carry sample_weight=0.5, which requires weighted loss or group sampling
in a future trainer; the current runtime contract does not accept these metadata
fields directly. They remain marked synthetic. Snapshots, v2 provenance and eight
runtime ranking features must be built separately; there is no training-ready
export or training run in this change.

Full findings, limitations and follow-up gates:
[four-family readiness](../dataset/docs/FOUR_DOMAIN_READINESS.md).

## Offline Pilot Review

`python dataset/review_dataset.py --run-dir runs/pilot10` writes only
`DATA_REVIEW.md` in that run folder. It presents all selected JD source text,
generated candidates/evidence/labels, manifest, errors and request history.
It reconstructs exported rows and IDs for consistency checks without calling
the provider or modifying source JSON/JSONL. These checks are NOT label-quality
approval or training readiness validation.

See [pilot standardization proposal](../dataset/docs/PILOT_DATA_STANDARDIZATION.md).
Its atomic requirements, annotation relations, independent CV/evidence sources,
review provenance and stable candidate identity are proposals, not implemented
changes to the generator schema, runtime enums, prompt or matching API.

## Dataset Provider Alignment (2026-10-15)

The offline dataset generator now defaults to CV Parsing's provider protocol:
`POST {OPENAI_BASE_URL}/responses`, single-user `input_text`, `max_output_tokens`,
and strict `text.format.json_schema` for the synthetic dataset schema. The previous
`/chat/completions` mode remains an explicit `--api-mode chat_completions` option.
This does not call the resume parsing endpoint or use the ParsedResume output schema.

The script reads repository-root `.env`. Priority is CLI > process environment >
`.env` > defaults matching CV Parsing config. It uses OPENAI_API_KEY/BASE_URL/MODEL,
OPENAI_MAX_OUTPUT_TOKENS and OPENAI_TIMEOUT_MS. `--env-file` selects another file;
`--check-config` prints non-secret settings and key presence without making requests.
Admin-managed model overrides in the parsing DB are not read automatically.

Raw records now retain `generator_api_mode` and `generation_schema_sha256`.
Resuming with different API mode/schema fails rather than mixing generated data.
Legacy records without mode are interpreted as chat_completions. Selected JDs
are preserved, but failed pilot requests now require explicit retry authorization
as described in Paid-Request Safety below. Provider errors include sanitized
code/message; any failed request stops the run without automatic retries.
No public API or runtime matching contract changes are introduced by this update.

## Multi-Domain Synthetic Source Update (2026-10-15)

The offline generator in `dataset/build_recruitment_dataset.py` now defaults to
500 JDs balanced across `it_data`, `sales_marketing`, `finance_accounting` and
`hr_recruitment` (125 each). These are job families, not employer industry codes.
Selection uses unique title-regex matches; ambiguous/unmatched titles are skipped,
and an underfilled family fails rather than being filled from another family.
The prompt includes the family/title and uses domain-specific hard negatives.

New raw JSONL schema `nexhire-synthetic-raw-v2` adds `job_group` to semantic and
ranking rows. Manifests include selected quotas and generated job/candidate counts
per family. This raw synthetic schema is **not** `matching-dataset-v2`: snapshots,
label provenance and the eight runtime ranking features still need an adapter and
review. Public APIs and runtime feature versions are unchanged by this update.
Do not use job family as a relevance label or report only pooled metrics.

Default output is `dataset/runs/multidomain500jd/`; old 300-JD/500-CV trial runs
have been removed so only the 500-JD run remains in `runs`. Legacy IT-only root output is
preserved. Prompt/group changes cannot resume generation into an old checkpoint.
See [dataset instructions](../dataset/README.md) for three-family selection,
pilot runs, output fields and evaluation notes.

Updated: 2026-10-15. Applies to `feat/matching-model-readiness` before model training.
This document describes implemented behavior; no trained model or real labeled
dataset is included. Python schemas and shared TypeScript interfaces enforce the
contract. Future changes to feature meaning or preprocessing must change versions.

## Version Inventory

| Contract | Current version | Purpose |
| --- | --- | --- |
| Candidate snapshot | `candidate-matching-v2` | Structured evidence from profile or parsed CV |
| Ranking features | `candidate-job-v2` | Eight named features, ordered as listed below |
| Feature extractor | `heuristic-features-v2` | Evidence changes and merged experience intervals |
| Text preprocessing | `matching-text-v2` | Unicode-preserving semantic input |
| Dataset record | `matching-dataset-v2` | Labels, source hashes, origin and processing versions |

Migration note: feature/dataset/artifact v1 from the earlier preparation is not
accepted for new training/inference. Rebuild features using v2; do not only rename
the version. Existing stored match results are unchanged. Rescoring may change
scores because descriptions/technologies are now included, requirement truncation
is removed, semantic text preserves accents and overlapping employment is merged.
No database migration is required: result additions use existing explanation JSONB.

## Candidate Snapshot

Internal endpoint: `GET /api/v1/internal/candidates/:id/matching-snapshot`.
It still accepts optional `candidateCvId`; this validates CV ownership, but the
endpoint returns current profile data, not the contents of that particular CV.
Application matching prefers the applied CV's parsed result and sets
`dataOrigin=PARSED_CV`; fallback profile snapshots use `dataOrigin=PROFILE`.

The envelope remains `{ "success": true, "data": { ... } }`.

| Field | v2 behavior |
| --- | --- |
| `snapshotSchemaVersion` | `candidate-matching-v2` |
| `dataOrigin` | `PROFILE` or `PARSED_CV` |
| `skills[]` | `id`, `name`, `level`, `yearsOfExperience` |
| `experiences[]` | `id`, `title`, `company`, `description`, start/end month/year, `isCurrent` |
| `educations[]` | `id`, `degree`, `school`, `fieldOfStudy`, `description` |
| `certifications[]` | **Objects**, not strings: `id`, `name`, `issuer`, `description`, `issuedYear` |
| `projects[]` | **Objects**, not strings: `id`, `name`, `description`, `technologies` |

Optional scalar evidence fields are null when unknown; missing collections are
empty. Month values are 1..12 when present. Profile item IDs are database IDs.
Parsed CV item IDs are paths such as `experiences/0`, scoped to the stored input
snapshot. Do not treat an array-index path as globally stable across CV revisions.

Compatibility: Python still reads legacy string arrays for certifications/projects
and missing snapshot version as v1. New producers emit v2 objects. Update other
internal consumers that assumed `string[]` before deploying candidate-service v2.
The public candidate profile API and `ParsedResume` shape are unchanged.

## Text and Requirement Evidence

Semantic text uses Unicode NFKC, lowercase and collapsed whitespace, retaining
Vietnamese accents and technical punctuation. Keyword/skill alias matching still
uses the existing accent-folding aliases. Dataset cleaning should call the same
`normalize_semantic_text` rather than removing accents independently.

Requirements currently come from skills, requirement text and lower-weight
description phrases. Phrase splitting preserves `Node.js`/`C#`; it does not split
every dot or `and/or`, cap the first 16 requirements or drop long phrases.
This is a deterministic fallback, not a trained or structured JD parser.

`requirementMatches[]` fields:

| Field | Meaning |
| --- | --- |
| `requirementId` | Path such as `skills/0`, scoped to `jobSnapshotHash` |
| `requirement` | Source phrase before skill normalization; HTML delimiters may be removed |
| `requirementSource` | `skill`, `requirements`, or `description` |
| `evidence` | Source text assembled from CV/profile fields before normalization; null if not found |
| `evidenceSource` | `skill`, `experience`, `project`, `education`, `certification`, or `profile` |
| `evidenceId` | Item ID/path; project technology IDs include `/technologies/:index` |
| `comparisonScore` | 0..100 pair signal before source weighting, or null |
| `comparisonMethod` | `EXACT`, `CONTAINMENT`, `SEMANTIC`, `LEXICAL`, or null |
| `score` | 0..100 existing threshold-binned, source-weighted business score |
| `status` | `MATCHED` for score >=65; `PARTIAL` for 0<score<65; otherwise `NOT_FOUND` |

EXACT and CONTAINMENT are normalized rule matches, not embedding scores.
SEMANTIC is the current cosine-to-0..100 transformation, not raw cosine or a
calibrated probability. LEXICAL includes disabled/unavailable embedding fallback.
The thresholds remain heuristic until validation on labeled data. Evidence text
is assembled from fields, not a PDF character/page offset. `matchedSkills` and
`missingSkills` retain the existing normalized labels for older consumers.

## Ranking Features and Reproducibility

Exact order: `semantic_score`, `skill_score`, `experience_score`, `education_score`,
`project_score`, `certification_score`, `location_score`, `level_score`.
All are finite 0..100; snapshots keep full precision. Display scores round to two
decimals. Logistic inference divides each feature by 100 without further scaling.

Experience uses half-open month intervals, merges overlapping jobs, and clips at
`scoreReferenceDate`. Runtime defaults to the UTC calendar date. Offline feature
generation must supply a fixed date to `MatchingScorer.score(reference_date=...)`.
Missing start month defaults to January. Ended jobs missing end month default to
December. Missing start year or ended jobs missing end year are skipped. Current
jobs use the reference month; future/reversed intervals do not contribute.

Each successful explanation stores:

- Feature/schema/extractor/preprocessing and semantic/ranking model versions.
- `scoreReferenceDate` (ISO date), `dataOrigin`, `candidateSnapshotHash`, `jobSnapshotHash`.
- `inputSnapshots.job` and `.candidate`: exact validated inputs used for scoring,
  for later annotation/export even if the live profile/JD changes.
- `featureLimitations`: `CERTIFICATION_NOT_SCORED`, `EDUCATION_NOT_JD_SPECIFIC`,
  `EXPERIENCE_NOT_SKILL_SPECIFIC`; also `SEMANTIC_REPLACED_BY_REQUIREMENT_SCORE`
  when semantic is disabled or text is empty and requirement score substitutes it.

Hashes are SHA-256 of the validated Python model JSON, with keys sorted,
`separators=(",", ":")`, Unicode retained, encoded UTF-8. Defaults and compatibility
normalization are part of this payload; hashing a raw HTTP response may differ.
Certification remains 0; education and experience remain generic heuristics.
These limitations must be disclosed in dataset/experiment reports. A changed
JD-specific extractor requires a new feature version and rebuilt ranking data.

The internal latest-result endpoint includes `inputSnapshots`. `matching.completed`
omits that field, but retains evidence/features/metadata. Application public DTOs
also omit full input snapshots. This avoids distributing all input text to every
event consumer. Combined DB `model_version` is hashed when longer than 80 chars;
individual versions remain readable in explanation.

## Application API Changes

Application detail responses that fetch a matching result now add:

| Field | Type / historical behavior |
| --- | --- |
| `matchRequirementMatches` | Evidence array, or null if absent in the loaded result |
| `matchRankingFeatures` | Eight-feature object, or null |
| `matchModelMetadata` | Versions/date/origin/hashes/limitations, or null |

Metadata is present when `featureSchemaVersion` exists; historical fields may be
null. Responses that do not fetch matching details, including current list
projections, return these fields as null even if the application has `matchScore`.
For enriched evidence, use an authorized application detail endpoint.

Example of the additional fields (illustrative, not a measured model result):

```json
{
  "matchRequirementMatches": [{
    "requirementId": "skills/0",
    "requirement": "Java",
    "requirementSource": "skill",
    "evidence": "Java",
    "evidenceSource": "skill",
    "evidenceId": "skills/0",
    "comparisonScore": 100,
    "comparisonMethod": "EXACT",
    "score": 100,
    "status": "MATCHED"
  }],
  "matchRankingFeatures": {
    "semantic_score": 80, "skill_score": 90, "experience_score": 70,
    "education_score": 100, "project_score": 75, "certification_score": 0,
    "location_score": 100, "level_score": 80
  },
  "matchModelMetadata": {
    "featureSchemaVersion": "candidate-job-v2",
    "semanticModelVersion": "lexical-fallback",
    "rankingModelVersion": "weighted-baseline-v1",
    "preprocessingVersion": "matching-text-v2",
    "featureExtractorVersion": "heuristic-features-v2",
    "scoreReferenceDate": "2026-10-08",
    "dataOrigin": "PARSED_CV",
    "candidateSnapshotHash": null,
    "jobSnapshotHash": null,
    "featureLimitations": ["CERTIFICATION_NOT_SCORED", "EDUCATION_NOT_JD_SPECIFIC", "EXPERIENCE_NOT_SKILL_SPECIFIC"]
  }
}
```

New successful results have actual hashes; null is supported for historical data.

The create-application `parse` flag defaults to false. Automatic matching is still
requested regardless of this flag. Parsing is requested when matching needs an
unparsed CV. `parse=true` asks to apply parsed information to the candidate profile
when a parsing request is made; an already-parsed CV is reused and is not applied
again by this flag. No automatic stage change is performed by the ranker.

## Dataset JSONL v2

Required common fields: `record_id`, `dataset_version`, `dataset_schema_version`,
`preprocessing_version`, `split` (train/validation/test), `job_id`, `candidate_id`,
`label_source` (recruiter/expert/rubric), `annotator_id`, `candidate_snapshot_hash`,
`job_snapshot_hash`, `data_origin`. Optional `candidate_cv_id` identifies the CV.
Hashes are lowercase 64-character SHA-256. IDs/text cannot be whitespace-only.

Semantic rows additionally require requirement/evidence IDs, text, evidence source,
integer label 0/1 and negative type random/hard for label 0 (null for label 1).
Boolean labels are rejected. Labels come from independent annotation, not the
current model's recommendation or application stage.

Ranking rows require `feature_schema_version=candidate-job-v2`,
`feature_extractor_version=heuristic-features-v2`, `score_reference_date`,
`semantic_model_version`, `features` and integer `relevance` 0..3.
Copy snapshot hashes, versions, date and features from the same result; keep input
snapshots with the dataset's source archive. Relevance rubric must be documented.

Validator defaults to holding out both jobs and candidates, including their
snapshot hashes. `--split-policy job` allows a candidate across partitions for
explicit evaluation on unseen jobs. Exact requirement/evidence text pairs cannot
cross semantic splits; shared generic requirement phrases alone are allowed.
Record/pair duplication and mixed dataset/semantic model versions are rejected.
Within a dataset, one `job_id` must identify one frozen JD hash; separate JD
revisions into different evaluation groups rather than mixing their candidate labels.
Every full dataset needs all three partitions, semantic positives/negatives per
partition and differing candidate relevance for each ranking job.

During preparation `--allow-incomplete` permits missing partitions; other schema
and label checks still apply. This is not a production training validation pass.
The validator does not build splits, mine hard negatives, find near duplicates or
measure annotator agreement. Keep split policy consistent across both model datasets.

```powershell
$env:PYTHONPATH = 'apps/matching-service'
& apps/matching-service/.venv/Scripts/python.exe -m ml.datasets semantic apps/matching-service/ml/data/semantic.jsonl --split-policy job_candidate --allow-incomplete
& apps/matching-service/.venv/Scripts/python.exe -m ml.datasets ranking apps/matching-service/ml/data/ranking.jsonl --split-policy job_candidate
```

## Artifact / Deployment Notes

### English CV Core Foundation Policy (2026-10-18)

Scoped user adjudication follow-up: `prepare_reference_draft.py --revision 2`
creates `standard_v1/reference_draft_v2.json`, preserving v1 and checking its input
provenance before carry-forward. User confirmed the reviewed roofing CV's fit 2,
pest-services CV's fit 1, and PARTIAL for the three over-range preferred-sales-year
cells. Their sales-cycle relations remain PARTIAL. Preferred-range mismatch does
not automatically cap overall fit; these two pair-specific fit decisions must not
be generalized into an industry-change penalty. Five before/after confirmations
are logged; altered priority/source clauses/fit proposals fail closed.

Current reference: 63 decided cells (60 assistant drafts plus three user-confirmed
rubric applications), five holds. Pair-specific fit confirmations are distinct from
independent source/label review. `relevance` remains null, every cell training-excluded,
and dataset human_reviewed/training_ready/bulk_ready remain false. Comparison to the
new draft: generator 54 compatible/9 disagreements; blinded annotator 51/12, five
held excluded. These are not accuracy metrics. 217 tests passed, zero new paid calls;
no raw overwrite, live API change, bulk unlock or budget increase.

Reference-draft follow-up: `dataset/prepare_reference_draft.py` writes immutable
`standard_v1/reference_draft_v1.json`. All eight frozen CVs/68 cells have an explicit
post-hoc assistant decision/reason: 60 draft relations and eight adjudication holds.
Requirement and CV-source hashes bind curated cases; missing/foreign evidence,
source drift, incomplete cells and duplicate identities fail closed. No human
approval is invented: all cells remain training-excluded and relevance remains null.

The draft separates unmentioned evidence N from actual unrelated passages I but
allows either as a relation-compatible retrieval choice on reviewed absent criteria;
this never fabricates a negative passage. Held compound/range/domain criteria are
excluded from comparisons, not converted to negatives. Generator relations align
with 54/60 draft decisions; blinded annotator with 48/60. These are not accuracy
metrics or evidence-selection grades: labels were drafted after observing both
runs, have no independent adjudication, cover only two families and contain no
decided explicit-contradiction cases. This is not an evaluation or training export.
Sales ownership/range policy decisions remain pending. 212 tests passed; no new API
request, fee, raw modification, bulk unlock or deletion in this follow-up.

Blinded annotation experiment follow-up: user explicitly assigned up to two of the
remaining ten calls to reannotation. New `annotations_standard_v1` reuses frozen
English CVs, hides previous labels/rationales/scenarios, deterministically shuffles
candidate order, and uses compact per-candidate evidence enums. Same provider/model,
separate calls: this is not independent-model/human verification. Prompt rules were
updated for known failure types, so the comparison is a regression experiment, not
unseen accuracy. Annotation-input schema hashes bind sources, timelines, core policy,
requirements and reference date. Normalization preserves source identity and content.

Runner accounts for these calls in both the shared 12-request ceiling and a distinct
two-request annotation ceiling. The explicit annotation grant may proceed after the
known source-validation failure without retrying the source call; failed annotation
requests still block further annotation spending. No automatic retry/third trial.
Both calls completed: eight unchanged CVs, 68 cells, all pending. The five targeted
corrections matched, but six new IT counterexamples were identified in assistant
triage, including unsupported cloud entailment and missed explicit AWS experience.
29 relation changes are disagreements, not an accuracy metric. No label promotion.

New usage: 23961 input + 2429 output = 26390 tokens; cumulative four-response pilot:
40722 input + 8665 output = 49387 tokens. Price/cache unreconciled. Eight calls remain
but ten source JDs are ungenerated; completing three source JDs/family now needs at
least two additional calls beyond the old allowance, not implicitly authorized.
API is paused. Raw/source data is unchanged; no bulk/train readiness or deletion.
206 offline tests passed. Primary status: [dataset standard](../dataset/DATASET_STANDARD.md#9-kết-quả-phép-thử-gán-nhãn-riêng-và-bước-tiếp-theo).

Current consolidated standard/work inventory: [dataset/DATASET_STANDARD.md](../dataset/DATASET_STANDARD.md).
User confirmed professional matching separate from eligibility and up to 12 pilot
requests. `source_standard_en_v3` is a new offline generator contract; historical
prompts/data stay unchanged. It allows 24 criteria/JD, explicitly distinguishes
assistant-reviewed pilot inputs from human-approved labels and validates 111 frozen
professional criteria across 12 pilot jobs. Eligibility conditions are retained
separately and cannot silently become core. Material ambiguous source clauses hold
overall relevance approval. New contract is wired to CLI, audit and review dispatch;
no HTTP endpoint, runtime feature or training-v2 contract change.

The bounded runner reserves at most 12 jobs across invocations, restores the API
pause on completion/interruption and blocks ordinary retries or further spending
after a failed/uncertain request. Explicit local socket-denial recovery requires
WinError 10013 and absence of HTTP status, response ID, request ID, text and usage;
the original attempt remains journaled. This is not generic timeout/5xx recovery.

Two actual provider responses returned eight profiles/68 annotations. IT passed
structure but review found overclaimed relational-AND-NoSQL evidence and an overly
strict cloud-familiarity label. Sales was quarantined for three redundant absence
pointers; a read-only derived view exposed missed bilingual evidence and three
experience-range cells requiring adjudication. Original raw/checkpoints stay intact.
Five new label proposals are pending; no reviewed/training promotion took place.
Usage: 16761 input + 6236 output = 22997 tokens, price/cache unreconciled. Remaining
10 requests are paused pending annotation-workflow decision. No bulk or deletion.
193 offline tests passed. Structural acceptance is not semantic-label certification.

Coverage v2 follow-up: `prepare_validation_requirements.py --revision 2` writes
`runs/validation12/revisions/requirements_v2/`, expanding 77 draft criteria to 108
while preserving v1 criterion IDs, source text and core proposals. Explicitly listed
technical terms are checked in source/EN/VI. The whitelist is not an exhaustive term
extractor; coverage/translation review and ambiguous clauses still block generation.
Paid prompts/hashes, historical datasets and v1 outputs remain unchanged.

`dataset/pipeline/batch_review.py::plan_review` is an offline routing utility, not
yet a generator/export gate. It requires supplied automatic-check results for every
candidate and complete per-requirement annotation coverage. It does not itself run
semantic or source validation: callers must supply real check results, not assume
pass. It reviews all pilot CVs; first-batch sampling rounds up 20% per family and
proposed-fit stratum, plus all warnings/failures and uncovered family/relation
strata. Steady 10% sampling requires explicit prior-batch approval. Actual sample
fractions may exceed the baseline, especially on small batches. Failed candidates
remain quarantined; unsampled candidates still await batch approval. Review every
annotation for selected CVs. No automatic approval, deletion, HTTP behavior change
or training readiness is implied. Offline suite: 183 tests passed.

Validation12 requirement preparation: `dataset/prepare_validation_requirements.py`
creates immutable `runs/validation12/revisions/requirements_v1/` with 77 curated
EN/VI requirement drafts and per-JD core proposals. Literal source anchors, numeric
consistency, priority and group references are checked. Requirements remain
`assistant_draft_coverage_pending`, technical protected-term review is pending,
and core groups are proposals only. Generation preflight rejects those proposals;
the existing ancestor API pause also remains active. No CVs or paid requests.

Source-specific review notes retain preferred sales/HR experience, supervised
public-sector HR scope, typing-certificate conditions, hybrid controller-assistant
duties and ambiguous senior Kafka experience wording. Long Finance/IT job coverage
and compound criteria still require completion before generation; a passing anchor
validator does not certify completeness or translation quality. No external links
or application instructions embedded in the JDs were followed. Historical paid
prompts and hashes are unchanged. Offline suite: 173 passing tests.

Pre-bulk validation preparation: `dataset/prepare_validation_pilot.py` selects three
new JDs per family (12 total, 48 intended CVs) from the immutable 500-JD selection-v2,
excluding the historical pilot8 JD identities. It preserves source records and
checks source integrity, title diversity and exact/heuristic near-duplicate issues.
Selection is heuristic, not expert verification of role classification. Each JD
still needs frozen EN/VI requirements and reviewed core groups before generation.
The new `runs/validation12` folder has its own paused `API_CONTROL.json`; historical
pause inheritance does not extend to this sibling run. No paid call is made.

The plan requires reviewing every pilot CV and annotation, resolving all critical
findings per family, freezing provenance/configuration and recording independent
approval before bulk. It does not unlock the existing bulk guard automatically.
Fresh bulk is planned for all 500 JDs (approximately 2000 new CVs), excluding both
historical and validation-pilot CVs. Pilot calls and any extraction/annotation calls
are additional to fresh generation, not part of a presumed 500-call total budget.
Historical data is unchanged now; cleanup is deferred until validation approval and
an inventory of retained provenance. No training/export/HTTP contract is changed.

Scope-review follow-up: `prepare_annotation_review.py --round 2` creates immutable
`annotation_review_v2.json`, retaining v1 and verifying all v1 source hashes before
carrying proposals forward. It adds two pending Accounting proposals: performed
close-document support and monthly reconciliation preparation are not downgraded
solely because someone approves the work. Drafting entries is still not proof of
posting them. No live generator prompt/hash or HTTP behavior is changed.

Experience review counts the union of explicitly selected relevant role periods
using half-open month intervals and the frozen reference date, matching the runtime
month convention without calling or changing its scorer. This is a month-resolution
diagnostic, not a new feature extractor or automatic semantic label. The pilot's
Accounting c1 has 30 months across its roles versus 21 for the current role alone;
its 0-2-year annotation is held for range interpretation. Preserve stated bounds;
neither silently ignore the upper bound nor use it for automatic rejection.
Uncertain cells are intended to be excluded until adjudicated, not automatically
mapped to binary negatives. No training export is produced. 163 offline tests pass.

Offline follow-up: `dataset/prepare_annotation_review.py` writes a single immutable
`annotation_review.json` alongside the English pilot revisions. The four curated
label proposals include exact candidate/requirement identities, expected old
relation, source-file and normalized-payload SHA-256, before/after evidence and
reason. Changed labels or invalid evidence references fail closed during proposal
construction. Rerunning against changed source content does not overwrite the
existing artifact. This is not an apply/approval command or a training export;
all proposals remain pending and overall relevance is unchanged. HR pointer notes
and the existing Marketing translation draft are referenced separately. Other
annotations are not implicitly approved. Regression suite: 156 tests passed.

Offline generator contract `source_foundation_en_v2` uses English CVs and frozen
EN/VI requirements with explicitly approved core competency groups. It does not
change HTTP endpoints, runtime ranking features or training JSONL v2.

- Requirement relation and overall relevance remain separate. A core group with
  direct but partial evidence permits at most relevance 2; a missing or contradicted
  group caps relevance at 1. All groups met permits, but does not force, relevance 3.
  These are consistency ceilings, not proof that the model's relation is correct.
- Group membership and AND/explicitly verified OR semantics are versioned policy,
  not inferred from every required/preferred criterion. The new preparation selects
  only the approved Accounting and HR jobs, excluding Marketing regeneration.
- Previous strict contracts, prompts, hashes and datasets remain historical and
  unchanged. New seeds carry `fit_policy_version=core-foundation-v2` and
  `partial_core_max_relevance=2`; incompatible inputs are blocked before requests.
- Strict generation still rejects NOT_MENTIONED with non-null evidence. A separate
  read-only review view may clear only that redundant pointer and log before/after.
  It cannot invent positive evidence, alter labels, rewrite raw/checkpoints or promote
  quarantined data into accepted/training output.
- Two bounded paid trials returned eight CVs: Accounting passed structural checks
  (four CVs, 36 annotations); HR was quarantined (four CVs, 44 annotations, two
  redundant NOT_MENTIONED pointers). Provider usage was 21253 input plus 5587 output
  tokens; monetary cost/cache is not reconciled. No retries or Marketing requests.
  API calls are paused again. Review flags include AP-only evidence labeled for
  AP/AR and a potentially unsupported degree contradiction.
- All labels remain pending; `human_reviewed`, `training_ready` and `bulk_ready`
  remain false. Structural acceptance does not establish semantic correctness or
  readiness to fine-tune either model. Offline regression suite: 152 tests passed.

### Synthetic Generator Paid-Request Safety (2026-10-15)

Windows follow-up: atomic checkpoint replacement uses unique temporary files and
bounded local `PermissionError` retries (seven attempts). This does not retry the
provider. A transient local write failure during streaming is reported with
errno/winerror while reception continues in memory; subsequent updates try to
persist again. If replacement remains blocked, retain the old checkpoint and a
complete temporary recovery copy named in the diagnostic. Persistent storage
failure still requires manual recovery/inspection, not another paid request.
Pre-request journal failures block the API call. No dataset/API contract changes.

This changes only the offline `dataset/build_recruitment_dataset.py` tool; no
HTTP API endpoint or matching training/data schema changes.

- CLI defaults to streaming and a single request attempt. `--attempts` accepts
  only 1; the SDK also has retries disabled. No automatic endpoint/model fallback.
- Per-JD `request_states/<sha256-job-id>.json` journals are persisted before
  sending and updated with partial text, elapsed seconds, response/request IDs
  and usage when available. Preserve these files when resuming a run.
- Timeout/5xx/disconnection/interruption may be billed. Uncertain, interrupted
  and validation-failed requests are blocked on resume. Legacy generation errors
  are blocked as well. `--retry-job-id ID` explicitly authorizes another paid
  request, retains earlier attempt history, and must not be used blindly.
- `--max-jobs 1` caps new calls per invocation without changing selected JD quotas.
  It is not a monetary limit or lifetime cap; an incomplete run returns exit 1.
- Successful terminal completion AND local validation are required for export.
  Partial output never enters semantic/ranking JSONL. A validated journal record
  can recover the raw checkpoint offline after interruption.
- A per-output-folder exclusive lock blocks concurrent generation. Stale locks
  after a hard kill require process inspection before manual removal. Separate
  output folders are not globally deduplicated.
- Provider streaming compatibility is unverified. Streaming cannot guarantee
  avoiding gateway timeouts or billing. No automatic retrieval/polling is added;
  provider support must be confirmed first. Missing usage is not zero cost.

See [dataset usage and explicit one-JD trial](../dataset/docs/GENERATOR_GUIDE.md#paid-request-safety-2026-10-15).

Logistic JSON artifacts now also require `preprocessing_version=matching-text-v2`
and `feature_extractor_version=heuristic-features-v2`, alongside feature schema,
feature order, coefficients/intercept, model/dataset/semantic versions.
Configured missing/invalid/incompatible artifacts fail explicitly. Without an
artifact, weighted baseline runs as before, with the updated v2 feature inputs.
Semantic version still identifies a configured name/path; immutable weight
checksums/manifests and train/evaluation scripts remain future work. Do not
overwrite model files in place and treat the same path as a new experiment.
