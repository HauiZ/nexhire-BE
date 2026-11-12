# IT Source Document Repair Notes (ai2-pilot-v1)

Date: 2026-11-10
Scope: `dataset/ai2-pilot-v1/sources/it.json`
Artifact: 10 jobs (IT-J01 to IT-J10), 80 candidates (IT-J01-C01 to IT-J10-C08)

---

## 1. JD Importance & Heading Structure Repair

### Issue Identified
In the initial version of `it.json`, all jobs lumped requirements under a generic `Yêu cầu công việc:` heading without distinguishing required from preferred criteria in the prose, despite structured requirements specifying `"importance": "required"` vs `"importance": "preferred"`.

### Repair Action
Inspected all 10 IT jobs. Explicitly divided the requirements in `jd_text` into:
- `Yêu cầu bắt buộc:` (for all `required` requirements)
- `Yêu cầu ưu tiên:` (for all `preferred` requirements)

All requirement text strings were preserved 100% verbatim to satisfy PROTOCOL.md substring matching constraints:
- **IT-J01**: R01-R03 (required), R04-R06 (preferred)
- **IT-J02**: R01-R03, R06 (required), R04-R05 (preferred)
- **IT-J03**: R01-R04 (required), R05-R06 (preferred)
- **IT-J04**: R01-R03 (required), R04-R06 (preferred)
- **IT-J05**: R01-R04 (required), R05-R06 (preferred)
- **IT-J06**: R01-R04 (required), R05-R06 (preferred)
- **IT-J07**: R01-R04 (required), R05-R06 (preferred)
- **IT-J08**: R01-R03 (required), R04-R06 (preferred)
- **IT-J09**: R01-R04 (required), R05-R06 (preferred)
- **IT-J10**: R01-R04 (required), R05-R06 (preferred)

---

## 2. Lexical Support Warnings: Aliases vs. Unsupported Facts

All 45 lexical support warnings reported in `source-validation.json` for IT candidates were inspected. In accordance with guidelines:
- **No CV prose was altered or fabricated** (preserving authentic synthetic evidence).
- **Genuinely unsupported structured claims were removed** from `skills_used` or `technologies_or_methods`.
- **Lexical aliases** (brand/framework variations where the exact concept existed in the prose under an alternate form) were harmonized to the exact lexical token appearing in the cited section prose.

### A. Harmonized Aliases (Exact prose matching restored)
1. **IT-J01-C01** (S03 / E02): Prose mentions `"Express"`; changed structured skill `"Express.js"` -> `"Express"`.
2. **IT-J02-C04** (S04 / P01): Prose mentions `".NET"`; changed structured tech `"ASP.NET Core"` -> `".NET"`.
3. **IT-J03-C02** (S04 / P01): Prose mentions `"Airflow"`; changed structured tech `"Apache Airflow"` -> `"Airflow"`.
4. **IT-J03-C04** (S04 / P01): Prose mentions `"Spark Streaming"`; changed structured tech `"Apache Spark"` -> `"Spark Streaming"`.
5. **IT-J03-C07** (S03 / E01, E02): Prose mentions `"Spark"`; changed structured skill `"Apache Spark"` -> `"Spark"` in both experiences.
6. **IT-J03-C07** (S04 / P01): Prose mentions `"Spark"` and `"Airflow"`; changed structured techs `"Apache Spark"` -> `"Spark"`, `"Apache Airflow"` -> `"Airflow"`.
7. **IT-J05-C01** (S04 / P01): Prose mentions `"EKS"`; changed structured tech `"Kubernetes"` -> `"EKS"`.
8. **IT-J07-C01** (S04 / P01): Prose mentions `"Kafka"`; changed structured tech `"Apache Kafka"` -> `"Kafka"`.
9. **IT-J07-C08** (S03 / E01): Prose mentions `"Kafka"`; changed structured skill `"Apache Kafka"` -> `"Kafka"`.
10. **IT-J08-C02** (S03 / E02): Prose mentions `"Express"`; changed structured skill `"Express.js"` -> `"Express"`.
11. **IT-J08-C06** (S04 / P01): Prose mentions `"Go"`; changed structured tech `"Golang"` -> `"Go"`.
12. **IT-J09-C01** (S04 / P01): Prose mentions `"SQL Server"`; changed structured tech `"Microsoft SQL Server"` -> `"SQL Server"`.
13. **IT-J09-C03** (S03 / E02): Prose mentions `"HTML/CSS"`; changed structured skills `"HTML5"` -> `"HTML"` and `"CSS3"` -> `"CSS"`.
14. **IT-J09-C04** (S03 / E02): Prose mentions `"SQL Server"`; changed structured skill `"Microsoft SQL Server"` -> `"SQL Server"`.
15. **IT-J09-C05** (S04 / P01): Prose mentions `"SQL Server"`; changed structured tech `"Microsoft SQL Server"` -> `"SQL Server"`.
16. **IT-J09-C08** (S04 / P01): Prose mentions `"React"`; changed structured tech `"React.js"` -> `"React"`.

