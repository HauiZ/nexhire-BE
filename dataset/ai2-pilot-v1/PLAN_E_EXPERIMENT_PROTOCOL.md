# Plan E: Controlled Model Experiment Protocol & Training-Gate Packet

**Status**: Pre-Registered Specification Only (Pending Plan B Labels, Plan D Approved Data, and Explicit User Training Approval — Zero Model Training Executed Yet)
**Audience**: NexHire engineering team, ML reviewers, and release approvers.

---

## 1. Pre-Registration Guarantee (E01)

All primary metrics, tie-breaking rules, baseline models, and acceptance criteria are declared here **before** observing any model performance on validation or untouched test data. No AI1 weights will be retrained or modified in Plan E.

### Primary & Secondary Metrics

- **Primary Metric**: **Macro-JD `NDCG@5`** (computed independently per JD, then averaged equally across all evaluable JDs).
- **Secondary Metrics**: `NDCG@3`, `Precision@3`, `Recall@5`, `MRR` (Mean Reciprocal Rank).
- **Relevance & Gain Definitions**:
  - Graded relevance labels $y \in \{0, 1, 2, 3\}$.
  - Exponential gain for `NDCG@K`:
    $$g(y) = 2^y - 1 \quad \Rightarrow \quad g(0)=0,\; g(1)=1,\; g(2)=3,\; g(3)=7$$
  - Discount: $\frac{1}{\log_2(i + 1)}$ for 1-indexed rank position $i \in \{1, \dots, K\}$.
  - Binary relevance threshold (for `Precision@K`, `Recall@K`, `MRR`): $y \ge 2$ (`2`: substantive fit with minor gap, `3`: strong fit). Report sensitivity check at $y = 3$ as a secondary diagnostic.
- **Zero-Relevant-JD & Tie Handling**:
  - **Zero-relevant JDs** (where $\text{IDCG@K} = 0$): excluded from macro `NDCG@K` / `Recall@K` / `MRR` denominator, AND explicitly logged as `zero_relevant_jd_count` so denominator coverage is transparent.
  - **Deterministic Tie-Breaking**: Compare candidates by `(predicted_score DESC, stable_pair_sha256 ASC)` during offline evaluation (and `(predicted_score DESC, application_submitted_at ASC, application_id ASC)` in live service), NEVER by input array order or `candidate_id` ordinal index. Report tie rates explicitly.
  - **Final K Adjustment**: Confirm $K=5$ and $K=3$ match real recruiter screening workflows when actual candidate-pool sizes in Plan D are inspected (prior to test evaluation).

---

## 2. Candidate Model & Baseline Suite (E02)

Every configuration is trained and evaluated under identical JD-grouped cross-validation / splits using `ai2-features-v1`:

| ID | Configuration | Feature Subset | Purpose |
|---|---|---|---|
| **B0** | **AI1-Semantic-Only Baseline** | `ai1_mean_top1_similarity` (raw ranking by frozen M1) | Measures ranking quality using frozen AI1 retrieval without AI2 learning |
| **B1** | **Legacy Weighted Diagnostic** | Legacy `WeightedRanker` (`candidate-job-v2`) | Diagnostic benchmark against legacy heuristic weights (never used if AI1 missing) |
| **B2** | **Business-Only Baseline** | Groups 2–8 (`skills`, `experience`, `projects`, `education`, `certifications`, `work_conditions`, `data_quality`; zero AI1 features) | Measures signal strength of deterministic CV/JD features alone |
| **B3** | **Combined Linear Baseline (Logistic / Ridge)** | All 46 `ai2-features-v1` features (with train-fit missingness imputation + missing indicators) | Simplest learned linear fusion baseline; binary threshold $y \ge 2$ for logistic classification, ranked by raw decision logit/score |
| **C1** | **XGBoost / LightGBM LambdaMART Candidate** | All 46 `ai2-features-v1` features (`lambdarank` / `rank:ndcg` grouped by `job_id`, native `NaN` missingness handling) | Graded listwise/pairwise learning-to-rank candidate capturing feature interactions (e.g., AI1 similarity $\times$ relevant tenure $\times$ unknown-date flag) |

