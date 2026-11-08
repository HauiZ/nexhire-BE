# JD section suggestions — integration boundary

`suggest_sections` in `jd_sections.py` is a deterministic, model-free helper used by the opt-in v2 source/query plan contract. It does not change v1 extraction or invoke an LLM.

## Behavior

- EN/VI aliases match whole normalized lines or the whole prefix before the first colon. NFC, case and whitespace normalization do not rewrite displayed text.
- Heading aliases establish general/required/preferred/duties/review context. General Requirements/Qualifications do not imply core importance.
- Known prefixes followed by a colon split into a preserved heading and content; concatenated words without delimiters are not guessed.
- Visible text, headings and review content remain available in source order. HTML entities are decoded and leading list markers removed. Original raw snapshot must also be retained by callers.
- `review` is a suggestion requiring review, not proof of irrelevance. A misleading Benefits heading can contain genuine requirements.
- Unknown headings remain query text. No semantic classifier, sentence splitter or token-budget guard is included.

## Structured HR job input

`suggest_job_sections(job)` consumes the existing job snapshot fields, rather than concatenating the full posting. Explicit skills remain labels (even a skill named Benefits), requirements are section-classified, description remains available but is selected only if skills/requirements produce no query, and the dedicated benefits field is never automatically selected. Context resets at each field. Source field and original skills item index are retained alongside local suggestion indices.

This proposed fallback differs deliberately from v1 when requirements contain only headings: a heading alone does not suppress description fallback. Tests use job-shaped fixtures, not saved HR database records. The Job entity and RequirementPlanService snapshot confirm these fields exist, but do not establish what actual HR entries contain.

## Compatibility and safety

Suggestion `index` values are local indices, NOT v1 source IDs. Heading/prefix boundary changes must never be mapped by numeric position onto existing requirements/{i} identities. v1 `source_blocks`, `source_requirements`, `draft_plan` and approval/hash validation remain unchanged.

Do not filter existing v1 plans or feed suggestions directly into current AI1 runtime: current response/plan contracts require full source membership and stable IDs.

`jd_plan_v2.py` now provides a separate `jd-source-query-v2` document with immutable v2 source IDs/fields/text/roles, editable selected/components, source-exact queries, complete-document approval binding and a64-query bound. `/internal/jd-plans/v2/draft|validate` expose model-free preparation behind the internal service token; see matching API documentation. They do not persist or establish recruiter ownership themselves.

`matching/query_plan.py` provides an explicit HR-confirmed v2 retrieval function with pre-inference256-token checking, source/component mapping and candidate/model/snapshot provenance. A pinned local M1 synthetic smoke retained7sources and retrieved only3selected queries. Opt-in creation through job-service now stores/edits/confirms v2 using the existing revision/event transaction; trusted matching context and the local AI1 adapter branch by schema, and HR archive projection validates v2 binding. BE default draft creation remains v1; the updated FE explicitly creates v2 drafts and supports source/quote editing. Token preflight returns source/component counts before confirmation, blocks confirmation when over256tokens or unavailable, and still allows saving drafts. No automatic window fallback is enabled. Verification includes disposable PostgreSQL revisions/ownership/concurrency and a real browser -> job-service -> worker -> pinned-M1 -> evidence-view synthetic flow through a loopback identity proxy. This is not real JWT/admin moderation/PDF/provider acceptance. Production model activation remains prohibited by the existing shadow gate.

## Verification

Run `python -B -m unittest discover -s apps/matching-service/tests -p test_jd_sections.py` with service PYTHONPATH/venv. Tests cover common EN/VI headings, prefix splitting, false positives, review preservation, HTML, versions, stability and unchanged v1 extraction. Offline research receipts live in `trainning/docs/upgrades/results/2026-11-05/JD_ALIAS_CANDIDATE.json` (local research, not deployed configuration).
