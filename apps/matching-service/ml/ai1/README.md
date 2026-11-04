# AI1 offline training and evaluation

Canonical implementation lives here; legacy `ml.*` module names remain thin
compatibility aliases to these same module objects. No duplicated loss/training
implementation is maintained.

- `train_semantic.py`: historical pair-training recipes and shared input/evaluation helpers.
- `train_ranking.py`: passage-ranking/retention training, not AI2 candidate ranking.
- `ranking_objective.py`: cosine triplet ranking plus frozen-teacher retention.
- `semantic_evaluation.py`: weak-label pair metrics and train threshold selection.

Use `python -m ml.ai1.train_ranking --help` with matching-service on PYTHONPATH.
Both legacy/new module and direct-file CLI routes are regression-tested without
training. Trainers resolve the same service/repository roots after relocation.
Runtime remains in `app/matching/`; no weights, data, manifest or API changed.

Existing frozen bundles keep their original source copies/hashes. New bundles
must package this directory and any compatibility entry points they invoke.
Local historical builders in `trainning/ai1/prepare.py` and
`prepare_ranking_gpu.py` include the relocated dependencies; they were not run to
create new bundles in this refactor. Their pre-existing `training/` artifact path
convention is not migrated here. Training requires separate authorization/gates.