**Parsimony Principle**: Select the **simplest** model supported by evidence. Only promote `C1` (tree LTR) over `B3` (linear) or `B2`/`B0` if it shows statistically grounded improvement on held-out JDs without slice degradation.

---

## 3. Experimental Discipline & Provenance (E03)

- **Fit-on-Train Only**: Any imputation values, feature scalers, or missing-value encoders MUST be fit strictly on the training fold. Never leak validation/test statistics into preprocessing.
- **Multi-Seed Variance**: Run $\ge 5$ fixed random seeds for stochastic models (`C1`), reporting mean and standard deviation across seeds.
- **Experiment Manifest Logging**: Every training run logs:
  - `dataset_version` & split SHA-256 hashes
  - `feature_schema_version = "ai2-features-v1"`, `feature_extractor_version = "ai2-extractor-v1"`
  - `ai1_model_version` & `ai1_weights_sha256`
  - Git commit hash, Python dependency lockfile hash, hyperparameters, compute time, and seed

---

## 4. Ablation, Robustness & Slice Protocol (E04)

Run identical protocol ablations on the development/validation partitions:

1. **AI1 Signal Ablation**: Compare `C1` (or winning combined model) vs. identical model family & tuning with AI1 features removed (`B2-same-family`), isolating the marginal value of frozen AI1 signals without confounding algorithm differences.
2. **AI1 Failure / Noise Stress Tests**:
   - Randomly drop AI1 availability (`UNAVAILABLE`, `ai1_missing_indicator=1.0`, numeric AI1 fields=`None`) for $25\%, 50\%, 100\%$ of pairs to verify graceful explicit status handling (and confirm no unvalidated fallback runs without explicit separate evaluation).
   - Inject synthetic AI1 retrieval misses (mask top-1 hit on 1 required criterion) to verify business features preserve ranking robustness.
3. **Document & Missingness Stress Tests**:
   - Missing `experiences` dates (`isCurrent=None`), missing `educations`, missing `projects`, and parser-truncated descriptions.
4. **Slice Evaluation**:
   - Domain slices: `IT` vs. `Sales` vs. `Marketing`
   - Seniority slices: `Junior/Fresher` vs. `Mid` vs. `Senior`
   - Data origin slices: `PROFILE` vs. `PARSED_CV` (once Plan D real/parsed data is available)

---

## 5. Statistical Confirmatory Criterion & Freeze Rule (E05)

1. **Pre-Test Artifact Freeze**: Freeze the single selected model artifact, preprocessing state, feature schema, and exact hyperparameters (recorded by SHA-256) **before** evaluating on the untouched Plan D `test` partition.
2. **Paired JD-Level Statistical Test**:
   - Compute per-JD score differences $\Delta_j = \text{NDCG@5}_{\text{AI2}}(j) - \text{NDCG@5}_{\text{BestBaseline}}(j)$.
   - Compute two-sided **95% paired JD-level bootstrap confidence interval** (10,000 resamples over JDs) and Wilcoxon signed-rank p-value.
3. **Pre-Declared Confirmatory Pass Criteria** (Practical thresholds must be signed off by user prior to test run):
   - Lower bound of the 95% paired CI for $\Delta_{\text{macro-NDCG@5}}$ against strongest approved baseline (`B0` AI1-only and `B2` business-only) $> 0$ (and meets pre-agreed practical margin $\ge \delta_{\min}$).
   - No domain (`IT`, `Sales`, `Marketing`) or seniority slice violates pre-declared non-inferiority margin (e.g., slice mean drop $\ge -0.02$ NDCG@5).
   - Zero leakage or forbidden feature dependencies confirmed.
4. **Honest Reporting**: If combined AI2 fails to outperform `B0` or `B2`, report negative results transparently, reject promotion, and inspect feature/data causes. **Never claim production readiness from the 160-pair development pilot.**

---

## 6. Training Gate — Approval Required Before Any Model Training

Before executing Plan E training scripts:
1. Plan A source acceptance & Plan B silver adjudication completed on pilot.
2. Plan C extraction verified (`test_ai2_features.py` passing; `plan_c_feature_audit.json` clean).
3. Plan D evaluation-grade dataset & untouched `test` partition approved and frozen.
4. User explicitly approves training execution, compute budget, and practical non-inferiority/improvement thresholds ($\delta_{\min}$).
