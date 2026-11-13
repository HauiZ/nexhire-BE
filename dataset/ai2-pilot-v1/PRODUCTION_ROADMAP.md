# AI2: task plan from development pilot to production readiness

## Purpose and authorization

Audience: NexHire engineers and human dataset/release reviewers.

Goal: rank applicants within one JD for human review, using frozen AI1 evidence signals plus independently sourced CV/JD business features. Not automatic hiring/rejection, competence verification, personality prediction or cross-JD ability scoring.

User requested autonomous task planning toward production readiness. Continue reversible local development and approved source repairs without repeated questions about equivalent cases. This roadmap does not waive data-use consent, budget approval for substantial new generation/training, human adjudication, or explicit approval before enabling ranking in live production. Existing prohibition on training/deployment is not silently overridden by this planning request: obtain approval at training and live-release gates. Preserve AI1 and old AI2 behavior; develop a versioned, opt-in new path.

Maximum two agents concurrently. Gemini `ag/gemini-3.8-flash-high` for synthetic source generation/repair; Sol `cx/gpt-6.1-sol` for annotation and review with separate fresh contexts. Verify mapping before dispatch; never substitute or change main model. No automatic Superpowers. Active jobs must be tracked by harness task IDs and notifications, not by process-name grep alone; never restart an apparently absent worker while its tracked job is unresolved.

## Current baseline

- 20 JD / 160 synthetic pairs, development only. Cannot retroactively call these an untouched test.
- Source audits and 11 human source decisions exist. Repair underway; acceptance still blocked.
- V1 repair incorrectly crossed IT employment boundaries. V2 corrected 79 descriptions and 15 skill links; exact snapshots/logs retained. Regression tests and broader validation needed before trusting repair automation.
- IT generator produced partial organization/prose changes and metadata instead of requested full snapshot. Exact v2 was reconstructed and hash-verified. Reconcile actual diffs, logs and concurrency before accepting results.
- Commercial source jobs may still be outstanding. Resolve all tracked original/retry task IDs before any further source writer starts.
- Current repository `app/matching/ranking.py` explicitly describes offline rankers with no runtime AI2. Existing eight-feature heuristic schema and logistic artifact are legacy contracts, not automatically the new model architecture. Inspect scorer/API/training integration in detail before proposing edits there.
- Backup branch `backup/ai2-pilot-v1` contains an earlier transfer snapshot; local subsequent changes require validated checkpoint commits.

## Progress status (updated 2026-11-12)

- **Plan A (`A01–A08`) — READY FOR GATE A**: All 20 JDs (160 pairs) passed independent post-repair verification (`audits-v3/`, `source-acceptance-manifest-v3.json`) with `0` blocking issues, `0` mechanical validation errors (`validate_sources.py`), `0` exact/near-duplicates (`>= 0.5`), and `6/6` tests passing in `test_pilot_validation.py`.
- **Plan B (`B01` done; `B02–B07` pending Gate A + GPT reset)**: Rubric, validator, and agreement analyzer ready (`ANNOTATION_RUBRIC_B01.md`, `validate_labels.py`, `analyze_label_agreement.py`, `2/2` tests OK). Labeling (`B02–B03`) blocked until Gate A sign-off and `cx/gpt-6.1-sol` reset.
- **Plan C (`C01–C06`) — IMPLEMENTED & AUDITED**: Shared `ai2-features-v1` contract (`app/schemas/ai2.py`, `app/matching/ai2_features.py`, `PLAN_C_CONTRACT.md`) verified over all 160 pairs (`plan_c_feature_audit.json`, `11/11` tests OK in `test_ai2_features.py`).
- **Plan D (`D01–D04` spec)**: Proposal ready (`PLAN_D_DATA_EXPANSION_PROPOSAL.md`); awaits Gate D budget/scope approval.
- **Plan E (`E01` code + protocol)**: Pre-registered protocol (`PLAN_E_EXPERIMENT_PROTOCOL.md`) and metrics (`ml/ai2_eval_metrics.py`, `3/3` tests OK); training remains locked behind Gate B, Gate D, and explicit Gate E approval.
- **Plans F & G (architecture spec)**: Default-off design spec (`PLAN_F_G_PRODUCTION_DESIGN.md`) prepared; legacy `evidence-only-v1` untouched.

## Execution rules

Every task closes with: changed files, tests/checks actually run, output hashes/versions where applicable, unresolved issues and next task. Never equate generator claims, process exit code 0, lexical checks or audit coverage with acceptance.

Maintain source provenance and per-finding dispositions: fixed, accepted limitation, retained ambiguity, pending human. Human source decisions are not relevance gold labels. Keep raw initial/blind labels and adjudication separate from inference inputs.

## Plan A — source acceptance (current critical path)

