# Plan C: Versioned Feature and Extraction Contract (C01–C06)

## Purpose and Scope

- **Audience**: NexHire backend and ML engineers, dataset annotators, and release reviewers.
- **Goal**: Define, implement, and verify the canonical versioned AI2 input/feature extraction contract (`ai2-features-v1`, `ai2-extractor-v1`) that combines frozen AI1 semantic evidence with independently extracted CV/JD business signals.
- **Constraints**:
  - Legacy runtime behavior (`evidence-only-v1` in `apps/matching-service/app/matching/service.py`) remains 100% frozen until Plan F.
  - Legacy offline benchmark scorer (`MatchingScorer` in `scorer.py` and `candidate-job-v2` in `ranking.py`) remains completely untouched for historical reproducibility.
  - No heuristic error-as-zero substitution (`effective_semantic_score = skill_score` in legacy code is strictly forbidden in AI2).
  - Identical feature extraction across offline training/dataset generation and online inference.
  - Explicit point-in-time calculation with mandatory `score_reference_date` (no unpinned clock calls in batch/offline code).
  - Explicit representation of missingness and unknown dates (never fabricated as 0 tenure).
  - Strict leakage prevention: zero applicant IDs, zero applicant order/index, zero document length features, zero school prestige features, zero protected-attribute proxies (`trẻ tuổi`, `giọng nói chuẩn`).

---

## C01 — Legacy Integration Boundaries Audit

The codebase currently has three distinct matching/ranking contracts:

1. **Legacy Offline Scorer (`candidate-job-v2`, `heuristic-features-v2`)**:
   - Location: `apps/matching-service/app/matching/scorer.py`, `ranking.py`, `ml/datasets.py`.
   - Contract: 8 fixed heuristic scores in $[0, 100]$: `semantic_score`, `skill_score`, `experience_score`, `education_score`, `project_score`, `certification_score`, `location_score`, `level_score`.
   - Architectural defects identified:
     - `certification_score` is hardcoded to `0` in `scorer.py:62`.
     - When `semantic_score` is `None`, it silently substitutes `effective_semantic_score = skill_score` (`scorer.py:58`), concealing semantic missingness.
     - `EDUCATION_LEVELS` in `scorer.py:25-34` only matches English tokens (`bachelor`, `engineer`), giving zero credit to Vietnamese degree terms (`Cử nhân`, `Kỹ sư`, `Thạc sĩ`, `Cao đẳng`). Furthermore, `_score_education` ignores `job` requirements entirely.
     - `_estimate_years` in `scorer.py:253` drops any experience with `isCurrent is False and endYear is None` or `isCurrent is None and endYear is None`, conflating unknown tenure with zero tenure.
     - `WeightedRanker` and `LogisticRanker` output total scores that older code mapped to fit labels (`STRONG_FIT`, `SHORTLIST`), which were retired because they were not calibrated against human hiring decisions.
   - Status: Kept offline and read-only for historical experiment reproducibility.

2. **Active Runtime (`evidence-only-v1`, `ai1-evidence-v1`)**:
   - Location: `apps/matching-service/app/matching/service.py`, `ai1.py`, `m1_runtime.py`, `hr_review.py`, `app/schemas/ai1.py`.
   - Contract: `MatchResult` persists `model_version="evidence-only-v1"`, `scoringStatus="NOT_AVAILABLE"`, `total_score=None`, all component scores `None`.
   - Explanation contains `ai1Assessment`:
     - Schema: `ai1-evidence-v1`.
     - Status: `'READY' | 'DISABLED' | 'UNAVAILABLE'`.
     - Provenance: `weightsSha256`, `manifestSha256`, `modelVersion`.
     - Safety: `candidateSupportVerified=False`, `automaticallyReject=False`, `isTrainingLabel=False`.
     - Content: `requirements[*].evidence[*]` Top-3 hits with `similarityScore`, `retrievalStatus`, `reasonCodes`, `relevant_span`.
   - HTTP & Event projections: `map_result_snapshot` and `publish_completed` sanitize all archived heuristic scores and return only evidence and provenance.
   - Status: Preserved untouched.

