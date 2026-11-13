"""Agreement analysis and human-adjudication queue builder for AI2 pilot labels (B05–B07)."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


BASE = Path(__file__).resolve().parent


def quadratic_weighted_kappa(y1: list[int], y2: list[int], min_rating: int = 0, max_rating: int = 3) -> float | None:
    if len(y1) != len(y2) or not y1:
        return None
    n = max_rating - min_rating + 1
    hist1 = [0] * n
    hist2 = [0] * n
    obs = [[0] * n for _ in range(n)]
    for a, b in zip(y1, y2):
        ia, ib = a - min_rating, b - min_rating
        hist1[ia] += 1
        hist2[ib] += 1
        obs[ia][ib] += 1

    total = len(y1)
    num = 0.0
    den = 0.0
    denom_sq = float((n - 1) ** 2)
    for i in range(n):
        for j in range(n):
            w = ((i - j) ** 2) / denom_sq
            expected = (hist1[i] * hist2[j]) / total
            num += w * obs[i][j]
            den += w * expected
    if den == 0.0:
        return 1.0 if num == 0.0 else 0.0
    return round(1.0 - (num / den), 4)


def confusion_matrix(y1: list[int], y2: list[int], labels: tuple[int, ...] = (0, 1, 2, 3)) -> dict[str, dict[str, int]]:
    mat = {str(a): {str(b): 0 for b in labels} for a in labels}
    for a, b in zip(y1, y2):
        mat[str(a)][str(b)] += 1
    return mat


def analyze_agreement(
    initial_data: dict[str, Any],
    blind_data: dict[str, Any],
    jobs_by_id: dict[str, dict[str, Any]],
    *,
    sample_rate_agreements: int = 10,
) -> dict[str, Any]:
    init_map = {(r["job_id"], r["candidate_id"]): r for r in initial_data["records"]}
    blind_map = {(r["job_id"], r["candidate_id"]): r for r in blind_data["records"]}

    common_keys = sorted(set(init_map.keys()) & set(blind_map.keys()))
    missing_in_blind = sorted(set(init_map.keys()) - set(blind_map.keys()))
    missing_in_init = sorted(set(blind_map.keys()) - set(init_map.keys()))

    y_init = [init_map[k]["relevance"] for k in common_keys]
    y_blind = [blind_map[k]["relevance"] for k in common_keys]

    exact = sum(1 for a, b in zip(y_init, y_blind) if a == b)
    adjacent = sum(1 for a, b in zip(y_init, y_blind) if abs(a - b) <= 1)

    per_domain: dict[str, dict[str, Any]] = {}
    for dom in ("it", "sales", "marketing"):
        dom_keys = [k for k in common_keys if jobs_by_id.get(k[0], {}).get("domain") == dom]
        if not dom_keys:
            continue
        yi = [init_map[k]["relevance"] for k in dom_keys]
        yb = [blind_map[k]["relevance"] for k in dom_keys]
        per_domain[dom] = {
            "pairs": len(dom_keys),
            "exact_agreement": round(sum(1 for a, b in zip(yi, yb) if a == b) / len(dom_keys), 4),
            "adjacent_agreement": round(sum(1 for a, b in zip(yi, yb) if abs(a - b) <= 1) / len(dom_keys), 4),
            "quadratic_weighted_kappa": quadratic_weighted_kappa(yi, yb),
            "disagreements": sum(1 for a, b in zip(yi, yb) if a != b),
        }

    human_queue: list[dict[str, Any]] = []
    clean_agreements: list[tuple[str, str]] = []
    for jid, cid in common_keys:
        r_i = init_map[(jid, cid)]
        r_b = blind_map[(jid, cid)]
        disagree = r_i["relevance"] != r_b["relevance"]
        flagged = bool(r_i["needs_human_review"] or r_b["needs_human_review"])
        if disagree or flagged:
            human_queue.append({
                "job_id": jid,
                "candidate_id": cid,
                "domain": jobs_by_id.get(jid, {}).get("domain"),
                "queue_reason": "disagreement" if disagree else "flagged_ambiguity",
                "initial_relevance": r_i["relevance"],
                "blind_relevance": r_b["relevance"],
                "initial_reasons": r_i["review_reasons"],
                "blind_reasons": r_b["review_reasons"],
                "initial_missing": r_i["missing_information"],
                "blind_missing": r_b["missing_information"],
            })
        else:
            clean_agreements.append((jid, cid))

    # Deterministic agreement audit sample (hash sorted)
    sampled_agreements = sorted(
        clean_agreements,
        key=lambda pair: hashlib.sha256(f"{pair[0]}:{pair[1]}".encode("utf-8")).hexdigest(),
    )[:sample_rate_agreements]
    for jid, cid in sampled_agreements:
        r_i = init_map[(jid, cid)]
        human_queue.append({
            "job_id": jid,
            "candidate_id": cid,
            "domain": jobs_by_id.get(jid, {}).get("domain"),
            "queue_reason": "deterministic_agreement_audit_sample",
            "initial_relevance": r_i["relevance"],
            "blind_relevance": blind_map[(jid, cid)]["relevance"],
            "initial_reasons": r_i["review_reasons"],
            "blind_reasons": blind_map[(jid, cid)]["review_reasons"],
            "initial_missing": r_i["missing_information"],
            "blind_missing": blind_map[(jid, cid)]["missing_information"],
        })

    return {
        "total_common_pairs": len(common_keys),
        "missing_in_blind": missing_in_blind,
        "missing_in_initial": missing_in_init,
        "exact_agreement": round(exact / len(common_keys), 4) if common_keys else None,
        "adjacent_agreement": round(adjacent / len(common_keys), 4) if common_keys else None,
        "quadratic_weighted_kappa": quadratic_weighted_kappa(y_init, y_blind),
        "confusion_matrix_initial_vs_blind": confusion_matrix(y_init, y_blind),
        "per_domain": per_domain,
        "disagreement_count": sum(1 for q in human_queue if q["queue_reason"] == "disagreement"),
        "flagged_ambiguity_count": sum(1 for q in human_queue if q["queue_reason"] == "flagged_ambiguity"),
        "agreement_audit_sample_count": len(sampled_agreements),
        "human_review_queue": human_queue,
        "limitations": [
            "Pilot is 20 JDs / 160 pairs (development only); kappa and agreement rates do not generalize to live production pools.",
            "Unreviewed silver agreements between two model contexts remain silver labels, not human expert gold.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze initial vs blind review agreement (B05–B06).")
    parser.add_argument("initial_file", type=Path)
    parser.add_argument("blind_file", type=Path)
    parser.add_argument("--sources-dir", type=Path, default=BASE / "sources")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    jobs_by_id: dict[str, dict[str, Any]] = {}
    for fname in ("it.json", "sales-marketing.json"):
        p = args.sources_dir / fname
        if p.exists():
            for j in json.loads(p.read_text(encoding="utf-8"))["jobs"]:
                jobs_by_id[j["job_id"]] = j

    init_data = json.loads(args.initial_file.read_text(encoding="utf-8"))
    blind_data = json.loads(args.blind_file.read_text(encoding="utf-8"))
    report = analyze_agreement(init_data, blind_data, jobs_by_id)
    if args.out:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "total_common_pairs": report["total_common_pairs"],
        "exact_agreement": report["exact_agreement"],
        "adjacent_agreement": report["adjacent_agreement"],
        "quadratic_weighted_kappa": report["quadratic_weighted_kappa"],
        "disagreement_count": report["disagreement_count"],
        "flagged_ambiguity_count": report["flagged_ambiguity_count"],
        "agreement_audit_sample_count": report["agreement_audit_sample_count"],
    }, indent=2))


if __name__ == "__main__":
    main()
