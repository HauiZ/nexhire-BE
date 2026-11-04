# AI2 experimental helpers

These modules are experimental research helpers, not production ranking approval.
The working tree also has a separate opt-in stored-result demo under `app/ranking`
(`MATCHING_AI2_DEMO_ENABLED`, default false), with artifact provenance checks and
content-quality withholding. See `api-docs/matching-service.md` from repository
root for that API contract. Do not train on legacy lexical-fallback ranking columns
or call silver labels expert gold.

## AI1 / FE integration boundary (2026-11-04)

Optional AI1 `relevantSpan` is reading assistance bound to the original evidence
text, not a feature, label or support verdict. It must not change the five observed
features, model/artifact pins, retrieval scores or ranking gate. Full source text
remains authoritative. The FE must preserve unavailable/withheld states and must
not convert cosine, a highlighted sentence or raw ranker output into percent fit.

Lexical penalties and future hybrid scores cannot silently replace the shifted
cosine expected by the current artifact. Such a change needs its own policy/version,
shared-protocol evaluation, feature compatibility review and, if justified, a new
trained/calibrated artifact. No AI2 retraining or promotion is part of this additive
span integration. Future support-aware features require valid online extraction,
OOF predictions for stacking, reviewed whole-JD targets and demonstrated incremental
value; gold annotations/rationales must never become inference features.

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
No upload or production activation is provided by these helpers. The separate demo
implementation and its FE panel do not establish production model quality.
