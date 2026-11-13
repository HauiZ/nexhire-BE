# AI2 pilot v1 — Accepted Source Corpus & Development Workspace

## Status

Synthetic development-only source corpus: **20 Vietnamese JDs, 8 CVs per JD, 160 pairs** (IT 10 JDs, Sales 5 JDs, Marketing 5 JDs).

- **Plan A (Source Acceptance — A01–A08)**: **Ready for Gate A sign-off** (`20/20` JDs accepted, `160/160` pairs verified, `0` blocking issues, `0` mechanical errors, `0` exact/near-duplicates `>= 0.5`). See [source-acceptance-manifest-v3.json](source-acceptance-manifest-v3.json) and [audits-v3/](audits-v3/).
- **Plan B (Silver Annotation)**: Rubric, validation scripts, and agreement analyzer ready ([ANNOTATION_RUBRIC_B01.md](ANNOTATION_RUBRIC_B01.md), [validate_labels.py](validate_labels.py), [analyze_label_agreement.py](analyze_label_agreement.py)). Initial & blind labeling (`B02–B03`) await Gate A sign-off and `cx/gpt-6.1-sol` quota reset in separate fresh contexts. **Zero relevance labels exist yet.**
- **Plan C (Feature Contract `ai2-features-v1`)**: Implemented and audited ([PLAN_C_CONTRACT.md](PLAN_C_CONTRACT.md), `apps/matching-service/app/schemas/ai2.py`, `apps/matching-service/app/matching/ai2_features.py`, [plan_c_feature_audit.json](plan_c_feature_audit.json)).
- **Plans D–G (Expansion, Experiments, Runtime Integration, Staging/Canary)**: Design & pre-registration specs ready ([PLAN_D_DATA_EXPANSION_PROPOSAL.md](PLAN_D_DATA_EXPANSION_PROPOSAL.md), [PLAN_E_EXPERIMENT_PROTOCOL.md](PLAN_E_EXPERIMENT_PROTOCOL.md), [PLAN_F_G_PRODUCTION_DESIGN.md](PLAN_F_G_PRODUCTION_DESIGN.md)). Legacy AI1 and old AI2 remain untouched; zero model training or live production changes executed.

## Frozen Source Hashes (Reference Date `2026-11-10`)

- `sources/it.json` SHA-256: `f56ac2552a106b0091f0cbfb775a46de6e33d1393344ca5920ba16a15ee62f22`
- `sources/sales-marketing.json` SHA-256: `b196a9bc9aad9e0ed91ed04073280ba5e1b108f493838e75be5cd3e322f71f94`
- [source-acceptance-manifest-v3.json](source-acceptance-manifest-v3.json): authoritative acceptance ledger (`131` fixed, `65` retained ambiguities, `25` accepted limitations across `20/20` JDs).

## Source Changelog & Provenance

1. `human-repair-log-v1.json` + `apply_approved_repairs.py`: initial bounded human-approved repair pass (`snapshots/before-human-repairs-v1/`).
2. `it-role-repair-log-v2.json` + `repair_it_role_attribution.py` + `it-final-repair-log.json`: corrected IT role boundaries and verified IT descriptions/organizations (`flash-it-repair-verification.json`).
3. `exhaustive-repair-log-v3.json` + `apply_exhaustive_repairs.py` + `organization-mapping-v3.json`: fictionalized real employer/hospital/media entities (`HR-SOURCE-007`), restored qualifiers (`HR-SOURCE-004`), removed JD-shaped negative prose (`HR-SOURCE-006`).
4. `commercial-repair-log-v4.json` + `apply_commercial_repairs_v4.py` (`snapshots/before-commercial-repairs-v4.json`): fixed all 49 commercial residual issues from `wtys44xgs` audit (synchronized 11 `experiences[*].description`, removed `MK-J05-C04` negative prose, harmonized 2 top-level skills and 37 `skills_used` items).
5. `commercial-repair-log-v5.json` + `apply_commercial_repairs_v5.py` (`snapshots/before-commercial-repairs-v5.json`): fixed final 3 `SA-J03` cross-section `skills_used` attributions flagged by `wlj22smze`, verified clean by independent primary + adversarial skeptic workflow (`wxftmuxcr`).

## Key Files

- [sources/it.json](sources/it.json), [sources/sales-marketing.json](sources/sales-marketing.json): accepted development pilot source corpus.
- [PROTOCOL.md](PROTOCOL.md): approved scope, source schema, nullable `is_current` amendment, and annotation protocol.
- [IDEA_REFERENCE.md](IDEA_REFERENCE.md): backend copy of original AI2 evidence-assisted ranking specification.
- [human-review-decisions.json](human-review-decisions.json): immutable 11 human-approved source-repair rules (`HR-SOURCE-001`..`011`).
- [source-acceptance-manifest-v3.json](source-acceptance-manifest-v3.json) and [audits-v3/](audits-v3/): **current** post-repair acceptance evidence across all 20 JDs (10 IT via `wtys44xgs`, 9 commercial via `wlj22smze`, `SA-J03` dual-verified via `wxftmuxcr`).
- [audits/](audits/), [source-human-review-queue.json](source-human-review-queue.json), [it-source-audit.json](it-source-audit.json), `*-repair-notes.md`: **historical pre-repair artifacts** retained for audit provenance only (superseded by `audits-v3/`).
- [validate_sources.py](validate_sources.py) and [test_pilot_validation.py](test_pilot_validation.py): mechanical/lexical validator (`0` errors, `637` lexical warnings requiring semantic reading — all manually verified in `audits-v3/`), verbatim description-grounding checks, anti-brand checks, and 6 regression tests.
- [source-validation.json](source-validation.json) and [source-duplicate-report.json](source-duplicate-report.json): refreshed validation and 5-token Jaccard duplicate reports (`0` exact, `0` near-duplicates `>= 0.5`).

## Verification & Model Routing

- Generator/repairs/source verification: `ag/gemini-3.8-flash-high` (`max 2 concurrent` subagents).
- Silver labeling & blind review (`B02–B03`): strictly `cx/gpt-6.1-sol` in separate fresh contexts after Gate A sign-off and GPT session reset. Never expose repair/audit history or AI1 scores during blind review.
- Reference date for all employment/tenure reasoning: **`2026-11-10`**.
- Legacy runtime (`apps/matching-service/app/matching/service.py`) stays `evidence-only-v1`; `apps/matching-service` offline tests require missing wheels (`aio-pika`, `sentence-transformers`) for full suite (`npm run matching:test`), while isolated Plan B/C/E unit suites run cleanly via `/tmp/ai2-dev-venv`.

## Limitations

Synthetic development corpus only; no real applicant data or expert-gold relevance labels. Candidate IDs (`C01..C08`), ordering, and shared 6-section/2-employer templates (`HR-SOURCE-009`) must never be used as model features. Preserved tenure-summary ambiguities (`HR-SOURCE-008`), null dates/`is_current=null` (`HR-SOURCE-005`), verbatim `'Cử nhân Cao đẳng'` wording (`HR-SOURCE-010`), and retained self-descriptions (`HR-SOURCE-011`) must follow rubric rules without guessing or bias.
