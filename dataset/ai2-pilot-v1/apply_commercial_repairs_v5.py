"""Apply 3 final SA-J03 role skills_used grounding repairs flagged by verify-commercial-repairs-v4."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent
SOURCES_PATH = BASE / "sources" / "sales-marketing.json"
SNAPSHOT_PATH = BASE / "snapshots" / "before-commercial-repairs-v5.json"
LOG_PATH = BASE / "commercial-repair-log-v5.json"
AUDIT_INPUT_SA_J03 = BASE / "audit-inputs-v3" / "SA-J03.json"


def main() -> None:
    raw_bytes = SOURCES_PATH.read_bytes()
    SNAPSHOT_PATH.write_bytes(raw_bytes)
    data = json.loads(raw_bytes.decode("utf-8"))

    removals = {
        ("SA-J03-C02", "SA-J03-C02-EXP-02"): "Đấu thầu y tế công lập",
        ("SA-J03-C05", "SA-J03-C05-EXP-01"): "Luật Đấu thầu",
        ("SA-J03-C07", "SA-J03-C07-EXP-01"): "Đấu thầu y tế theo Luật Đấu thầu",
    }

    changes: list[dict[str, Any]] = []
    sa_j03_job: dict[str, Any] | None = None
    for job in data["jobs"]:
        if job["job_id"] == "SA-J03":
            sa_j03_job = job
        for cand in job["candidates"]:
            cid = cand["candidate_id"]
            for exp in cand["experiences"]:
                key = (cid, exp["experience_id"])
                if key in removals:
                    target = removals[key]
                    old_su = list(exp.get("skills_used") or [])
                    new_su = [x for x in old_su if x != target]
                    if old_su != new_su:
                        exp["skills_used"] = new_su
                        changes.append({
                            "id": exp["experience_id"],
                            "field": "skills_used",
                            "before": old_su,
                            "after": new_su,
                            "decision": "HR-SOURCE-003",
                            "reason": f"Remove cross-section/statutory term {target!r} absent from role prose",
                        })

    if len(changes) != 3 or sa_j03_job is None:
        raise RuntimeError(f"Expected 3 changes for SA-J03, got {len(changes)}")

    new_raw = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    SOURCES_PATH.write_text(new_raw, encoding="utf-8")
    after_sha256 = hashlib.sha256(new_raw.encode("utf-8")).hexdigest()

    audit_doc = {
        "schema_version": data["schema_version"],
        "split": data["split"],
        "synthetic": data["synthetic"],
        "generation_model_requested": data["generation_model_requested"],
        "jobs": [sa_j03_job],
    }
    AUDIT_INPUT_SA_J03.write_text(json.dumps(audit_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    LOG_PATH.write_text(json.dumps({
        "schema_version": "ai2-pilot-commercial-repair-log-v5",
        "changes_count": len(changes),
        "after_sha256": after_sha256,
        "changes": changes,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(changes)} SA-J03 repairs. New sales-marketing.json SHA-256: {after_sha256}")


if __name__ == "__main__":
    main()