### B. Removed Genuinely Unsupported Structured Claims
1. **IT-J01-C03** (S03 / E01): Removed `"TypeScript"` (not mentioned in S03).
2. **IT-J02-C01** (S03 / E01): Removed `"TypeScript"` (not mentioned in S03).
3. **IT-J02-C01** (S04 / P01): Removed `"React.js"` and `"TypeScript"` (neither mentioned in S04).
4. **IT-J02-C04** (S03 / E01): Removed `"TypeScript"` (not mentioned in S03).
5. **IT-J02-C07** (S03 / E01): Removed `"Storybook"` (not mentioned in S03).
6. **IT-J03-C08** (S04 / P01): Removed `"Linux"` (not mentioned in S04).
7. **IT-J04-C01** (S04 / P01): Removed `"Dart"` (not mentioned in S04).
8. **IT-J04-C02** (S03 / E01): Removed `"Dart"` (not mentioned in S03).
9. **IT-J04-C03** (S03 / E01, E02): Removed `"Android SDK"` from E01; removed `"Java"` and `"Android SDK"` from E02, retaining `"Android Native"` which is explicitly supported in S03 text.
10. **IT-J04-C04** (S03 / E01): Removed `"Dart"` (not mentioned in S03).
11. **IT-J04-C05** (S03 / E01, E02): Removed `"TypeScript"` from E01 and `"JavaScript"` from E02 (neither mentioned in S03).
12. **IT-J04-C07** (S04 / P01): Removed `"Dart"` (not mentioned in S04).
13. **IT-J04-C08** (S03 / E02; S04 / P01): Removed `"Adobe XD"` from E02; removed `"Dart"` from P01.
14. **IT-J05-C03** (S04 / P01): Removed `"Docker"` (not mentioned in S04).
15. **IT-J05-C04** (S04 / P01): Removed `"Linux"` (not mentioned in S04).
16. **IT-J05-C05** (S04 / P01): Removed `"Java"` (not mentioned in S04).
17. **IT-J05-C06** (S04 / P01): Removed `"AWS"` (not mentioned in S04).
18. **IT-J06-C04** (S04 / P01): Removed `"Python"` (not mentioned in S04).
19. **IT-J06-C05** (S03 / E02; S04 / P01): Removed `"Jira"` from E02; removed `"JavaScript"` from P01.
20. **IT-J06-C06** (S03 / E01): Removed `"TypeScript"` from E01 (not mentioned in S03).
21. **IT-J07-C01** (S04 / P01): Removed `"Java"` (not mentioned in S04).
22. **IT-J07-C02** (S03 / E01; S04 / P01): Removed `"Spring Data JPA"` from E01; removed `"Java"` from P01.
23. **IT-J07-C03** (S04 / P01): Removed `"Java"` (not mentioned in S04).
24. **IT-J07-C06** (S03 / E01; S04 / P01): Removed `"Kubernetes"` from E01; removed `"Java"` from P01.
25. **IT-J09-C01** (S03 / E01; S04 / P01): Removed `"C#"` from E01 and P01 (not mentioned in S03/S04).
26. **IT-J09-C02** (S04 / P01): Removed `"C#"` (not mentioned in S04).
27. **IT-J09-C05** (S03 / E01): Removed `"C#"` (not mentioned in S03).
28. **IT-J09-C06** (S03 / E01): Removed `"C#"` (not mentioned in S03).
29. **IT-J09-C08** (S03 / E01): Removed `"Postman"` (not mentioned in S03).
30. **IT-J10-C01** (S03 / E01, E02): Removed `"Python"` from E01 and E02 (not mentioned in S03).
31. **IT-J10-C02** (S03 / E01, E02; S04 / P01): Removed `"Python"` from E01 and E02; removed `"OpenCV"` from P01.
32. **IT-J10-C03** (S03 / E02): Removed `"Pandas"` (not mentioned in S03).
33. **IT-J10-C04** (S03 / E02): Removed `"Python"` (not mentioned in S03).
34. **IT-J10-C05** (S03 / E01, E02): Removed `"Python"` from E01 and E02.
35. **IT-J10-C08** (S04 / P01): Removed `"Docker"` (not mentioned in S04).

---

## 3. Length & Corpus Integrity Audit

- **Whitespace-token count check**:
  - `IT-J04-C07`: 196 words
  - `IT-J06-C05`: 191 words
  - `IT-J10-C07`: 199 words
  All three profiles are within 1-9 words of the preferred 200-450 word target. In accordance with the instruction not to invent text or compromise realism, prose was retained intact without padding.
- **Candidate ranking**: Verified no artificial ordering by candidate index. Variations in candidate fit, tenure, seniority, and missing information are distributed realistically across indices.
- **Company & person authenticity**: All companies and institutions remain synthetic/fictional entities.
- **Dates**: Reference date 2026-11-10 respected; valid `YYYY-MM` or `null` format preserved.
- **Tone**: No evaluative rejection prose or denial lists; candidates describe their experience naturally.
- **Corpus counts**: 10 IT jobs, 80 IT CVs, 100% of candidate IDs, section IDs, experience IDs, and project IDs preserved.

---

## 4. Unresolved Cases

No unresolved blockers or corrupt records. Every warning in the validation suite has been reviewed and addressed.