3. **New AI2 Contract (`ai2-features-v1`, `ai2-extractor-v1`)**:
   - Location: `apps/matching-service/app/schemas/ai2.py`, `app/matching/ai2_features.py`.
   - Architecture: Opt-in, versioned, standalone feature extraction module shared identically by offline dataset preparation, model training (XGBoost, LambdaMART, Logistic), and future Plan F runtime integration.

---

## C02 — Canonical Input Specification

### Core Input Schema: `Ai2CanonicalInput`

Every AI2 feature calculation consumes an explicit, hash-bound canonical envelope:

```python
class Ai2CanonicalInput(BaseModel):
    job: JobMatchingSnapshot
    candidate: CandidateMatchingSnapshot
    jobSnapshotSha256: str  # 64-hex SHA-256 of serialized job snapshot
    candidateSnapshotSha256: str  # 64-hex SHA-256 of serialized candidate snapshot
    scoreReferenceDate: date  # Mandatory point-in-time anchor (e.g., 2026-11-10 for pilot)
    requirements: tuple[Ai2RequirementSpec, ...]  # Canonical requirement items with importance
    ai1Assessment: Ai1Assessment | None = None  # Optional or precomputed AI1 evidence envelope
```

### Requirement Specification: `Ai2RequirementSpec`

```python
class Ai2RequirementSpec(BaseModel):
    requirementId: str
    text: str
    importance: Literal['required', 'preferred', 'unknown']
    source: Literal['skills', 'requirements', 'description', 'plan', 'source_record']
```

- When `JobRequirementPlan` (`jd_plan.py`) is confirmed by authenticated HR (`HR_CONFIRMED`), its requirement components and declared importance (`core` $\to$ `required`, `preferred`/`supplementary` $\to$ `preferred`, `unknown` $\to$ `unknown`) directly populate `Ai2RequirementSpec`.
- For raw unassisted `JobMatchingSnapshot`, the extractor deterministically segments `job.requirements` into required vs preferred blocks based on standard Vietnamese section headers (`Yêu cầu bắt buộc:`, `Yêu cầu ưu tiên:`). If no header is present, importance is preserved as `'unknown'` (never guessed).

---

## C03 — Deterministic Business Signal Extraction Rules

### 1. Skills & Competencies
- Target skills are extracted from `job.skills` plus technical/method tokens from `job.requirements`.
- Evaluates:
  - `declared_skill_coverage_ratio`: Fraction of JD target skills declared in `candidate.skills`.
  - `role_verified_skill_coverage_ratio`: Fraction of JD target skills explicitly evidenced in `experiences[*].description` / `experiences[*].title` or `projects[*].technologies` / `projects[*].description`.
  - `required_term_coverage_ratio`: Normalized token/alias overlap against all `required` requirements.
  - `preferred_term_coverage_ratio`: Normalized token/alias overlap against all `preferred` requirements.

### 2. Relevant Tenure & Chronological Interval Union
- **Relevance Filtering**: An experience is classified as JD-relevant if and only if its title, description, or role technologies match the JD's core role domain or target skills. Experience in unrelated fields (e.g., an unrelated internship or previous career) is excluded from relevant tenure.
- **Interval Union**: Multiple overlapping roles are projected onto half-open monthly intervals $[start, end)$ and merged:
  $$\text{Months}_{\text{relevant}} = \bigcup_{e \in \text{RelevantExps}} [start_e, end_e)$$
  Concurrent or overlapping jobs are counted exactly once, eliminating double-counting.
- **Explicit Unknown-Date Accounting**:
  - `unknown_date_experience_count`: Count of experiences with missing start date, missing end date where `isCurrent` is false/null, or malformed dates.
  - `has_relevant_experience_with_unknown_dates`: Boolean flag indicating that at least one JD-relevant role has unquantifiable duration. Prevents penalizing candidates with legitimate freelance/consulting experience as having zero tenure.
  - `unknown_current_status_count`: Count of experiences where `isCurrent is None`.