| ID | Task | Done when |
|---|---|---|
| A01 | Reconcile original/retry Gemini jobs and source ownership | Every task ID resolved; no concurrent writer per source; exact current/pre-change snapshots and SHA-256 manifest recorded |
| A02 | Review IT actual changes against 11 decisions | All diffs accounted for; no unauthorized cross-job identity splitting, loss of factual career context, or inconsistent renames; restore unapproved edits from exact snapshot selectively |
| A03 | Complete commercial repairs | Every role/project skill has local evidence; descriptions preserve operations/quantifiers/support scope; no fabricated evidence |
| A04 | Finish organization fictionalization | Consistent mapping for employer/customer/partner mentions across all sources; product/tool/education exclusions respected; no external verification claim |
| A05 | Complete bias/style/unknown handling | Discriminatory proxies excluded; JD-shaped denials removed with logs; degree/tenure ambiguities retained; nullable current status faithful |
| A06 | Harden validation and regression tests | Strict keys/types/enums, duplicate JSON keys/IDs, role/project references, month dates, joins, importance fidelity and bounded-role tests covered; validator exits nonzero on failures |
| A07 | Refresh source audit and limitations | All 160 source records reconciled; every blocking issue fixed or human-adjudicated; exact/near-duplicate report refreshed; reference date remains 2026-11-10 |
| A08 | Freeze pilot source release | Immutable hashes, source changelog, current README and acceptance manifest; old audits explicitly historical; no unresolved blocking defects |

Gate A: source acceptance required before annotation. Retained unknowns can remain if faithful and flagged; they are not fabricated zeros.

## Plan B — silver annotation and human adjudication

| ID | Task | Done when |
|---|---|---|
| B01 | Freeze rubric and annotation fixtures | Relevance 0–3, required/preferred handling, unknown evidence and exclusions documented; test examples approved without using AI1 scores as labels |
| B02 | Initial annotation | Sol fresh contexts receive only protocol and frozen sources; exactly one record per pair, exact citations, requested model recorded |
| B03 | Blind annotation | Separate fresh contexts cannot see initial labels, source repair discussions or scores; outputs preserved independently |
| B04 | Validate annotations | Strict schema, complete pair coverage, valid requirement/section IDs and exact nonempty quotes; central required criteria covered or explicitly unknown |
| B05 | Agreement analysis | Confusion matrix, exact/adjacent agreement, weighted kappa with limitations, per-domain disagreement; no unsupported statistical generalization from 20 JD |
| B06 | Human queue | All disagreements and flagged/material ambiguities plus deterministic agreement sample shown to user; record decisions without erasing original labels |
| B07 | Freeze labeled development pilot | Clearly separate silver agreements, human-reviewed labels and unresolved cases; unresolved labels excluded from training export unless approved explicit policy |

Gate B: labels never become expert gold merely because models agree. This pilot is for pipeline development and early experiments only.

## Plan C — versioned feature and extraction contract

| ID | Task | Done when |
|---|---|---|
| C01 | Inspect legacy integration boundaries | Actual scorer/API/parser/storage/training paths documented; preserve old behavior and AI1 |
| C02 | Specify new canonical inputs | CV/JD snapshot hashes, requirement importance, evidence refs, explicit reference date, parser/extractor versions and unknown semantics defined |
| C03 | Implement deterministic business extraction | Relevant tenure uses explicit task/date linkage and interval union; unknown dates separate; degree/certificate checks only against explicit requirements; no school prestige/age/accent/ID features |
| C04 | Implement frozen AI1 signal adapter | Actual model/version-bound signals, retrieval availability and failures represented explicitly; no fake scores and no error-as-zero |
| C05 | Shared offline/online extractor | Same implementation and version used both paths; golden fixtures cover projects, overlapping jobs, missing dates, partial evidence, parser errors and Vietnamese aliases |
| C06 | Leakage/feature audit | Labels/rationales/scenario tags/order/IDs never inference features; document length and missingness sensitivity measured; provenance for each feature |

Gate C: identical inputs/reference date/model version produce matching offline/online features within declared numerical tolerance. Unsupported features dropped or marked missing, never filled by invention.

## Plan D — evaluation-grade data (separate from pilot)

D01: propose domain/level coverage, authorized data provenance, privacy minimization and annotation budget. Do not invent a production-sufficient sample count; size from pilot variance, desired detectable effect and JD-level power/precision analysis.

D02: acquire/generate newly approved data with varied authoring patterns and review representative real-world parsing inputs only with authorized data access. Synthetic-only success does not establish real-applicant performance.

D03: split by JD and source family before training; deduplicate and near-deduplicate JD/CV across partitions. Add candidate-disjoint stress evaluation when claiming generalization to unseen candidates. Check overlap against AI1 training data; use out-of-fold AI1 predictions where needed for non-test data.

D04: create human-reviewed, untouched evaluation/test data, separate from source generation/repair feedback and model selection. Freeze access and hashes. Test never tunes features, thresholds or model selection. Test failure triggers new development cycle and a fresh test for future confirmatory claims.

Gate D: user approves data design, budget and annotation ownership before bulk expansion. If adequate representative evaluation is unavailable, restrict result to research/development, not production-ready.

