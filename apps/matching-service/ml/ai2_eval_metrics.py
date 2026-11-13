"""Pre-registered ranking evaluation metrics and paired JD-level statistical tests for AI2 (Plan E01)."""

from __future__ import annotations

from collections import defaultdict
import hashlib
import math
import random
import statistics
from typing import Any, Iterable, Mapping, Sequence


def dcg_at_k(relevances: Sequence[int], k: int) -> float:
    if k <= 0:
        raise ValueError("k must be positive")
    total = 0.0
    for idx, rel in enumerate(relevances[:k], start=1):
        if rel not in (0, 1, 2, 3):
            raise ValueError(f"Relevance must be in {{0, 1, 2, 3}}, got {rel!r}")
        gain = float((2 ** rel) - 1)
        total += gain / math.log2(idx + 1)
    return total


def ndcg_at_k(relevances: Sequence[int], k: int) -> float | None:
    if not relevances:
        return None
    ideal = sorted(relevances, reverse=True)
    idcg = dcg_at_k(ideal, k)
    if idcg <= 0.0:
        return None
    return dcg_at_k(relevances, k) / idcg


def precision_at_k(relevances: Sequence[int], k: int, *, relevant_threshold: int = 2) -> float | None:
    if k <= 0:
        raise ValueError("k must be positive")
    if not relevances:
        return None
    top = relevances[:k]
    return sum(1 for r in top if r >= relevant_threshold) / float(len(top))


def recall_at_k(relevances: Sequence[int], k: int, *, relevant_threshold: int = 2) -> float | None:
    if k <= 0:
        raise ValueError("k must be positive")
    total_rel = sum(1 for r in relevances if r >= relevant_threshold)
    if total_rel == 0:
        return None
    return sum(1 for r in relevances[:k] if r >= relevant_threshold) / float(total_rel)


def reciprocal_rank(relevances: Sequence[int], *, relevant_threshold: int = 2) -> float | None:
    total_rel = sum(1 for r in relevances if r >= relevant_threshold)
    if total_rel == 0:
        return None
    for idx, rel in enumerate(relevances, start=1):
        if rel >= relevant_threshold:
            return 1.0 / float(idx)
    return 0.0


def stable_tie_key(job_id: str, candidate_id: str) -> str:
    return hashlib.sha256(f"{job_id}:{candidate_id}".encode("utf-8")).hexdigest()


