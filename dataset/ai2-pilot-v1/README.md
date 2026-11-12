# AI2 pilot v1 — work-in-progress transfer snapshot

## Status

Synthetic development-only source corpus: 20 Vietnamese JD, 8 CV per JD, 160 pairs (IT 10 JD, Sales 5, Marketing 5). **Not accepted for annotation or training. No relevance labels, initial annotation or blind relevance review have been completed.** No AI1/old AI2 modifications or training/deployment are part of this snapshot.

This branch preserves unfinished work for transfer to another machine, not a completed dataset release.

## Files to keep

- `sources/it.json`, `sources/sales-marketing.json`: current, partially repaired source corpus.
- `PROTOCOL.md`: approved scope/source/rubric contract, including approved nullable `is_current` amendment.
- `IDEA_REFERENCE.md`: transfer copy of the original idea document previously located outside backend repository. On new machine use this copy when the parent-path reference in agent definitions is unavailable.
- `human-review-decisions.json`: 11 human-approved source-repair rules. Entries still say `approved_pending_application`; application is only partial. Do not treat all rules as applied.
- `human-repair-log-v1.json`: 292 logged changes in first bounded repair pass, current source hashes and pending work.
- `snapshots/before-human-repairs-v1/`: immutable source copies before that pass.
- `audits/`: per-JD source audit findings against pre-human-repair sources. These are model findings, not expert gold, not relevance labels and **not current acceptance evidence** after source changes.
- `source-human-review-queue.json`: pre-repair consolidated findings (86 blocking entries, 108 other review entries); entries can overlap candidates. Reconcile against current sources before presenting as unresolved defects.
- `source-validation.json`: latest mechanical/lexical checks. Most recently: 20 JD, 160 pairs, zero mechanical errors and 762 lexical warnings. Lexical mismatch alone is not a semantic defect; zero mechanical errors is not source acceptance.
- `source-duplicate-report.json`: pre-human-repair lexical duplicate analysis; rerun after repairs. No exact duplicates or pairs above 0.5 five-token Jaccard were found in that version. This does not exclude semantic/template similarity.
- `it-source-audit.json`: earlier incomplete IT audit, retained as historical provenance; per-JD IT audits supersede its coverage only.
- `*-repair-notes.md`: generator repair claims before human review, not independently verified acceptance.
- `validate_sources.py`: offline validator; run `python3 -I dataset/ai2-pilot-v1/validate_sources.py` from backend root.
- `apply_approved_repairs.py`: already-run first-pass script. Refuses repeat application when snapshot/log exists; do not remove that guard to rerun against repaired sources.
- Backend `.claude/agents/ai2-dataset-generator.md` and `ai2-dataset-reviewer.md`: named agent definitions.

Disposable `.test.json`, the derived `audit-inputs/` copies and `source-inspection.jsonl` are intentionally excluded from transfer commit. They are not authoritative sources. Generate new per-JD inspection views from current sources if needed; do not reuse old copies.

## Resume work

1. Read protocol, human decisions and repair log. Preserve current sources and snapshots; do not rerun first-pass repair script.
2. Finish human-approved repairs: remove unsupported role/project skill attribution while retaining supported general skills; preserve source scope/quantifiers; consistently fictionalize employer/customer/partner names and save mapping; handle remaining mixed negative prose and unnecessary age descriptors. Do not invent supporting prose.
3. Preserve and flag ambiguous degree/tenure information. Escalate new or genuinely different cases; apply approved rules to equivalent cases without repeated approval.
4. Reconcile all audit findings against repaired sources, record dispositions, rerun mechanical/duplicate/source-support checks and refresh source hashes. Current audits/queue/duplicate report are historical until reconciled.
5. Only after source acceptance, label and blind-review with separate fresh contexts supplied only protocol and current sources. Current coordinator session has generator/audit exposure and cannot serve as blind relevance review. Preserve both silver outputs; validate exact evidence quotes/references, queue disagreements/flagged cases and sample agreements for human review.
6. No training, deployment, old AI1/AI2 edits or generalization claim. Candidate IDs/order must not become features or labeling shortcuts. Recurring candidate-index scenarios remain a human-accepted development-pilot limitation.

## Model routing and reference date

Generation and generator repairs requested `ag/gemini-3.8-flash-high`; reviewer requested `cx/gpt-6.1-sol`. Verify alias mapping on new machine **before dispatch**: `haiku` must map to requested Gemini model, `sonnet` to requested Sol model. Do not silently substitute or change main model. Global routing/settings are not included in repository. Backend named agents may need a new session to load. Maximum two agents concurrently, no worktree needed for separate files, no automatic Superpowers.

Several Sol CLI calls failed with `Stream idle timeout - no chunks received`. IT and SA-J01 source audits completed in fresh reviewer contexts; remaining nine commercial source audits completed directly in coordinator Sol session after explicit user permission. They are disclosed as nonblind source inspection, never blind relevance review. Requested/reported model identity is not independent server-side verification.

All employment/date interpretation uses protocol reference date **2026-11-10**, not the date work resumes.

## Limitations

Fictional sources, model-generated silver judgments only; no real applicant data or expert-gold labels. No independent employer/achievement verification. Synthetic names can collide with real entities. Source authoring is not a production parser. Near-duplicate/template effects, offline/online extraction consistency, AI1 contamination checks and untouched test construction remain unproven or separately scoped. Human-approved repairs do not establish hiring competence or legal compliance.
