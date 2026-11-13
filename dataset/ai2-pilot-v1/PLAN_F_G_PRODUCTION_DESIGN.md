# Plans F & G: Opt-In Runtime Integration, Staging Shadow, and Production Readiness Spec

**Status**: Architectural & Acceptance Spec Only (Default-Off Feature Flag; No Live Production Activation Without Gate E & Gate G Approval)
**Audience**: NexHire backend engineers, platform/DevOps owners, and release reviewers.

---

## 1. Plan F — Opt-In Runtime Integration (`ai2-rank-v1`)

### F01 — Versioned Single-JD Ranking Contract
- **Endpoint**: New internal endpoint `POST /api/v1/matching/jobs/{job_id}/rank-ai2` (opt-in behind `MATCHING_AI2_ENABLED=false` default-off flag).
- **Invariants**:
  - Ranks candidates **exclusively within one `job_id`** and authorized application pool (`job_id` mismatch or cross-tenant ID fails closed with HTTP 403/422).
  - Returns `rankingOrder`, `rankPosition`, `rankScore`, `scoreMeaning="WITHIN_JD_REVIEW_PRIORITY_ONLY_NOT_HIRING_PROBABILITY"`, `status` (`"READY" | "UNAVAILABLE" | "DISABLED"`), and `limitations`.
  - **Deterministic Tie-Breaking**: Sort by `(-rank_score, application_submitted_at ASC, application_id ASC)` — never array insertion order or `candidate_id` ordinal.

### F02 — Safe Signed Artifact Loading
- `MATCHING_AI2_MANIFEST_PATH` + `MATCHING_AI2_MANIFEST_SHA256` (mirroring `LocalM1Runtime.verify_manifest` in `app/matching/m1_runtime.py`):
  - No arbitrary `pickle` deserialization from untrusted inputs (use JSON/ONNX/XGBoost UBJSON + explicit SHA-256 verification).
  - Validate exact compatibility at load time:
    - `feature_schema_version == "ai2-features-v1"`
    - `feature_extractor_version == "ai2-extractor-v1"`
    - `preprocessing_version == "matching-text-v2"`
    - `feature_names == list(AI2_FEATURE_NAMES)`
    - Bound `ai1_model_version` & `ai1_weights_sha256` match active frozen AI1 manifest.
  - Any mismatch rejects loading and forces `status="UNAVAILABLE"` (never silent fallback).

### F03 — Explicit Ready / Unavailable / Partial States
- **Never substitute `skill_score` or `0.0` when AI1 is `DISABLED` or `UNAVAILABLE`**:
  - Unless a separately evaluated and explicitly registered `business-only` fallback artifact is intentionally configured and labeled with its own `model_version` + `degradedMode="BUSINESS_ONLY_NO_AI1"`, AI1 outage returns `ai2Status="UNAVAILABLE"`, `ranks=[]` (or unranked application list ordered by submission time), and preserves full recruiter access to profiles & source evidence.
- **No Auto-Rejection**: `automaticallyReject` remains locked `False`; human recruiters can inspect and override every ranking position.

### F04 — Bounded Inference, Caching & Latency Targets
- Cache key: `(job_snapshot_sha256, candidate_snapshot_sha256, score_reference_date, ai1_weights_sha256, ai2_manifest_sha256)`.
- Any edit to JD requirements/skills or candidate CV invalidates the cached snapshot digest automatically.
- Target budgets (to be calibrated against staging load profile before load-test sign-off):
  - Feature extraction `extract_ai2_features`: `< 5 ms` per candidate pair (verified deterministic pure Python).
  - Batch ranker inference over 50–100 candidates in one JD: `< 50 ms` p95.
  - Bounded pool cap & request concurrency limits with graceful `429`/`503` backpressure.

### F05 — Evidence vs. Model Feature Attribution Separation
- UI/API response separates two distinct sections:
  1. **Profile / AI1 Evidence** (`ai1Assessment` verbatim quotes, section citations, `relevantSpan`).
  2. **AI2 Feature Summary & Limitations** (explicit missingness flags like `EXPERIENCE_DATES_UNKNOWN`, `LOCATION_MISSING`, plus exact feature provenance/contributions if linear or TreeSHAP audited).
- **Prohibited**: Claiming an AI1 displayed snippet *caused* the rank score, displaying rank score as a "% fit" or "hiring probability", or exposing protected attributes / school prestige.

### F06 — Required Pre-Merge Test Matrix
- Unit tests (`test_ai2_features.py`, `test_ai2_eval_metrics.py`, ranker loader/manifest tamper tests).
- Contract tests ensuring legacy `evidence-only-v1` (`scoringStatus="NOT_AVAILABLE"`, `totalScore=None`) and `hr_review_snapshot` remain 100% unchanged when `MATCHING_AI2_ENABLED=false`.
- Cross-tenant authorization & stale-cache invalidation integration tests.
- Failure-injection tests (AI1 manifest tamper, AI1 timeout, malformed `parsed_resume`, missing dates).

---

## 2. Plan G — Staging, Consented Shadow Run, Monitoring & Canary Gate

### G01 — Release Manifest & Documentation
- Immutable release manifest (`model_card`, `dataset_card`, SHA-256 artifact pins, dependency lockfile hash, limitations, and operational runbook).

### G02 — Staging End-to-End Parity Verification
- Upload real/test PDF & DOCX CVs through `cv-parsing-service` $\to$ `CandidateMatchingSnapshot` $\to$ `LocalM1Runtime` (`ai1Assessment`) $\to$ `extract_ai2_features` $\to$ AI2 ranker.
- Assert feature vectors computed online match offline `extract_ai2_features` replay on the persisted `inputSnapshots` within `1e-6` numerical tolerance.

### G03 — Consented Shadow Run
- Enable `MATCHING_AI2_SHADOW=true` in staging/consented shadow mode (writes shadow metrics & availability logs internally; **zero UI/API order changes**).
- Log aggregate operational telemetry (latency, `ai1Status`, missing-date rate, score distribution) **without raw CV PII**.
- Shadow logs never silently become training labels without explicit human review and consent.

### G04 — Monitoring & Escalation Thresholds
- Alert thresholds:
  - AI1 `UNAVAILABLE` rate $> 1\%$ over 15 min window.
  - Feature extraction `unknown_date_experience_count` or `missing_skills_section` drift $> 2\times$ baseline.
  - Inference p95 latency breach or score distribution PSI $> 0.20$.
- Drift triggers human investigation, **never automatic retraining/deployment**.

### G05 — Production Canary Approval & Rollback Checklist
- Requires explicit operator/user approval of: target environment, canary traffic fraction (e.g., 5% opted-in recruiters), resource limits, access controls, exact `ai2_manifest_sha256`, and rollback trigger.
- Rollback verification: flipping `MATCHING_AI2_ENABLED=false` immediately restores pre-AI2 `evidence-only-v1` ordering with zero DB schema reversion required.
