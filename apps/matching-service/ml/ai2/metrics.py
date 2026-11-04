"""Pure, per-job macro ranking metrics; no training or data access."""

import math
from collections.abc import Mapping
from numbers import Real


def _id_key(value):
    # String-only IDs preserve distinct per-job keys through JSON serialization.
    if not isinstance(value, str) or not value.strip():
        raise ValueError("job_id and candidate_id must be nonempty strings")
    return value


def evaluate_ranking(records, ks=(1, 2, 3), relevant_cutoff=2):
    """Evaluate scored candidate pools independently, then macro-average jobs.

    Records are mappings with job_id, candidate_id, relevance (integer 0..3),
    and a finite real score (bool is not a number here). IDs must be nonempty
    strings; integer and bool IDs are rejected. Scores sort descending, ties by
    ascending candidate_id lexically. Every K must fit *every* observed pool.
    Recall is pool-local, not an estimate of recall outside the supplied pool.

    Returns ``per_job[job_id]`` with ranking, counts, and a ``metrics`` mapping;
    ``aggregate[metric]`` has value, denominator (eligible jobs), and excluded.
    Metric keys are precision@K, recall@K, ndcg@K, and mrr (full-pool MRR).
    Undefined values are None: recall/MRR for jobs with no relevance >= cutoff,
    NDCG for all-zero labels. Precision always includes every job. All macro
    values with denominator zero are None, never silently replaced with zero.
    Top-level job_count, zero_relevant_job_count, and all_zero_job_count make
    exclusions explicit. NDCG uses graded gains 2**relevance - 1.

    Invalid inputs raise ValueError; inputs are neither mutated nor retained.
    """
    if isinstance(relevant_cutoff, bool) or not isinstance(relevant_cutoff, int):
        raise ValueError("relevant_cutoff must be an integer in 0..3")
    if not 0 <= relevant_cutoff <= 3:
        raise ValueError("relevant_cutoff must be an integer in 0..3")
    try:
        ks = tuple(ks)
    except TypeError as exc:
        raise ValueError("ks must be a nonempty iterable of positive integers") from exc
    if not ks or any(isinstance(k, bool) or not isinstance(k, int) or k < 1 for k in ks):
        raise ValueError("ks must contain positive integers (not bool)")
    if len(set(ks)) != len(ks):
        raise ValueError("ks must not contain duplicates")
    ks = tuple(sorted(ks))
    try:
        iterator = iter(records)
    except TypeError as exc:
        raise ValueError("records must be a nonempty iterable of mappings") from exc

    jobs = {}
    seen = set()
    for index, record in enumerate(iterator):
        if not isinstance(record, Mapping):
            raise ValueError(f"record {index} must be a mapping")
        try:
            job, candidate, relevance, score = (
                record[field] for field in ("job_id", "candidate_id", "relevance", "score")
            )
        except KeyError as exc:
            raise ValueError(f"record {index} missing field {exc.args[0]}") from exc
        _id_key(job)
        _id_key(candidate)
        if isinstance(relevance, bool) or not isinstance(relevance, int) or not 0 <= relevance <= 3:
            raise ValueError(f"record {index} relevance must be an integer in 0..3")
        if isinstance(score, bool) or not isinstance(score, Real):
            raise ValueError(f"record {index} score must be a finite real number")
        try:
            finite = math.isfinite(score)
        except (OverflowError, ValueError) as exc:
            raise ValueError(f"record {index} score must be finite") from exc
        if not finite:
            raise ValueError(f"record {index} score must be finite")
        if (job, candidate) in seen:
            raise ValueError(f"duplicate candidate_id {candidate!r} for job_id {job!r}")
        seen.add((job, candidate))
        jobs.setdefault(job, []).append((candidate, relevance, score))
    if not jobs:
        raise ValueError("records must not be empty")
    for job, pool in jobs.items():
        if max(ks) > len(pool):
            raise ValueError(f"K={max(ks)} exceeds candidate pool {len(pool)} for job_id {job!r}")

    per_job = {}
    for job in sorted(jobs, key=_id_key):
        ranked = sorted(jobs[job], key=lambda row: (-row[2], _id_key(row[0])))
        labels = [row[1] for row in ranked]
        ideal = sorted(labels, reverse=True)
        relevant_count = sum(label >= relevant_cutoff for label in labels)
        metrics = {"mrr": next((1.0 / rank for rank, label in enumerate(labels, 1)
                                 if label >= relevant_cutoff), None)}
        for k in ks:
            hits = sum(label >= relevant_cutoff for label in labels[:k])
            metrics[f"precision@{k}"] = hits / k
            metrics[f"recall@{k}"] = hits / relevant_count if relevant_count else None
            dcg = math.fsum((2 ** label - 1) / math.log2(rank + 1)
                            for rank, label in enumerate(labels[:k], 1))
            idcg = math.fsum((2 ** label - 1) / math.log2(rank + 1)
                             for rank, label in enumerate(ideal[:k], 1))
            metrics[f"ndcg@{k}"] = dcg / idcg if idcg else None
        per_job[job] = {
            "candidate_count": len(ranked),
            "relevant_count": relevant_count,
            "all_zero": not any(labels),
            "ranking": [row[0] for row in ranked],
            "metrics": metrics,
        }

    aggregate = {}
    for name in next(iter(per_job.values()))["metrics"]:
        values = [job["metrics"][name] for job in per_job.values()
                  if job["metrics"][name] is not None]
        aggregate[name] = {
            "value": math.fsum(values) / len(values) if values else None,
            "denominator": len(values),
            "excluded": len(per_job) - len(values),
        }
    return {
        "ks": ks,
        "relevant_cutoff": relevant_cutoff,
        "job_count": len(per_job),
        "zero_relevant_job_count": sum(job["relevant_count"] == 0 for job in per_job.values()),
        "all_zero_job_count": sum(job["all_zero"] for job in per_job.values()),
        "per_job": per_job,
        "aggregate": aggregate,
    }
