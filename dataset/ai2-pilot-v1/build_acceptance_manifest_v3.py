"""Consolidate verified per-JD audits (IT + commercial v5) into audits-v3/ and source-acceptance-manifest-v3.json."""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent
TASK_DIR = Path("/tmp/claude-1064602304/-home-truongdb-Desktop-nexhire-nexhire-BE/fa935a8c-dd12-4142-9a30-ff131b08f5ab/tasks")
WTYS_PATH = TASK_DIR / "wtys44xgs.output"
WLJ2_PATH = TASK_DIR / "wlj22smze.output"
WXFT_PATH = TASK_DIR / "wxftmuxcr.output"

AUDITS_V3_DIR = BASE / "audits-v3"
MANIFEST_PATH = BASE / "source-acceptance-manifest-v3.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    AUDITS_V3_DIR.mkdir(parents=True, exist_ok=True)

    wtys_results = json.loads(WTYS_PATH.read_text(encoding="utf-8"))["result"]["auditResults"]
    wlj2_results = json.loads(WLJ2_PATH.read_text(encoding="utf-8"))["result"]["auditResults"]
    wxft_result = json.loads(WXFT_PATH.read_text(encoding="utf-8"))["result"]

    by_job: dict[str, dict[str, Any]] = {}

    # 1. IT-J01..IT-J10 from wtys44xgs (sources/it.json unchanged since wtys44xgs)
    for item in wtys_results:
        jid = item["job_id"]
        if jid.startswith("IT-"):
            by_job[jid] = dict(item, verification_run_id="wtys44xgs", verification_model="ag/gemini-3.8-flash-high")

    # 2. Commercial jobs excluding SA-J03 from wlj22smze (after v4 repairs)
    for item in wlj2_results:
        jid = item["job_id"]
        if jid != "SA-J03":
            by_job[jid] = dict(item, verification_run_id="wlj22smze", verification_model="ag/gemini-3.8-flash-high")

    # 3. SA-J03 from wxftmuxcr (primary + skeptic adversarial check after v5 repairs)
    sa_j03_primary = wxft_result["primary"]
    sa_j03_skeptic = wxft_result["skeptic"]
    if sa_j03_skeptic["blocking_issues"]:
        raise RuntimeError(f"SA-J03 skeptic reported blocking issues: {sa_j03_skeptic['blocking_issues']}")
    by_job["SA-J03"] = dict(
        sa_j03_primary,
        skeptic_source_acceptance=sa_j03_skeptic["source_acceptance"],
        skeptic_blocking_issues=sa_j03_skeptic["blocking_issues"],
        verification_run_id="wxftmuxcr",
        verification_model="ag/gemini-3.8-flash-high",
    )

    expected_jids = (
        [f"IT-J{i:02}" for i in range(1, 11)]
        + [f"SA-J{i:02}" for i in range(1, 6)]
        + [f"MK-J{i:02}" for i in range(1, 6)]
    )
    if set(by_job.keys()) != set(expected_jids):
        raise RuntimeError(f"Job mismatch: got {sorted(by_job.keys())}")

    disposition_counts: Counter[str] = Counter()
    per_job_summary: list[dict[str, Any]] = []
    for jid in expected_jids:
        rec = by_job[jid]
        if rec["source_acceptance"] != "accepted":
            raise RuntimeError(f"{jid} not accepted: {rec['source_acceptance']}")
        if rec["blocking_issues"]:
            raise RuntimeError(f"{jid} has blocking issues: {rec['blocking_issues']}")
        if rec["verified_candidate_count"] != 8:
            raise RuntimeError(f"{jid} candidate count != 8: {rec['verified_candidate_count']}")

        out_file = AUDITS_V3_DIR / f"{jid}.json"
        out_file.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        job_disp = Counter(issue["disposition"] for issue in rec.get("resolved_historical_issues", []))
        disposition_counts.update(job_disp)
        per_job_summary.append({
            "job_id": jid,
            "verified_candidate_count": rec["verified_candidate_count"],
            "source_acceptance": rec["source_acceptance"],
            "blocking_issues_count": 0,
            "resolved_dispositions": dict(job_disp),
            "limitations_count": len(rec.get("limitations_noted", [])),
            "verification_run_id": rec["verification_run_id"],
            "audit_file_sha256": sha256_file(out_file),
        })

    validation_report = json.loads((BASE / "source-validation.json").read_text(encoding="utf-8"))
    dup_report = json.loads((BASE / "source-duplicate-report.json").read_text(encoding="utf-8"))

    manifest = {
        "schema_version": "ai2-pilot-source-acceptance-v3",
        "gate_status": "READY_FOR_GATE_A_SIGNOFF",
        "split": "development",
        "reference_date": "2026-11-10",
        "synthetic_only": True,
        "total_jobs": 20,
        "accepted_jobs": 20,
        "total_candidates_pairs": 160,
        "total_blocking_issues": 0,
        "verification_model": "ag/gemini-3.8-flash-high",
        "source_artifacts": {
            "it.json": {
                "path": "dataset/ai2-pilot-v1/sources/it.json",
                "sha256": sha256_file(BASE / "sources" / "it.json"),
            },
            "sales-marketing.json": {
                "path": "dataset/ai2-pilot-v1/sources/sales-marketing.json",
                "sha256": sha256_file(BASE / "sources" / "sales-marketing.json"),
            },
            "PROTOCOL.md": {
                "path": "dataset/ai2-pilot-v1/PROTOCOL.md",
                "sha256": sha256_file(BASE / "PROTOCOL.md"),
            },
            "human-review-decisions.json": {
                "path": "dataset/ai2-pilot-v1/human-review-decisions.json",
                "sha256": sha256_file(BASE / "human-review-decisions.json"),
            },
        },
        "mechanical_validation": {
            "validator_script": "dataset/ai2-pilot-v1/validate_sources.py",
            "errors": len(validation_report["errors"]),
            "warnings": len(validation_report["warnings"]),
            "warning_types": validation_report["warning_types"],
            "exact_duplicate_pairs": len(dup_report["exact_duplicate_pairs"]),
            "near_duplicate_pairs_0_5": len(dup_report["near_duplicate_pairs"]),
        },
        "disposition_totals": dict(disposition_counts),
        "accepted_pilot_limitations": [
            "Development-only synthetic corpus; no real candidates or expert-gold hiring claims.",
            "Candidate IDs, ordinal positions (C01..C08), and recurring 6-section/2-job archetypes must never be used as model features or labeling shortcuts (HR-SOURCE-009).",
            "Preserved ambiguous summary tenure claims and unknown/null dates (HR-SOURCE-005/008) must be evaluated explicitly against role tasks/dates during silver annotation.",
            "Preserved verbatim 'Cử nhân Cao đẳng' degree wording in SA-J02-C07 (HR-SOURCE-010) and retained CV self-descriptions without penalizing or rewarding protected/health prose (HR-SOURCE-011).",
            "Silver annotation (Plan B02-B03) requires separate fresh cx/gpt-6.1-sol contexts once GPT session quota resets and Gate A is signed off."
        ],
        "jobs": per_job_summary,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "accepted_jobs": manifest["accepted_jobs"],
        "total_blocking_issues": manifest["total_blocking_issues"],
        "disposition_totals": manifest["disposition_totals"],
        "mechanical_errors": manifest["mechanical_validation"]["errors"],
        "it_sha256": manifest["source_artifacts"]["it.json"]["sha256"],
        "commercial_sha256": manifest["source_artifacts"]["sales-marketing.json"]["sha256"],
    }, indent=2))


if __name__ == "__main__":
    main()