- **Tenure Ratios**:
  - `jd_min_years_required`: Extracted minimum years from JD requirements (e.g., `"Tối thiểu 3 năm"` $\to 3.0$).
  - `relevant_to_required_years_ratio`: $\frac{\text{RelevantYears}}{\text{RequiredYears}}$ (or `None` if JD does not specify minimum years).
  - `relevant_years_gap`: $\text{RelevantYears} - \text{RequiredYears}$ (signed float; `None` if unspecified).

### 3. Education Matching (No School Prestige)
- Education is evaluated **strictly against explicit JD criteria**:
  - If JD does not require a degree, `meets_jd_education_level` is `None` (not penalized).
  - Disjunctions like `"Tốt nghiệp Cao đẳng hoặc Đại học"` evaluate to the **minimum** acceptable tier (Tier 2: Cao đẳng).
  - Degree hierarchy: Tier 0 (THPT), Tier 1 (Trung cấp), Tier 2 (Cao đẳng), Tier 3 (Đại học / Cử nhân / Kỹ sư / Bác sĩ / Dược sĩ), Tier 4 (Thạc sĩ), Tier 5 (Tiến sĩ).
  - Field matching checks candidate `fieldOfStudy` / `degree` against JD required disciplines (e.g., CNTT, Toán - Tin, Marketing, Kinh tế, Dược học).
  - **Zero School Prestige**: University name, tier, ranking, or perceived prestige is strictly excluded from feature extraction per `HR-SOURCE-001`.

### 4. Certifications
- Analyzes whether the JD explicitly mentions certifications.
- Computes `jd_certification_matched_count` and `candidate_certification_count`.
- Absence of certifications is never interpreted as positive proof of lack of skill when not required.

### 5. Work Conditions
- Evaluates `jd_is_remote`.
- Compares normalized city/province (`Hà Nội`, `TP. Hồ Chí Minh`, `Đà Nẵng`) with Vietnamese synonym harmonization (`TP.HCM` = `Sài Gòn` = `Hồ Chí Minh`).
- Missing location yields `location_match = None` and `location_missing_indicator = 1.0`. No commute distance or relocation willingness is inferred from home addresses.

---

## C04 — Frozen AI1 Signal Adapter

When `Ai1Assessment` is supplied:
1. **Binding Verification**: `jobSnapshotSha256` and `candidateSnapshotSha256` must match the canonical input hashes. If they do not, feature extraction raises an explicit `ValueError` (fail closed).
2. **Status Representation**:
   - `ai1_status_code`: `0` (NOT_PROVIDED), `1` (DISABLED), `2` (UNAVAILABLE), `3` (READY).
   - `ai1_available`: `True` if and only if `status == 'READY'`.
   - `ai1_missing_indicator`: `0.0` when available, `1.0` when missing/disabled/unavailable.
3. **Metrics (when `READY`)**:
   - `ai1_mean_top1_similarity`: Mean cosine similarity of top-1 hits across all requirements.
   - `ai1_min_top1_similarity`: Minimum top-1 similarity across all requirements (identifies critical gaps).
   - `ai1_required_mean_top1_similarity`: Mean top-1 similarity over `required` requirements.
   - `ai1_required_min_top1_similarity`: Minimum top-1 similarity over `required` requirements.
   - `ai1_preferred_mean_top1_similarity`: Mean top-1 similarity over `preferred` requirements.
   - `ai1_coverage_ratio_above_ref`: Fraction of requirements with `retrievalStatus == 'CANDIDATE_EVIDENCE'`.
   - `ai1_required_coverage_ratio`: Fraction of `required` requirements with evidence above threshold.
   - `ai1_review_required_ratio`: Fraction of requirements flagged `REVIEW_REQUIRED`.
   - `ai1_negation_cue_count`: Count of hits with `EXPLICIT_NEGATION_CUE`.
   - `ai1_exact_keyword_match_ratio`: Fraction of short-skill requirements with exact keyword match.
   - `ai1_truncated_texts_count`: Diagnostic truncation count.