## Plan E — controlled model experiments

Training gate: obtain explicit approval to start training and agreed compute budget; no AI1 retraining.

E01: pre-register primary metric (proposed macro-JD NDCG@5), secondary NDCG@3, Precision/Recall@K and MRR; define relevant label threshold, gain function, ties and zero-relevant-JD denominators. Final K must match actual reviewer workflow and candidate-pool sizes.

E02: implement semantic-only and legacy-weighted diagnostic baselines, business-only baseline, combined logistic baseline with explicitly defined binary threshold if used, and XGBoost/LambdaMART candidate using graded relevance/JD groups. Choose simplest model with evidence; do not force a complex model to win.

E03: tune only on development/validation, repeat seeds, log data/feature/model versions, code revision, dependencies, parameters and costs. Fit preprocessing only on training folds.

E04: ablate semantic signals with same model family and protocol; evaluate missing/noisy AI1, missing CV sections, parser failures, document length and domain/level slices. Compare job-level paired effects and confidence intervals, not pooled-pair metrics alone.

E05: freeze selected artifact before untouched-test evaluation. Report positive/negative results honestly. Proposed release criterion: lower bound of predeclared paired 95% CI for primary-metric improvement above zero against strongest approved baseline, plus no violation of predeclared slice non-inferiority margins. Minimum practical improvement and slice margins must be approved BEFORE confirmatory evaluation, not chosen from observed test results.

Gate E: no promotion from 160-pair synthetic pilot scores. No pass claim without representative untouched evaluation and human review.

## Plan F — opt-in runtime integration

F01: new versioned ranking endpoint/contract ranks candidates only within one JD and authorized application pool; deterministic ties, pagination/order consistency and snapshot identity checks.

F02: artifact loader validates signature/checksum, schema/feature order, extractor and frozen-AI1 compatibility. Reject unsupported versions and unsafe serialization; no arbitrary pickle loading from untrusted inputs.

F03: explicit ready/unavailable/partial-input states. AI1 outage does not silently use weighted score, zero semantic or unvalidated fallback. Recruiters retain access to source profiles when ranking unavailable.

F04: bounded inference, batching, caching by snapshot+reference date+versions, invalidation on CV/JD edits, timeouts and concurrency limits. Set latency/throughput/memory targets from measured app workload and infrastructure budget before load-test acceptance.

F05: evidence UI separates cited profile evidence from actual model feature contributions; score is not hiring probability. Human can inspect/override order; no automatic rejection or protected-attribute inference.

F06: unit, integration, contract, authorization/tenant-isolation, stale-cache, retry/idempotency, load and failure-injection tests. AI1 and old AI2 regression suite unchanged/passing.

Gate F: default-off feature flag, rollback tested, no externally visible release yet.

## Plan G — staging and production readiness

G01: immutable build/artifact/dependency manifest, model card, dataset card, operational runbook, privacy/access review and limitations.

G02: staging end-to-end from uploaded CV/JD through actual parser, extractor, frozen AI1, ranker and UI. Test offline/online consistency on parsed documents, not only authored JSON.

G03: consented shadow run with no user-visible ranking changes; log operational failures and versioned metrics without raw PII. Human reviews bad cases. Shadow data cannot silently become labels/training data.

G04: define monitoring thresholds for availability, latency, missingness, feature/score drift and domain distribution; delayed human quality metrics and escalation owner. Drift is an alert, not automatic retraining approval.

G05: production release checklist and explicit user/operator approval of target environment, rollout fraction, resource budget, access controls, model version and rollback trigger. Start canary only after approval. Verify rollback to pre-AI2 behavior, not an unvalidated scoring fallback.

Gate G: production-ready means validated artifacts + representative evaluation + integration/security/load checks + human oversight + runbook/rollback. Actually enabling production is a separate approved action. If any gate fails, report blocker and keep feature off.

## Work allocation and checkpoints

- Source repair: at most one Gemini writer per source file; two domains in parallel only with disjoint paths. Coordinator owns protocol, validation, decisions and acceptance.
- Review/annotation: at most two Sol contexts, clean input isolation. A model-context failure can be retried within bounded budget; never run duplicate writers after guessing process state.
- Code work after contracts: divide extractor/tests versus service adapter/tests with explicit disjoint ownership; review integration centrally.
- Commit/push validated checkpoints to `backup/ai2-pilot-v1` per user's transfer authorization. Include only scoped artifacts, exclude credentials/private data and stale derived source copies. Record incomplete status honestly.

## Next actionable queue

1. A01: resolve outstanding commercial original/retry jobs and reconcile IT changes.
2. A02–A06: complete approved repairs and strengthen validation; test failed-parser regression.
3. A07–A08: freeze accepted source hashes and update checkpoint branch.
4. B01–B07: separate-context silver labels and human adjudication.
5. C01–C06: feature/extraction spec and local implementation; prepare D design and E training-approval packet, without training or production deployment yet.
