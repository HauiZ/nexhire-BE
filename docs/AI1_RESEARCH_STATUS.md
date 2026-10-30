# AI1 research tools — publication status

Audience: developers reproducing the offline experiments.

These scripts and notebooks are research utilities, not a production model release. Runtime defaults are unchanged. Tests demonstrate selected software behavior, not model quality or full experimental validity.

## Included

Dataset preparation, mining, pilot evaluation, continuation-training bundle builder/runner, saved-checkpoint evaluation, their tests, notebook workflows, annotation protocol and historical experiment log.

## External local inputs

Original semantic/raw datasets, synthetic benchmark data, checkpoints, ZIP outputs and model caches are intentionally not committed. Obtain authorized copies separately. Paths in historical documentation may point to local artifacts unavailable in a checkout. Never commit Kaggle tokens, credentials, real CV personal data, or `.env` files.

## Important unresolved limitations

- Kaggle continuation output reports a small validation increase but no test MRR improvement. Validation selection is not proof of generalization.
- Context benchmark labels are synthetic/silver. Only five SQL cases had a separately persisted semantic review; automatically copying author labels for the remaining cases did not complete independent review.
- Context test was inspected repeatedly while trying top-k and score interpolation. Results are exploratory/post-hoc, not an untouched confirmatory test.
- The exploratory status evaluator used target labels in inference and is excluded from this publication, as is its claimed improvement. Do not cite 72.2% accuracy or F1 0.8 as valid results.
- Exploratory context/reranker evaluators and their tests are withheld pending proper semantic review, reproducible model provenance and correction of hard-coded or unsupported reporting claims.
- Saved-checkpoint evaluation tooling requires further review for large archive recovery and strict safetensors fallback behavior before production use; passing fixture tests is not Kaggle end-to-end certification.
- Updated local training runner exports A/B/C predictions, but old uploaded bundles still contain old code. Rebuild a new bundle before expecting changed outputs. Updating a notebook alone does not update its attached dataset runner.
- Preserve selected checkpoint files separately: metrics-only ZIP output does not preserve model weights.

See AI1_EXPERIMENT_LOG.md for historical measurements and its leading corrections, which override older overclaims. No automatic deployment, upload or model replacement is authorized by this repository content.

## Checks at publication

The previously used /tmp/nexhire-torch-env was unavailable. Current standard-library run discovered 97 tests: 93 passed, 3 skipped, 1 error. The error is test_offline_safetensors_only_enforcement: PyTorch is absent, so the runner raises RuntimeError before the test reaches its expected safetensors check. The pytest-based saved-checkpoint suite was not rerun in this environment. This commit is not represented as a fully passing ML validation run.