def evaluate_ranking_predictions(
    rows: Iterable[Mapping[str, Any]],
    *,
    ks: tuple[int, ...] = (3, 5),
    relevant_threshold: int = 2,
) -> dict[str, Any]:
    """
    Evaluate candidate predictions grouped strictly by job_id.

    Each row requires: job_id, candidate_id, relevance (0..3), score (finite float).
    Optional slice keys: domain, level.
    Tie-breaking uses (-score, stable_tie_key(job_id, candidate_id)) — never input order.
    """
    by_job: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        score = float(row["score"])
        if not math.isfinite(score):
            raise ValueError(f"Non-finite prediction score for {row.get('job_id')}:{row.get('candidate_id')}")
        rel = row["relevance"]
        if type(rel) is not int or rel not in (0, 1, 2, 3):
            raise ValueError(f"Invalid relevance {rel!r} for {row.get('job_id')}:{row.get('candidate_id')}")
        by_job[str(row["job_id"])].append(dict(row, score=score))

    per_job: dict[str, dict[str, Any]] = {}
    zero_relevant_jds: list[str] = []
    zero_idcg_jds: list[str] = []
    tie_pairs_total = 0
    adjacent_pairs_total = 0

    for jid in sorted(by_job):
        items = sorted(
            by_job[jid],
            key=lambda r: (-r["score"], stable_tie_key(jid, str(r["candidate_id"]))),
        )
        for a, b in zip(items, items[1:]):
            adjacent_pairs_total += 1
            if a["score"] == b["score"]:
                tie_pairs_total += 1

        rels = [r["relevance"] for r in items]
        if all(r == 0 for r in rels):
            zero_idcg_jds.append(jid)
        if sum(1 for r in rels if r >= relevant_threshold) == 0:
            zero_relevant_jds.append(jid)

        job_metrics: dict[str, Any] = {
            "pool_size": len(items),
            "domain": items[0].get("domain"),
            "level": items[0].get("level"),
            "mrr": reciprocal_rank(rels, relevant_threshold=relevant_threshold),
        }
        for k in ks:
            job_metrics[f"ndcg@{k}"] = ndcg_at_k(rels, k)
            job_metrics[f"precision@{k}"] = precision_at_k(rels, k, relevant_threshold=relevant_threshold)
            job_metrics[f"recall@{k}"] = recall_at_k(rels, k, relevant_threshold=relevant_threshold)
        per_job[jid] = job_metrics

    def _aggregate(subset_jids: list[str]) -> dict[str, Any]:
        agg: dict[str, Any] = {"evaluated_jds": len(subset_jids)}
        metric_keys = ["mrr"] + [f"{m}@{k}" for k in ks for m in ("ndcg", "precision", "recall")]
        for key in metric_keys:
            vals = [per_job[j][key] for j in subset_jids if per_job[j][key] is not None]
            agg[key] = round(statistics.fmean(vals), 4) if vals else None
            agg[f"{key}_n_jds"] = len(vals)
        return agg

    all_jids = sorted(per_job.keys())
    slices: dict[str, dict[str, Any]] = {}
    for slice_field in ("domain", "level"):
        groups: dict[str, list[str]] = defaultdict(list)
        for jid in all_jids:
            sval = per_job[jid].get(slice_field)
            if sval is not None:
                groups[str(sval)].append(jid)
        if groups:
            slices[slice_field] = {k: _aggregate(v) for k, v in sorted(groups.items())}

    return {
        "macro": _aggregate(all_jids),
        "per_job": per_job,
        "slices": slices,
        "zero_relevant_jd_count": len(zero_relevant_jds),
        "zero_relevant_jd_ids": zero_relevant_jds,
        "zero_idcg_jd_count": len(zero_idcg_jds),
        "tie_rate": round(tie_pairs_total / adjacent_pairs_total, 4) if adjacent_pairs_total else 0.0,
    }


def paired_jd_bootstrap_ci(
    per_job_candidate: Mapping[str, Mapping[str, Any]],
    per_job_baseline: Mapping[str, Mapping[str, Any]],
    *,
    metric: str = "ndcg@5",
    n_boot: int = 10000,
    seed: int = 42,
    alpha: float = 0.05,
) -> dict[str, Any]:
    """Compute paired JD-level delta mean and two-sided percentile bootstrap CI."""
    shared_jids = sorted(
        jid for jid in (set(per_job_candidate) & set(per_job_baseline))
        if per_job_candidate[jid].get(metric) is not None and per_job_baseline[jid].get(metric) is not None
    )
    if not shared_jids:
        return {"metric": metric, "n_jds": 0, "mean_delta": None, "ci_low": None, "ci_high": None}

    deltas = [
        float(per_job_candidate[j][metric]) - float(per_job_baseline[j][metric])
        for j in shared_jids
    ]
    n = len(deltas)
    obs_mean = statistics.fmean(deltas)

    rng = random.Random(seed)
    boot_means: list[float] = []
    for _ in range(n_boot):
        sample = [deltas[rng.randrange(n)] for _ in range(n)]
        boot_means.append(sum(sample) / n)
    boot_means.sort()
    lo_idx = max(0, int(math.floor((alpha / 2.0) * n_boot)))
    hi_idx = min(n_boot - 1, int(math.ceil((1.0 - alpha / 2.0) * n_boot)) - 1)

    return {
        "metric": metric,
        "n_jds": n,
        "mean_delta": round(obs_mean, 4),
        "ci_low": round(boot_means[lo_idx], 4),
        "ci_high": round(boot_means[hi_idx], 4),
        "positive_jds": sum(1 for d in deltas if d > 0),
        "tied_jds": sum(1 for d in deltas if d == 0),
        "negative_jds": sum(1 for d in deltas if d < 0),
    }
