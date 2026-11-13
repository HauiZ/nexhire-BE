# AI2 Pilot Silver Annotation Rubric and Golden Fixtures (B01)

## Purpose and Authority

- **Scope**: Frozen annotation specification for `ai2-pilot-v1` (20 JDs × 8 CVs = 160 development pairs).
- **Review Model**: `cx/gpt-6.1-sol` in strictly isolated fresh contexts (`initial` vs `blind_review`).
- **Status**: Produces **silver** labels for pipeline development and early experiments. Unreviewed automatic agreement remains silver, never expert gold.
- **Reference Date**: `2026-11-10` for all current-employment duration calculations (`is_current: true`).

---

## Grading Scale (0–3)

Annotators grade **only demonstrated job-related fit for prioritizing HR review**, never hiring eligibility, predicted job performance, or personality.

| Label | Meaning | Criterion Coverage |
|---|---|---|
| **0** | **Unrelated / No central fit** | No meaningful evidence for central job tasks or required skills; largely unrelated career background. |
| **1** | **Weak / Transferable partial fit** | Some relevant or transferable evidence exists (e.g., adjacent domain, partial tech overlap, or foundational projects), but major shortfalls exist in central required criteria. |
| **2** | **Substantive fit with gap(s)** | Substantive relevant experience/skills across core duties, but one significant gap (e.g., relevant tenure slightly short, missing one required core tool/domain) or multiple partial/uncertain requirements prevent a strong documented fit. |
| **3** | **Strong documented fit** | Clear, verbatim-supported evidence for most important explicit requirements and central tasks, without a clearly documented critical shortfall. Does not mean perfection or guaranteed hire. |

---

## Mandatory Rules & Exclusions

1. **Full Context Read**: Evaluate the complete JD and complete CV (`cv_text` and structured sections), not isolated retrieved snippets.
2. **Required vs. Preferred Separation**:
   - `required` criteria drive core grade boundaries.
   - Missing `preferred` criteria alone must NOT drop a strong `3` candidate to `1` or force a failure; at most they separate strong `3` vs borderline `2`/`3`.
3. **Unknown Evidence ≠ Absence (`HR-SOURCE-005`)**:
   - Missing dates (`start_date: null`, `is_current: null`) or omitted optional facts (e.g. unstated degree when unmentioned, or absent certification) are **unknown**, not proof of zero competence.
   - If missing/ambiguous evidence (such as unstated dates on a key role, or `HR-SOURCE-008` summary-vs-timeline discrepancy) could materially shift the label between adjacent grades (e.g., `1` vs `2` or `2` vs `3`), assign the best provisional label, set `needs_human_review: true`, and state the ambiguity in `missing_information` and `review_reasons`.
4. **Relevant Tenure vs. Total Tenure (`HR-SOURCE-008`)**:
   - Never treat total career duration (including unrelated roles or internships) as relevant tenure for a specialized role.
   - Never double-count overlapping employment intervals.
   - When summary tenure conflicts with dated role chronology, rely on explicit dated role tasks/intervals and flag `needs_human_review: true` if material to the threshold.
5. **No Bias / Protected Proxies (`HR-SOURCE-001`, `HR-SOURCE-002`)**:
   - Strictly ignore university prestige/reputation, regional accent/voice norms, age proxies (`mới tốt nghiệp`, `trẻ tuổi`), gender, marital status, or candidate index/ID (`C01`..`C08`).
6. **Zero AI1 / Feature Leakage**:
   - Never reference AI1 cosine similarity scores, semantic thresholds, or weighted feature formulas in labels or rationales.
7. **Verbatim Citations**:
   - Every `evidence[*].quote` must be a non-empty exact substring of `sections[section_id].text`.
   - Every `required` JD requirement must be addressed either in `evidence` (with verbatim quote) or explicitly in `missing_information` (with no fabricated quote).

---

## Approved Golden Reference Examples (No AI1 Leakage)

### Example 1 — Grade 3 (`IT-J01` Backend Node.js/NestJS, Mid, `min 3 years`)
- **Profile Pattern**: 3.5+ years verified Backend Node.js/TypeScript/NestJS/PostgreSQL/Redis/RabbitMQ/Docker across dated roles + matching microservices project + CS bachelor degree.
- **Label**: `3`, `needs_human_review: false` (unless summary-vs-timeline discrepancy shifts 3-year threshold; e.g., if chronology is >3 years and summary says 3y6m, both exceed 3y so threshold is unaffected — note discrepancy without inflating/downgrading).

### Example 2 — Grade 2 (`IT-J01` Backend Node.js/NestJS, Mid, `min 3 years`)
- **Profile Pattern**: Strong dated Java/Spring Boot backend (4 years) + PostgreSQL + Docker + 1.5 years transitioning into Node.js/TypeScript/NestJS, missing RabbitMQ/Kafka.
- **Label**: `2`, `needs_human_review: false` (substantive backend engineering & NestJS/PostgreSQL evidence, but Node.js/NestJS tenure is below 3 years).

### Example 3 — Grade 1 (`SA-J01` B2B SaaS Sales, Mid, `min 2 years B2B SaaS`)
- **Profile Pattern**: 2 years B2C retail/telemarketing sales in physical electronics; uses Excel/Zalo; zero B2B SaaS demo/negotiation or Salesforce/HubSpot CRM evidence.
- **Label**: `1`, `needs_human_review: false` (transferable sales communication, major shortfalls on B2B SaaS cycle and CRM tools).

### Example 4 — Provisional Grade with Mandatory Flag (`HR-SOURCE-005` Unknown Dates)
- **Profile Pattern**: Freelance developer listing core Flutter + Dart + REST API project matching `IT-J04` (`min 1-2 years`), but role has `start_date: null`, `end_date: null`, `is_current: null`.
- **Label**: `1` or `2` (provisional), `needs_human_review: true`, `missing_information: ["Không nêu thời gian bắt đầu/kết thúc và trạng thái hiện tại ở vai trò Freelance, không xác định được có đạt tối thiểu 1 năm kinh nghiệm Flutter hay không."]`, `review_reasons: ["Unstated duration on central relevant role (HR-SOURCE-005)"]`.

### Example 5 — Grade 0 (`SA-J03` Medical Device B2B Sales, Senior, `min 5 years + Medical/Pharmacy/Biomed/BA degree`)
- **Profile Pattern**: Junior software QA tester or unrelated consumer FMCG merchandiser with zero medical device/hospital B2B sales and unrelated coursework.
- **Label**: `0`, `needs_human_review: false`.
