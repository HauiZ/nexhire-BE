# AI2 experimental helpers

Not a trained ranker or an enabled application feature. Feature schema remains
unfrozen pending source representability review. Do not train on the legacy
lexical-fallback ranking columns or call silver labels expert gold.

## Bounded verification

From repository root in Git Bash, using the service virtual environment:

```sh
apps/matching-service/.venv/Scripts/python.exe -m pip install pytest==8.3.5
PYTHONPATH=apps/matching-service apps/matching-service/.venv/Scripts/python.exe -B -m pytest apps/matching-service/tests/test_ai2_*.py -q -p no:cacheprovider
```

Current helper fixtures are synthetic; this command does not load an encoder,
read training/held-out rows, start services or access the DB. Last verified on
2026-10-28: 241 tests passed. Dependency installation requires package access.

## Modules

- `metrics.py`: per-JD graded ranking metrics, explicit undefined denominators.
- `snapshot_fields.py`: exact allowlisted normalized fields with snapshot digest.
- `timeline.py`: union of valid calendar-month intervals, not skill-specific tenure.
- `provenance.py`: bind literal extraction spans to a checked snapshot field/record.
- `uncertainty.py`: paired job bootstrap with explicit exclusions, not auto-promotion.
- `linear_explanation.py`: reconstruct a supplied linear model logit from the
  already transformed vector; no fitting, model loading or provenance inference.
- `preprocessing.py`: explicit train-only median/scaling fit with missing indicators;
  no fitted real dataset or trusted artifact loader is provided.
- `app/ranking/conditions.py` and `review_plan.py`: source-bound reviewed condition
  structure and three-valued logic; no automatic evidence/support assessment.
- `app/ranking/source_projection.py`: conservative role/date and credential mention
  projection with unknown attachment preserved.
- `app/ranking/source_extractor.py`: conservative English-first source rules using
  caller-provided tool vocabulary. Literal mention does not establish competence.
- `app/ranking/semantic_features.py`: validate exact AI1 snapshot/model binding and
  summarize whole-requirement Top1 shifted cosine, not support probabilities.

Source fidelity, semantic extraction correctness, numeric model parity and actual
HR/UI behavior are separate gates. Passing these unit tests establishes only the
behaviors covered by their fixtures. No runtime fallback, candidate fit percentage,
automatic rejection/selection, or production approval is provided.

Heavy training is reserved for the user-run Kaggle bundle after feature/data gates.
No upload, trained model, safe artifact loader or UI is included here.
