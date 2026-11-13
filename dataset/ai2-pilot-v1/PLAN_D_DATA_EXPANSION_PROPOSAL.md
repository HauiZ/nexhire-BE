# Plan D: Evaluation-Grade Data Expansion Design & Gate D Approval Packet

**Status**: Design Proposal Only (Pending User Gate D Approval; No Bulk Generation or Real Private Data Export Executed)
**Audience**: NexHire project owners, engineering team, and data reviewers.

---

## 1. Why the 20-JD / 160-Pair Pilot Cannot Serve as Production Test

1. **Development Contamination**: All 20 JDs and 160 CVs in `ai2-pilot-v1` were inspected, repaired, and debugged interactively with human rules (`HR-SOURCE-001..011`) and feature engineering (`plan_c_feature_audit.json`).
2. **Candidate Template Repetition (`HR-SOURCE-009`)**: Across the 20 pilot JDs, candidate slots `C01..C08` exhibit recognizable scenario archetypes (e.g., `C01` stack-complete, `C05` junior, `C07` missing dates).
3. **Synthetic vs. Real Parser Gap**: Pilot CVs are clean UTF-8 authored strings, whereas real production inputs pass through PDF/DOCX extraction and `cv-parsing-service` (`GeminiResumeNormalizerService`), which introduces OCR noise, missing dates, malformed spans, and fragmented fields.

---

## 2. D01 — Coverage, Provenance, Privacy, and Sizing Methodology

### Target Coverage Matrix
- **Domains**: Software/IT (Backend, Frontend, Data, Mobile, DevOps, QA, AI/ML), Sales (B2B SaaS, Retail/FMCG, Medical/Technical, Interior/Design), Marketing (Performance, Content/PR, Brand, SEO, Product Marketing), plus additional core NexHire categories (HR/Operations, Finance/Accounting) if supported by authorized JDs.
- **Levels**: Junior/Fresher, Mid, Senior/Lead balanced across each domain so ranking models do not equate seniority with domain relevance.
- **Candidate Pool Sizes**: Vary pool size per JD (e.g., 8 to 25 applicants per JD, reflecting realistic shortlisting queues rather than a fixed 8-per-JD quota).

### Data Provenance & Privacy Minimization
- **Primary Evaluation Source (Preferred if Consented)**: Anonymized/consented internal staging or production-like applications processed through the real `cv-parsing-service` $\to$ `CandidateMatchingSnapshot` pipeline (`PROFILE` and `PARSED_CV` origins).
  - Strip direct PII (`fullName`, `phone`, `contactEmail`, `avatarUrl`, `portfolioUrl`, `linkedinUrl`) before offline storage or annotation.
  - Retain immutable `jobSnapshotSha256` and `candidateSnapshotSha256`.
- **Supplemental Diverse Synthetic Data (If Real Data Unconsented/Insufficient)**: Newly generated synthetic JDs/CVs produced by diverse authoring templates (varying formatting, section order, bullet density, missing fields, and noise injected via simulated parser artifacts).

### Sample-Size Estimation Method (No Invented "Magic Numbers")
Rather than asserting an arbitrary fixed JD count as "production-sufficient":
1. Measure JD-level variance ($\sigma_{\Delta\text{NDCG@5}}$) of paired ranking differences on the 20-JD development pilot (once Plan B silver labels exist).
2. Set target minimum detectable effect ($\Delta_{\min}$, e.g., $+0.04$ NDCG@5) and target 95% confidence interval half-width.
3. Compute required held-out JD count via paired cluster-level power analysis:
   $$N_{\text{JDs}} \ge \left(\frac{(z_{1-\alpha/2} + z_{1-\beta}) \cdot \hat{\sigma}_{\Delta}}{\Delta_{\min}}\right)^2$$
4. Adjust upward for slice power across domain (IT vs. Commercial) and seniority (Junior/Mid/Senior).

---

## 3. D02 — Parser Realism & Authoring Diversity

- Representative sample of parsed outputs from `apps/cv-parsing-service` (real PDF/DOCX test resumes with explicit test-usage consent) must be audited alongside `extract_ai2_features`.
- Check specifically for:
  - Missing `startMonth` / `endMonth` / `isCurrent: null`
  - Merged or empty `skills` arrays when experience descriptions carry core tools
  - Vietnamese diacritic loss or PDF line-wrap artifacts
  - Discrepancies between `PROFILE` and `PARSED_CV` snapshot shapes (`service.py:172-244`)

---

## 4. D03 — Partitioning, Deduplication, and Anti-Contamination Protocol

1. **Strict JD + Source-Family Grouping**:
   - Split partitions (`train` / `validation` / `test`) exclusively by `source_family_id` and `job_id`.
   - Zero shared JDs or paraphrased JD clones across splits.
2. **Cross-Partition Deduplication**:
   - Exact SHA-256 hash check on normalized JD and CV text.
   - 5-gram token Jaccard near-duplicate check (`>= 0.50`) + semantic similarity check across splits; any cross-split pair exceeding threshold is quarantined or assigned to the same partition.
3. **Candidate-Disjoint Stress Split**:
   - Maintain a secondary evaluation slice where candidates appearing in `test` have zero overlap (`candidate_id` and normalized CV hash) with `train`/`validation`, verifying generalization to unseen applicants.
4. **AI1 Training-Data Overlap Check & Out-of-Fold Predictions**:
   - Cross-check every JD and CV text against frozen AI1 M1 training/validation datasets (`ml/datasets.py`, `artifacts/ai1-*`).
   - Any non-test training records overlapping AI1 training data MUST use **out-of-fold** AI1 predictions (or be excluded from AI2 training) so AI2 does not overfit inflated in-sample AI1 similarity scores.
   - Untouched final `test` records MUST have zero overlap with AI1 training data.

---

## 5. D04 — Untouched Evaluation / Test Freeze Protocol

- **Separation of Concerns**: Authoring, repair, and feature-debugging scripts NEVER read the frozen `test` partition.
- **Human Gold Standard for Test**: Every pair in the untouched `test` set is independently reviewed by human adjudicators using the frozen `ANNOTATION_RUBRIC_B01.md` (two independent passes + adjudication). Model-only silver agreements are NOT used as final confirmatory truth on the `test` partition.
- **Immutability**: Once frozen, compute and commit SHA-256 manifests (`test_manifest.sha256`).
- **One-Shot Discipline**: If a candidate model fails confirmatory evaluation on `test`, do NOT tune features/hyperparameters and re-score the same `test` set; trigger a new development cycle and freeze a fresh `test` set for future confirmatory claims.

---

## 6. Gate D — Decisions Required From User Before Execution

1. **Data Source Authorization**: Confirm whether consented real/anonymized staging applications may be sampled, or restrict Plan D expansion to newly generated multi-template synthetic data.
2. **Annotation Budget & Ownership**: Confirm who owns final human gold adjudication on the untouched `test` partition (HR domain experts vs. engineering team + Sol review).
3. **Token / Compute Budget**: Approve LLM generation and blind-review budget once Plan B pilot variance yields exact JD count sizing via the power formula above.
