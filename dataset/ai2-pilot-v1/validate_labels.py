"""Strict validator for AI2 pilot silver labels (`ai2-pilot-label-v1`) per PROTOCOL.md (B04)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any


BASE = Path(__file__).resolve().parent

FORBIDDEN_RATIONALE_PATTERNS = (
    re.compile(r"\b(?:ai1[_\s-]?score|cosine[_\s-]?similarity|semantic[_\s-]?score|weighted[_\s-]?score|ranking[_\s-]?score)\b", re.IGNORECASE),
    re.compile(r"(?:chắc chắn trúng tuyển|tuyển dụng ngay|tự động loại|quyết định tuyển)", re.IGNORECASE),
    re.compile(r"(?:trường uy tín|trường top|giọng nói chuẩn|trẻ tuổi)", re.IGNORECASE),
)


def _check_no_duplicate_keys(raw_text: str, filename: str, errors: list[dict[str, Any]]) -> None:
    def _hook(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        seen: set[str] = set()
        for k, _ in pairs:
            if k in seen:
                errors.append({"id": filename, "issue": f"Duplicate JSON key: {k}"})
            seen.add(k)
        return dict(pairs)

    json.loads(raw_text, object_pairs_hook=_hook)


def load_source_index(sources_dir: Path) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    jobs: dict[str, dict[str, Any]] = {}
    candidates: dict[str, dict[str, Any]] = {}
    for fname in ("it.json", "sales-marketing.json"):
        path = sources_dir / fname
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for job in data["jobs"]:
            jobs[job["job_id"]] = job
            for cand in job["candidates"]:
                candidates[cand["candidate_id"]] = cand
    return jobs, candidates


def validate_label_file(
    label_path: Path,
    *,
    sources_dir: Path | None = None,
    expected_domains: set[str] | None = None,
    expected_role: str | None = None,
    require_complete: bool = True,
) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    def check(ok: bool, where: str, issue: str) -> None:
        if not ok:
            errors.append({"id": where, "issue": issue})

    raw = label_path.read_text(encoding="utf-8")
    _check_no_duplicate_keys(raw, label_path.name, errors)
    payload = json.loads(raw)

    check(isinstance(payload, dict), label_path.name, "root must be JSON object")
    if not isinstance(payload, dict):
        return {"errors": errors, "warnings": warnings, "record_count": 0}

    check(payload.get("schema_version") == "ai2-pilot-label-v1", label_path.name, "schema_version must be ai2-pilot-label-v1")
    role = payload.get("role")
    check(role in {"initial", "blind_review"}, label_path.name, "role must be initial or blind_review")
    if expected_role is not None:
        check(role == expected_role, label_path.name, f"expected role {expected_role}, got {role}")
    check(payload.get("review_model_requested") == "cx/gpt-6.1-sol", label_path.name, "review_model_requested must be cx/gpt-6.1-sol")
    check(payload.get("label_type") == "silver", label_path.name, "label_type must be silver")

    records = payload.get("records")
    check(isinstance(records, list), label_path.name, "records must be an array")
    if not isinstance(records, list):
        return {"errors": errors, "warnings": warnings, "record_count": 0}

    jobs, candidates = load_source_index(sources_dir or (BASE / "sources"))
    expected_pairs: set[tuple[str, str]] = set()
    for jid, job in jobs.items():
        if expected_domains is None or job["domain"] in expected_domains:
            for cand in job["candidates"]:
                expected_pairs.add((jid, cand["candidate_id"]))

    seen_pairs: set[tuple[str, str]] = set()
    for idx, rec in enumerate(records):
        where = f"records[{idx}]"
        if not isinstance(rec, dict):
            check(False, where, "record must be an object")
            continue

        jid = rec.get("job_id")
        cid = rec.get("candidate_id")
        where = f"{jid}:{cid}" if jid and cid else where

        check(isinstance(jid, str) and jid in jobs, where, f"unknown job_id {jid!r}")
        check(isinstance(cid, str) and cid in candidates, where, f"unknown candidate_id {cid!r}")
        if isinstance(jid, str) and isinstance(cid, str):
            check(cid.startswith(jid + "-"), where, "candidate_id does not belong to job_id")
            pair = (jid, cid)
            check(pair not in seen_pairs, where, "duplicate (job_id, candidate_id) record")
            seen_pairs.add(pair)

        rel = rec.get("relevance")
        check(type(rel) is int and rel in {0, 1, 2, 3}, where, f"relevance must be strict int in {{0,1,2,3}}, got {rel!r}")

        rationale = rec.get("rationale")
        check(isinstance(rationale, str) and len(rationale.strip()) >= 15, where, "rationale must be non-empty prose")
        if isinstance(rationale, str):
            for pat in FORBIDDEN_RATIONALE_PATTERNS:
                if pat.search(rationale):
                    check(False, where, f"prohibited reasoning/leakage pattern in rationale: {pat.pattern}")

        needs_hr = rec.get("needs_human_review")
        check(type(needs_hr) is bool, where, "needs_human_review must be boolean")
        reasons = rec.get("review_reasons")
        check(isinstance(reasons, list) and all(isinstance(r, str) and r.strip() for r in reasons), where, "review_reasons must be list of non-empty strings")
        if needs_hr is True:
            check(bool(reasons), where, "needs_human_review=true requires non-empty review_reasons")

        missing_info = rec.get("missing_information")
        check(isinstance(missing_info, list) and all(isinstance(m, str) and m.strip() for m in missing_info), where, "missing_information must be list of non-empty strings")

        ev_list = rec.get("evidence")
        check(isinstance(ev_list, list) and len(ev_list) >= 1, where, "evidence must be a non-empty list")

        if isinstance(jid, str) and jid in jobs and isinstance(cid, str) and cid in candidates and isinstance(ev_list, list):
            job_reqs = {r["requirement_id"]: r for r in jobs[jid]["requirements"]}
            cand_secs = {s["section_id"]: s for s in candidates[cid]["sections"]}
            cited_req_ids: set[str] = set()

            for e_idx, ev in enumerate(ev_list):
                e_where = f"{where}:ev[{e_idx}]"
                if not isinstance(ev, dict):
                    check(False, e_where, "evidence item must be object")
                    continue
                rid = ev.get("requirement_id")
                sid = ev.get("section_id")
                quote = ev.get("quote")
                assess = ev.get("assessment")

                check(isinstance(rid, str) and rid in job_reqs, e_where, f"invalid requirement_id {rid!r}")
                if isinstance(rid, str):
                    cited_req_ids.add(rid)
                check(assess in {"supported", "partial", "unknown", "contradicted"}, e_where, f"invalid assessment {assess!r}")
                check(isinstance(sid, str) and sid in cand_secs, e_where, f"invalid section_id {sid!r}")
                check(isinstance(quote, str) and bool(quote.strip()), e_where, "quote must be non-empty exact substring")
                if isinstance(sid, str) and sid in cand_secs and isinstance(quote, str) and quote.strip():
                    sec_text = cand_secs[sid]["text"]
                    check(quote in sec_text, e_where, f"quote is not an exact substring of section {sid}")

            # Verify every required requirement was considered (either cited in evidence or explicitly named in missing_information)
            missing_joined = " ".join(missing_info or [])
            required_ids = [rid for rid, r in job_reqs.items() if r["importance"] == "required"]
            uncovered = [
                rid for rid in required_ids
                if rid not in cited_req_ids and rid not in missing_joined and not missing_info
            ]
            if uncovered:
                check(
                    False,
                    where,
                    f"required requirements missing both evidence citation and missing_information note: {uncovered}",
                )
            elif any(rid not in cited_req_ids and rid not in missing_joined for rid in required_ids):
                warnings.append({
                    "id": where,
                    "issue": "required criterion omitted from evidence; ensure missing_information explicitly names it",
                    "missing_req_ids": [rid for rid in required_ids if rid not in cited_req_ids and rid not in missing_joined],
                })

    if require_complete and expected_pairs:
        missing_pairs = sorted(expected_pairs - seen_pairs)
        extra_pairs = sorted(seen_pairs - expected_pairs)
        check(not missing_pairs, label_path.name, f"missing {len(missing_pairs)} expected pairs (first 5: {missing_pairs[:5]})")
        check(not extra_pairs, label_path.name, f"unexpected pairs outside target scope: {extra_pairs[:5]}")

    return {
        "file": str(label_path),
        "role": role,
        "record_count": len(records),
        "unique_pairs": len(seen_pairs),
        "errors": errors,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate AI2 pilot label JSON files.")
    parser.add_argument("label_file", type=Path)
    parser.add_argument("--sources-dir", type=Path, default=BASE / "sources")
    parser.add_argument("--domains", nargs="*", choices=["it", "sales", "marketing"], default=None)
    parser.add_argument("--role", choices=["initial", "blind_review"], default=None)
    args = parser.parse_args()

    res = validate_label_file(
        args.label_file,
        sources_dir=args.sources_dir,
        expected_domains=set(args.domains) if args.domains else None,
        expected_role=args.role,
    )
    print(json.dumps({
        "file": res["file"],
        "role": res["role"],
        "record_count": res["record_count"],
        "unique_pairs": res["unique_pairs"],
        "error_count": len(res["errors"]),
        "warning_count": len(res["warnings"]),
        "errors": res["errors"][:20],
    }, ensure_ascii=False, indent=2))
    if res["errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