4. **When `NOT READY`**:
   - ALL similarity and ratio metrics are `None` (never `0.0`). Downstream models must use missing indicators or tree-based missingness branching, not artificial zeros.

---

## C05 — Feature Inventory (`ai2-features-v1`)

Total 46 named features across 8 functional groups:

| # | Feature Name | Group | Type | Range / Semantics | Nullable | Missingness Indicator |
|---|---|---|---|---|---|---|
| 1 | `ai1_available` | `ai1_semantic` | `bool` | `True` if M1 READY & bound | No | None |
| 2 | `ai1_missing_indicator` | `ai1_semantic` | `float` | `0.0` (present) or `1.0` (missing) | No | Self |
| 3 | `ai1_status_code` | `ai1_semantic` | `int` | `0..3` (NOT_PROVIDED, DISABLED, UNAVAILABLE, READY) | No | None |
| 4 | `ai1_mean_top1_similarity` | `ai1_semantic` | `float` | `[0.0, 100.0]` | Yes | `ai1_missing_indicator` |
| 5 | `ai1_min_top1_similarity` | `ai1_semantic` | `float` | `[0.0, 100.0]` | Yes | `ai1_missing_indicator` |
| 6 | `ai1_required_mean_top1_similarity` | `ai1_semantic` | `float` | `[0.0, 100.0]` | Yes | `ai1_missing_indicator` |
| 7 | `ai1_required_min_top1_similarity` | `ai1_semantic` | `float` | `[0.0, 100.0]` | Yes | `ai1_missing_indicator` |
| 8 | `ai1_preferred_mean_top1_similarity` | `ai1_semantic` | `float` | `[0.0, 100.0]` | Yes | `ai1_missing_indicator` |
| 9 | `ai1_coverage_ratio_above_ref` | `ai1_semantic` | `float` | `[0.0, 1.0]` | Yes | `ai1_missing_indicator` |
| 10 | `ai1_required_coverage_ratio` | `ai1_semantic` | `float` | `[0.0, 1.0]` | Yes | `ai1_missing_indicator` |
| 11 | `ai1_review_required_ratio` | `ai1_semantic` | `float` | `[0.0, 1.0]` | Yes | `ai1_missing_indicator` |
| 12 | `ai1_negation_cue_count` | `ai1_semantic` | `int` | $\ge 0$ | Yes | `ai1_missing_indicator` |
| 13 | `ai1_exact_keyword_match_ratio` | `ai1_semantic` | `float` | `[0.0, 1.0]` | Yes | `ai1_missing_indicator` |
| 14 | `ai1_truncated_texts_count` | `ai1_semantic` | `int` | $\ge 0$ | Yes | `ai1_missing_indicator` |
| 15 | `jd_skill_count` | `skills` | `int` | $\ge 0$ | No | None |
| 16 | `declared_skill_coverage_ratio` | `skills` | `float` | `[0.0, 1.0]` | Yes | `None` if JD skills empty |
| 17 | `role_verified_skill_coverage_ratio` | `skills` | `float` | `[0.0, 1.0]` | Yes | `None` if JD skills empty |
| 18 | `required_term_coverage_ratio` | `skills` | `float` | `[0.0, 1.0]` | Yes | `None` if no required terms |
| 19 | `preferred_term_coverage_ratio` | `skills` | `float` | `[0.0, 1.0]` | Yes | `None` if no preferred terms |
| 20 | `jd_min_years_required` | `experience` | `float` | $\ge 0$ | Yes | `None` if unstated in JD |
| 21 | `total_verified_experience_months` | `experience` | `int` | $\ge 0$ (interval union) | No | None |
| 22 | `relevant_experience_months` | `experience` | `int` | $\ge 0$ (interval union) | No | None |
| 23 | `relevant_to_required_years_ratio` | `experience` | `float` | $\ge 0.0$ | Yes | `None` if min years unstated |
| 24 | `relevant_years_gap` | `experience` | `float` | Signed float (years) | Yes | `None` if min years unstated |
| 25 | `relevant_role_title_match_count` | `experience` | `int` | $\ge 0$ | No | None |
| 26 | `unknown_date_experience_count` | `experience` | `int` | $\ge 0$ | No | `has_any_unknown_dates` |
| 27 | `unknown_current_status_count` | `experience` | `int` | $\ge 0$ (`isCurrent is None`) | No | `has_any_unknown_dates` |
| 28 | `has_relevant_experience_with_unknown_dates` | `experience` | `bool` | `True` if relevant role lacks dates | No | None |
| 29 | `has_projects` | `projects` | `bool` | `True` if candidate has projects | No | None |
| 30 | `relevant_project_count` | `projects` | `int` | $\ge 0$ | No | None |
| 31 | `project_skill_coverage_ratio` | `projects` | `float` | `[0.0, 1.0]` | Yes | `None` if JD skills empty |
| 32 | `jd_education_required_level` | `education` | `int` | `0..5` | Yes | `None` if JD has no degree req |
| 33 | `jd_education_importance_code` | `education` | `int` | `0..2` (none, preferred, required) | No | None |
| 34 | `candidate_max_education_level` | `education` | `int` | `0..5` | Yes | `None` if candidate has no edu |
| 35 | `meets_jd_education_level` | `education` | `bool` | `True` if degree $\ge$ required | Yes | `None` if JD has no degree req |
| 36 | `education_field_match` | `education` | `bool` | `True` if field overlaps JD spec | Yes | `None` if JD has no field req |
| 37 | `jd_certification_requirement_present` | `certifications` | `bool` | `True` if JD mentions certs | No | None |
| 38 | `jd_certification_matched_count` | `certifications` | `int` | $\ge 0$ | No | None |
| 39 | `candidate_certification_count` | `certifications` | `int` | $\ge 0$ | No | None |
| 40 | `jd_is_remote` | `work_conditions` | `bool` | `True` if remote | No | None |
| 41 | `location_match` | `work_conditions` | `bool` | `True` if remote or city matches | Yes | `location_missing_indicator` |
| 42 | `location_missing_indicator` | `work_conditions` | `float` | `1.0` if location missing on either | No | Self |
| 43 | `missing_experiences_section` | `data_quality` | `bool` | `True` if 0 experiences | No | Self |
| 44 | `missing_skills_section` | `data_quality` | `bool` | `True` if 0 skills | No | Self |
| 45 | `missing_education_section` | `data_quality` | `bool` | `True` if 0 educations | No | Self |
| 46 | `has_any_unknown_dates` | `data_quality` | `bool` | `True` if any date missing | No | Self |

---

## C06 — Leakage & Sensitivity Safeguards

1. **Excluded Input Attributes**:
   - Identifiers: `job_id`, `candidate_id`, `candidate_user_id`, `candidate_cv_id`, `application_id`.
   - Index / Ordering: candidate ordinal position in batch/file (`C01`..`C08`).
   - Length proxies: Raw word count, token count, character length, or line count of CV or JD.
   - Demographics: Gender, age, marital status, photograph, voice/accent characteristics (`giọng nói chuẩn`), age proxies (`trẻ tuổi`).
   - School prestige: University names, tiers, national rankings (`các trường uy tín`).
   - Downstream feedback: Annotator labels, adjudication rationales, relevance scores, recruiter actions.

2. **Mathematical Invariance Properties (Verified by Unit Tests)**:
   - Permuting candidate order within a JD leaves every candidate's extracted feature vector bitwise identical.
   - Changing candidate ID or application ID produces bitwise identical features.
   - Adding whitespace or formatting padding to CV text without changing structured content leaves features unchanged.
   - AI1 `DISABLED` vs `UNAVAILABLE` produces explicit status codes and preserves missingness indicators without fabricating zero similarity scores.
