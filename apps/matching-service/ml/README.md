# Matching model preparation

Current update (2026-10-23): both AI1 ranking-objective arms have completed Kaggle
training, local replay and isolated HTTP regression. They are not AI2 rankers and
are not production-approved. Experimental runtime modules now live separately in
`app/experimental/`; this `ml/` directory retains the original preparation/train APIs.
See the [service map](../README.md) and [AI1 guide](../../../training/ai1/README.md).
The v1/v2/v3 and preparation/smoke descriptions below are historical milestones,
not a statement that those are the current deployment candidates.

The service currently runs a pretrained embedding (or lexical fallback) and a
weighted ranking baseline. The repository has a synthetic assistant-reviewed weak
release at `dataset/current/`, but no independently labeled production gold or
deployed fine-tuned model. Offline weak-label agreement is not measured real-world quality.

The implemented v2 contract and migration notes live in
[api-docs/matching-data-contract.md](../../../api-docs/matching-data-contract.md).
Use that document when preparing new datasets; v1 feature/artifact records must be rebuilt.

## AI1 Fine-Tuning

The entry point is `ml/train_semantic.py`. See
[training/ai1/README.md](../../../training/ai1/README.md) for the directory map,
smoke/full presets, private Kaggle upload bundle and notebook. Two-step CPU smoke
and full GPU training have passed for v3, but its comparison guard failed. Checkpoints/candidate exports are
isolated from source data, the pretrained model and runtime settings. The trainer
does not score test or rebuild AI2 features. `semantic_evaluation.py` shares the
baseline's weak-label metrics and train-only threshold calibration.

## Current Offline Evaluation

Current inputs are `dataset/current/semantic.jsonl` and `dataset/current/ranking.jsonl`.
All 500 JDs / 2,000 source CVs have assistant review; uncertain exports are withheld.
Current model-selection results are under
`dataset/evaluation/continuous500-assistant-a95700a36f80/`. Earlier blinded-review
packets and metrics belong to the parent release, not the current benchmark.
Run from the repository root:

- `python dataset/prepare_evaluation.py`: separate blinded test-review preparation,
  not required to repeat the completed whole-corpus assistant review. The original
  313-pair packet is historical; reconstruct counts for a new release.
- `python dataset/evaluate_semantic_baseline.py`: existing lexical weak baseline.
- With the service Python virtual environment, use the same evaluator with
  `--model-path <local-snapshot>` for an offline SentenceTransformer baseline.
  The evaluator needs service ML dependencies, not pandas or provider SDKs.
- `--report-name <identifier>` separates model reports without overwriting an
  existing different result. `--max-seq-length 256` is an explicit local-model
  experiment, requires a named report and checks model positional capacity.
  It does not edit model files or runtime configuration. Reports record context
  length, truncation counts, weight/tokenizer hashes and dataset binding.

Thresholds are calibrated on weak train labels only; validation is used for metrics
and test is not scored. EN/VI variants have weight 0.5. The cached English MiniLM
showed poor VI-EN recall and substantial EN hard-negative false positives; do not
choose it for bilingual fine-tuning from aggregate weak F1 alone. See
`dataset/evaluation/README.md`. No model has been trained or promoted to gold.

## Historical Pilot Export

The following pilot paths are archived, not current dataset/training entry points.

From the repository root, `python dataset/build_pilot_training_inputs.py` verifies
and exports the reviewed pilot to
`dataset/runs/validation12/label_review_v1/assistant_review_v1/runtime_inputs_v1/`.
Both existing v2 validators pass: 474 semantic rows and 40 ranking rows, frozen
snapshots, eight actual runtime features, and a shared component split. Provenance
remains synthetic assistant-reviewed weak labels, not independent human gold.

This is an offline pipeline check, not a production training release. Semantic
features use lexical fallback; rebuild ranking features with the selected encoder
before training its ranker. Certification/location features are constant in this
pilot, and ranking test lacks IT/Finance after ambiguous-JD holds. Inspect
`export_manifest.json` and `adapter_qa.json`; production training remains blocked.
No model downloads, training, or paid API calls are performed by the exporter.
The consolidated status is in [the dataset standard](../../../dataset/DATASET_STANDARD.md).

## Runtime boundaries

- `SemanticScorer` handles text similarity, including requirement/evidence pairs.
  `MATCHING_EMBEDDING_MODEL` already accepts a SentenceTransformer directory, so a
  fine-tuned export can replace the pretrained model without changing API callers.
- `RankingFeatures` fixes eight features and their order in `candidate-job-v2`.
  Values are 0..100; artifact inference divides them by 100. Train with precisely
  this scaling. Certification currently remains zero; education remains a generic
  heuristic, not a JD-specific education match. Improve these extractors and bump
  the schema version before relying on them as meaningful learned features.
- `Ranker` separates model inference from feature extraction and explanation.
  The default `WeightedRanker` preserves current weights. `LogisticRanker` reads
  JSON rather than deserializing executable pickle files. A future XGBoost/LTR
  adapter must implement the same interface and record its version.
- Every successful result stores `rankingFeatures`, `featureSchemaVersion`,
  `semanticModelVersion`, `rankingModelVersion`, and `requirementMatches` in the
  existing explanation JSONB. No migration is required. The matching result API
  stores a hashed combined version when needed to fit the existing 80-character
  `model_version` column; the explanation keeps the full individual versions.
  The internal result API also returns frozen input snapshots; completion events
  omit full snapshots. Application detail APIs expose evidence/features/metadata;
  frontend rendering remains to be implemented.
- Requirement evidence scores are the existing matcher scores, including source
  weighting and lexical rules. They are not calibrated semantic probabilities.
- Ranking artifact errors fail explicitly; an incompatible semantic model version
  cannot silently use a trained ranker with lexical fallback. Existing weighted
  baseline operation still allows semantic fallback.

## Dataset contracts

Use JSONL, one record per line. `ml.datasets.SemanticRecord` and `RankingRecord`
are the source of truth. Keep raw data under `ml/data/` and exports under
`ml/artifacts/`; both directories are ignored by Git. Use pseudonymous IDs and
review CV text before exporting it outside the service.

Both datasets require `record_id`, `dataset_version`, `split` (train/validation/test),
`job_id`, `candidate_id`, `label_source` (recruiter/expert/rubric), and `annotator_id`,
plus v2 dataset/preprocessing versions, candidate/job snapshot hashes and data origin.
Semantic records add requirement/evidence IDs and text, evidence source, binary
label, and negative type (random/hard for negatives, null for positives).
Ranking records add `feature_schema_version`, `feature_extractor_version`,
`score_reference_date`, `semantic_model_version`, the exact
runtime `features` object, and relevance 0..3. Suggested rubric: 0 unsuitable,
1 partial fit, 2 suitable, 3 strong fit. Record judgments independently of displayed
model scores; application status or the current model's recommendation is not
automatically ground truth.

Split by job and candidate before generating pairs or mining hard negatives.
The default split policy holds out both jobs and candidates. `--split-policy job`
explicitly permits shared candidates for unseen-job evaluation. Identical complete
requirement/evidence text pairs cannot cross semantic partitions, but shared skill
phrases alone are allowed. `--allow-incomplete` permits missing partitions during
preparation only. Each existing partition must contain both
positive and negative semantic examples; each ranking job must contain multiple
candidates with differing relevance. Mine negatives only from the training pool.

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = 'apps/matching-service'
& apps/matching-service/.venv/Scripts/python.exe -m ml.datasets semantic apps/matching-service/ml/data/semantic.jsonl
& apps/matching-service/.venv/Scripts/python.exe -m ml.datasets ranking apps/matching-service/ml/data/ranking.jsonl
```

## Logistic artifact contract

The following illustrates the format only, not a trained model:

```json
{
  "algorithm": "logistic_regression",
  "model_version": "ranking-logistic-example",
  "feature_schema_version": "candidate-job-v2",
  "preprocessing_version": "matching-text-v2",
  "feature_extractor_version": "heuristic-features-v2",
  "feature_names": ["semantic_score", "skill_score", "experience_score", "education_score", "project_score", "certification_score", "location_score", "level_score"],
  "coefficients": [0, 0, 0, 0, 0, 0, 0, 0],
  "intercept": 0,
  "dataset_version": "example-only",
  "semantic_model_version": "sentence-transformers:MODEL_DIRECTORY"
}
```

Train the binary logistic baseline with a documented threshold, for example
relevance >= 2. Export the positive-class coefficients/intercept, exact feature
order and model provenance. Set `MATCHING_RANKING_ARTIFACT_PATH` to the exported
JSON file and `MATCHING_EMBEDDING_MODEL` to the matching semantic model directory.
Use stable absolute paths in deployment. Restart the service after changing them.
The ranker output is a ranking signal; calibration and decision thresholds require
validation. Existing recommendation labels remain advisory and do not update
application statuses automatically.

## Remaining implementation sequence

1. Add structured JD requirements; define meaningful
   certification and education signals against those requirements.
2. Build labeled semantic pairs and job-grouped candidate relevance data; add a
   recruiter feedback API and an export joining human labels to feature snapshots.
3. Implement reproducible training and evaluation scripts with separate ML
   dependencies. Compare keyword/BM25, pretrained embedding and fine-tuned embedding
   using Recall@K/MRR/NDCG and document hard-negative mining.
4. Train logistic regression, then XGBoost/LTR using features from the selected
   semantic model; evaluate Precision@K/Recall@K/MRR/NDCG per job, never as one
   global candidate list. Keep test data untouched until final comparison.
5. Add artifact manifests, experiment reports, calibration and deployment checks;
   then render evidence and add recruiter feedback in the frontend.
6. Add candidate Top-K job recommendations and an end-to-end demo after validating
   the models. Training, feedback collection and recommendation APIs remain pending.

Run `npm run matching:test` for runtime and dataset contract regression tests.
