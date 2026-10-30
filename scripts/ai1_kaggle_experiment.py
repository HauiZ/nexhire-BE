#!/usr/bin/env python3
"""AI1 Kaggle Continuation Experiment Runner.

Evaluates 3 experimental arms:
- Arm A: Unchanged frozen M1 retention checkpoint (baseline / step 0).
- Arm B: Continuation training on old semantic train split only.
- Arm C: Continuation training on old train + 56 experimental silver support-ranking comparisons.

Guarantees:
- B & C share identical optimizer update budget (155 steps), batch size (8), seed (42),
  LR (2e-5), margin (0.1), selection rule, and frozen M1 teacher retention.
- Arm C uses stated mixture: 25% silver slots (2 per batch of 8) sampled deterministically
  with replacement, 75% old train.
- Model selection uses validation split job-macro MRR only; baseline step 0 is eligible.
- Deterministic ties prefer earlier checkpoints.
- Final test split evaluation occurs strictly after selection, evaluated on identical cases,
  reporting paired job bootstrap 95% confidence intervals (C-A and C-B).
- Evaluation candidate pool is restricted to label-known candidates per (job_id, requirement_id, requirement);
  cross-requirement candidates are never assumed negative.
- Duplicate identical normalized evidence with conflicting labels fails closed.
- Queries without positives are excluded from positive-dependent metrics (MRR, Hit@k, Recall@k).
"""

import argparse
import copy
import hashlib
import json
import math
import os
import platform
import random
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Configuration Constants
DEFAULT_STEPS: int = 155
DEFAULT_BATCH_SIZE: int = 8
DEFAULT_SEED: int = 42
DEFAULT_LR: float = 2e-05
DEFAULT_MARGIN: float = 0.1
DEFAULT_RETENTION_WEIGHT: float = 1.0
DEFAULT_SILVER_RATIO: float = 0.25
MAX_SEQ_LENGTH: int = 256
EVAL_CHECKPOINT_STEPS: List[int] = [0, 50, 100, 155]


def normalize_semantic_text(value: Optional[str]) -> str:
    """Normalize text matching standard repo convention: NFKC, lowercase, single-spaced."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value))).strip().lower()


def compute_sha256(filepath: Path | str) -> str:
    """Compute sha256 hex digest of a file in streaming chunks."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def verify_manifest(bundle_root: Path | str) -> Dict[str, Any]:
    """Verify all artifacts against bundle manifest.json. Fails closed on any tamper or unexpected file."""
    root = Path(bundle_root).resolve()
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        raise ValueError(f"Missing manifest.json in bundle root: {root}")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    artifacts = manifest.get("artifacts", {})
    if not artifacts:
        raise ValueError("Empty or invalid artifacts in manifest.json")

    # Check that all recorded artifacts exist and have matching SHA-256
    for rel_path, expected_sha in artifacts.items():
        artifact_path = root / rel_path
        if not artifact_path.exists():
            raise ValueError(f"Artifact listed in manifest missing on disk: {rel_path}")
        actual_sha = compute_sha256(artifact_path)
        if actual_sha != expected_sha:
            raise ValueError(
                f"SHA-256 mismatch for artifact '{rel_path}': expected {expected_sha}, got {actual_sha}"
            )

    # Check for any unexpected files on disk (excluding manifest.json and hidden directories)
    for p in root.rglob("*"):
        if p.is_file():
            rel = str(p.relative_to(root))
            if rel == "manifest.json" or rel.startswith("."):
                continue
            if rel not in artifacts:
                raise ValueError(f"Unexpected file not listed in manifest: {rel}")

    return manifest


def load_semantic_records(path: Path | str) -> List[Dict[str, Any]]:
    """Load semantic.jsonl records."""
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line_str = line.strip()
            if not line_str:
                continue
            try:
                rec = json.loads(line_str)
            except json.JSONDecodeError as e:
                raise ValueError(f"Malformed JSON in {path} line {line_no}: {e}")
            records.append(rec)
    return records


def build_restricted_candidate_pools(
    records: List[Dict[str, Any]],
    split: str,
) -> List[Dict[str, Any]]:
    """Group split records by (job_id, requirement_id, requirement).

    Deduplicates identical normalized evidence. If duplicate normalized evidence has conflicting
    labels, fails closed with ValueError.
    """
    grouped: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
    for r in records:
        if r.get("split") == split:
            key = (
                str(r["job_id"]),
                str(r["requirement_id"]),
                str(r.get("requirement", "")),
            )
            grouped[key].append(r)

    pools = []
    for (job_id, req_id, req_text), row_list in sorted(grouped.items(), key=lambda x: (x[0][0], x[0][1])):
        norm_seen: Dict[str, int] = {}
        deduped_candidates = []

        for row in row_list:
            evi_norm = normalize_semantic_text(row.get("evidence", ""))
            lbl = int(row.get("label", 0))

            if evi_norm in norm_seen:
                prev_lbl = norm_seen[evi_norm]
                if prev_lbl != lbl:
                    raise ValueError(
                        f"Conflicting labels for duplicate evidence in query ({job_id}, {req_id}): "
                        f"existing label {prev_lbl} vs new label {lbl} for evidence: '{evi_norm}'"
                    )
                # Identical label: deduplicate, do not add duplicate candidate
                continue

            norm_seen[evi_norm] = lbl
            deduped_candidates.append({
                "candidate_id": str(row.get("candidate_id") or row.get("record_id") or f"c_{len(deduped_candidates)}"),
                "evidence_id": str(row.get("evidence_id") or ""),
                "evidence": str(row.get("evidence", "")),
                "normalized_evidence": evi_norm,
                "label": lbl,
            })

        pos_count = sum(1 for c in deduped_candidates if c["label"] == 1)
        # Determine language tag from requirement_id (e.g., r1@en or r1@vi)
        lang = req_id.split("@")[-1] if "@" in req_id else "unknown"

        pools.append({
            "split": split,
            "job_id": job_id,
            "requirement_id": req_id,
            "requirement": req_text,
            "language": lang,
            "candidates": deduped_candidates,
            "pool_size": len(deduped_candidates),
            "pos_count": pos_count,
            "has_positive": pos_count > 0,
        })

    return pools


def load_silver_comparisons(path: Path | str) -> List[Dict[str, Any]]:
    """Load experimental silver comparisons."""
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line_str = line.strip()
            if not line_str:
                continue
            rec = json.loads(line_str)
            records.append(rec)
    return records


def validate_silver_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Validate full silver invariant: positive is full, negative is lower support, split is train."""
    allowed_neg_support = {"partial", "insufficient", "contradicted", "irrelevant"}
    validated = []
    for r in records:
        if r.get("split") != "train":
            raise ValueError(f"Silver comparison {r.get('comparison_id')} has split '{r.get('split')}'; train split only allowed!")

        sup = r.get("proposed_support", {})
        pos_sup = sup.get("positive")
        neg_sup = sup.get("negative")

        if pos_sup != "full":
            raise ValueError(
                f"Silver comparison {r.get('comparison_id')} violates positive invariant: "
                f"positive support must be 'full', got '{pos_sup}'"
            )
        if neg_sup not in allowed_neg_support:
            raise ValueError(
                f"Silver comparison {r.get('comparison_id')} violates negative invariant: "
                f"negative support must be in {allowed_neg_support}, got '{neg_sup}'"
            )
        validated.append(r)
    return validated


def validate_no_leakage(
    train_pairs: List[Dict[str, Any]],
    silver_pairs: List[Dict[str, Any]],
    val_rows: List[Dict[str, Any]],
    test_rows: List[Dict[str, Any]],
) -> None:
    """Validate that train and silver datasets have zero overlap with validation or test splits.

    Checks:
    1. Job ID disjointness: no train/silver job_id appears in validation or test splits.
    2. Normalized (requirement, evidence) pair disjointness: no train/silver pair appears in validation or test.
    """
    val_test_jobs: Set[str] = set()
    val_test_pairs: Set[Tuple[str, str]] = set()

    for r in val_rows + test_rows:
        val_test_jobs.add(str(r["job_id"]))
        req_norm = normalize_semantic_text(r.get("requirement", ""))
        evi_norm = normalize_semantic_text(r.get("evidence", ""))
        val_test_pairs.add((req_norm, evi_norm))

    # Check train pairs
    for p in train_pairs:
        jid = str(p.get("job_id", ""))
        if jid in val_test_jobs:
            raise ValueError(f"Train split Job ID leakage detected in heldout split: job_id='{jid}'")
        req_norm = normalize_semantic_text(p.get("requirement", ""))
        if "evidence" in p:
            evi_norm = normalize_semantic_text(p["evidence"])
            if (req_norm, evi_norm) in val_test_pairs:
                raise ValueError(f"Train pair leakage detected in heldout split: ({req_norm}, {evi_norm})")

    # Check silver pairs
    for s in silver_pairs:
        jid = str(s.get("job_id", ""))
        if jid in val_test_jobs:
            raise ValueError(f"Silver Job ID leakage detected in heldout split: job_id='{jid}'")
        req_norm = normalize_semantic_text(s.get("requirement", ""))
        pos_norm = normalize_semantic_text(s.get("positive_evidence", ""))
        neg_norm = normalize_semantic_text(s.get("negative_evidence", ""))
        evi_norm = normalize_semantic_text(s.get("evidence", ""))

        if pos_norm and (req_norm, pos_norm) in val_test_pairs:
            raise ValueError(f"Silver Pair leakage detected in heldout split: ({req_norm}, {pos_norm})")
        if neg_norm and (req_norm, neg_norm) in val_test_pairs:
            raise ValueError(f"Silver Pair leakage detected in heldout split: ({req_norm}, {neg_norm})")
        if evi_norm and (req_norm, evi_norm) in val_test_pairs:
            raise ValueError(f"Silver Pair leakage detected in heldout split: ({req_norm}, {evi_norm})")


def build_train_comparisons_from_semantic(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group train semantic records by (job_id, requirement_id, requirement) and form pos vs neg pairs."""
    grouped: Dict[Tuple[str, str, str], Dict[str, List[Dict[str, Any]]]] = defaultdict(
        lambda: {"pos": [], "neg": []}
    )
    for r in records:
        if r.get("split") == "train":
            key = (str(r["job_id"]), str(r["requirement_id"]), str(r.get("requirement", "")))
            lbl = int(r.get("label", 0))
            if lbl == 1:
                grouped[key]["pos"].append(r)
            elif lbl == 0:
                grouped[key]["neg"].append(r)

    comparisons = []
    comp_id = 0
    for (job_id, req_id, req_text), pool in sorted(grouped.items()):
        pos_list = pool["pos"]
        neg_list = pool["neg"]
        if not pos_list or not neg_list:
            continue
        for pos in pos_list:
            for neg in neg_list:
                comp_id += 1
                comparisons.append({
                    "comparison_id": f"sem_train_cmp_{comp_id:06d}",
                    "source": "semantic_train",
                    "job_id": job_id,
                    "requirement_id": req_id,
                    "requirement": req_text,
                    "positive_evidence": pos["evidence"],
                    "negative_evidence": neg["evidence"],
                })
    return comparisons


def deterministic_batch_sampler(
    old_comparisons: List[Dict[str, Any]],
    silver_comparisons: Optional[List[Dict[str, Any]]] = None,
    total_steps: int = DEFAULT_STEPS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    silver_ratio: float = DEFAULT_SILVER_RATIO,
    seed: int = DEFAULT_SEED,
) -> Tuple[List[List[Dict[str, Any]]], Dict[str, Any]]:
    """Sample batches deterministically with fixed mixture and track exposures.

    For Arm B (silver_comparisons is None or empty): all batch_size slots from old_comparisons.
    For Arm C: exactly round(batch_size * silver_ratio) slots from silver_comparisons (with replacement)
               and remaining slots from old_comparisons.
    """
    rng = random.Random(seed)
    batches = []

    use_silver = silver_comparisons is not None and len(silver_comparisons) > 0
    silver_slots = round(batch_size * silver_ratio) if use_silver else 0
    old_slots = batch_size - silver_slots

    silver_exposures_set: Set[str] = set()
    old_exposures_set: Set[str] = set()
    total_silver_exposures = 0
    total_old_exposures = 0

    for step in range(total_steps):
        batch = []
        # Sample silver slots
        if silver_slots > 0 and silver_comparisons:
            for _ in range(silver_slots):
                item = rng.choice(silver_comparisons)
                batch.append(item)
                silver_exposures_set.add(str(item.get("comparison_id", "")))
                total_silver_exposures += 1

        # Sample old slots
        for _ in range(old_slots):
            item = rng.choice(old_comparisons)
            batch.append(item)
            old_exposures_set.add(str(item.get("comparison_id", "")))
            total_old_exposures += 1

        # Deterministic shuffle within batch
        rng.shuffle(batch)
        batches.append(batch)

    exposure_stats = {
        "silver": {
            "unique_exposures": len(silver_exposures_set),
            "total_exposures": total_silver_exposures,
            "pool_size": len(silver_comparisons) if silver_comparisons else 0,
        },
        "old": {
            "unique_exposures": len(old_exposures_set),
            "total_exposures": total_old_exposures,
            "pool_size": len(old_comparisons),
        },
        "mixture_policy": {
            "silver_ratio": silver_ratio if use_silver else 0.0,
            "silver_slots_per_batch": silver_slots,
            "old_slots_per_batch": old_slots,
            "total_steps": total_steps,
            "batch_size": batch_size,
            "seed": seed,
            "disclaimer": "Deterministic with replacement; no full epoch equivalence claimed.",
        },
    }

    return batches, exposure_stats


def compute_query_ranking_metrics(
    ranked_candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute MRR, Hit@1, Hit@3, Recall@1, Recall@3 for a query.

    Ranked candidates must be pre-sorted in descending order of score.
    If no positive candidate exists, excluded from positive metrics (returns None).
    """
    total_positives = sum(1 for c in ranked_candidates if c.get("label") == 1)
    pool_size = len(ranked_candidates)

    if total_positives == 0:
        return {
            "has_positive": False,
            "total_positives": 0,
            "pool_size": pool_size,
            "mrr": None,
            "hit1": None,
            "hit3": None,
            "recall1": None,
            "recall3": None,
        }

    ranks = [idx + 1 for idx, c in enumerate(ranked_candidates) if c.get("label") == 1]
    first_rank = ranks[0]

    mrr = 1.0 / first_rank
    hit1 = 1.0 if first_rank <= 1 else 0.0
    hit3 = 1.0 if first_rank <= 3 else 0.0

    pos_in_top1 = sum(1 for r in ranks if r <= 1)
    pos_in_top3 = sum(1 for r in ranks if r <= 3)

    recall1 = pos_in_top1 / total_positives
    recall3 = pos_in_top3 / total_positives

    return {
        "has_positive": True,
        "total_positives": total_positives,
        "pool_size": pool_size,
        "mrr": mrr,
        "hit1": hit1,
        "hit3": hit3,
        "recall1": recall1,
        "recall3": recall3,
    }


def aggregate_metrics(case_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate micro and job-macro metrics with denominators and pool size distribution."""
    metric_keys = ["mrr", "hit1", "hit3", "recall1", "recall3"]

    total_queries = len(case_results)
    eval_cases = [c for c in case_results if c["metrics"]["has_positive"]]
    no_pos_cases = [c for c in case_results if not c["metrics"]["has_positive"]]

    evaluated_queries = len(eval_cases)
    no_positive_queries = len(no_pos_cases)

    pool_sizes = [c["metrics"]["pool_size"] for c in case_results]
    pool_sizes_sorted = sorted(pool_sizes) if pool_sizes else [0]
    n_p = len(pool_sizes_sorted)
    pool_dist = {
        "min": pool_sizes_sorted[0],
        "p25": pool_sizes_sorted[int(0.25 * (n_p - 1))],
        "median": pool_sizes_sorted[int(0.50 * (n_p - 1))],
        "p75": pool_sizes_sorted[int(0.75 * (n_p - 1))],
        "max": pool_sizes_sorted[-1],
        "mean": sum(pool_sizes) / total_queries if total_queries > 0 else 0.0,
    }

    if evaluated_queries == 0:
        return {
            "total_queries": total_queries,
            "evaluated_queries": 0,
            "no_positive_queries": no_positive_queries,
            "micro": {k: None for k in metric_keys},
            "macro_job": {k: None for k in metric_keys},
            "pool_distribution": pool_dist,
        }

    # Micro: direct average over all queries with positive
    micro = {
        k: sum(c["metrics"][k] for c in eval_cases) / evaluated_queries
        for k in metric_keys
    }

    # Macro: average per job first, then average across jobs
    by_job: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for c in eval_cases:
        by_job[c["job_id"]].append(c["metrics"])

    job_averages: Dict[str, Dict[str, float]] = {}
    for jid, q_list in by_job.items():
        n_q = len(q_list)
        job_averages[jid] = {
            k: sum(q[k] for q in q_list) / n_q for k in metric_keys
        }

    job_count = len(job_averages)
    macro_job = {
        k: sum(job_averages[j][k] for j in job_averages) / job_count
        for k in metric_keys
    }
    macro_job["job_count"] = job_count

    return {
        "total_queries": total_queries,
        "evaluated_queries": evaluated_queries,
        "no_positive_queries": no_positive_queries,
        "micro": micro,
        "macro_job": macro_job,
        "pool_distribution": pool_dist,
        "job_averages": job_averages,
    }


def paired_job_bootstrap(
    job_scores_primary: Dict[str, float],
    job_scores_baseline: Dict[str, float],
    n_resamples: int = 1000,
    seed: int = 42,
) -> Dict[str, Any]:
    """Compute seeded paired bootstrap confidence interval for job-macro metric difference."""
    common_jobs = sorted(set(job_scores_primary.keys()) & set(job_scores_baseline.keys()))
    if not common_jobs:
        return {
            "mean_delta": 0.0,
            "ci_95_low": 0.0,
            "ci_95_high": 0.0,
            "common_jobs_count": 0,
            "resamples": n_resamples,
        }

    deltas = [job_scores_primary[j] - job_scores_baseline[j] for j in common_jobs]
    n_jobs = len(deltas)
    mean_delta = sum(deltas) / n_jobs

    rng = random.Random(seed)
    boot_means = []
    for _ in range(n_resamples):
        sample = [rng.choice(deltas) for _ in range(n_jobs)]
        boot_means.append(sum(sample) / n_jobs)

    boot_means.sort()
    low_idx = int(0.025 * n_resamples)
    high_idx = int(0.975 * n_resamples)

    return {
        "mean_delta": mean_delta,
        "ci_95_low": boot_means[low_idx],
        "ci_95_high": boot_means[high_idx],
        "common_jobs_count": n_jobs,
        "resamples": n_resamples,
        "seed": seed,
    }


def select_best_checkpoint(eval_history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Select best checkpoint strictly by validation job-macro MRR.

    Baseline step 0 is eligible. Deterministic tie-breaking prefers earlier steps.
    """
    if not eval_history:
        raise ValueError("Cannot select from empty eval_history")

    best = None
    best_mrr = -1.0

    # Sort deterministically by step ascending
    for entry in sorted(eval_history, key=lambda x: x["step"]):
        val_mrr = entry.get("val_job_macro_mrr", 0.0)
        # Strict > ensures earlier step is kept if tied
        if val_mrr > best_mrr:
            best_mrr = val_mrr
            best = entry

    return copy.deepcopy(best)


# ==============================================================================
# Embedding & Scoring Architecture (Torch Real Training + Synthetic Smoke)
# ==============================================================================

def cleanup_memory(obj_list: Optional[List[Any]] = None) -> None:
    """Explicitly clean up models, optimizers, and release GPU/CPU memory."""
    import gc
    if obj_list:
        for obj in obj_list:
            del obj
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except (ImportError, Exception):
        pass


def train_step_torch(
    student: Any,
    teacher_cache: Dict[str, Any],
    q_inputs: Any,
    pos_inputs: Any,
    neg_inputs: Any,
    optimizer: Any,
    margin: float = DEFAULT_MARGIN,
    retention_weight: float = DEFAULT_RETENTION_WEIGHT,
    clip_norm: float = 1.0,
) -> Tuple[float, float, float]:
    """Execute single differentiable optimization step on student model with frozen teacher retention.

    Supports either raw tensor inputs (for unit tests / fixtures) or callable forward.
    """
    import torch

    # Student forward pass with autograd gradients enabled
    if hasattr(student, "forward_texts"):
        q_embs = student.forward_texts(q_inputs)
        pos_embs = student.forward_texts(pos_inputs)
        neg_embs = student.forward_texts(neg_inputs)
    else:
        q_embs = student(q_inputs)
        pos_embs = student(pos_inputs)
        neg_embs = student(neg_inputs)

    # Cosine similarities on normalized vectors
    sim_pos = (q_embs * pos_embs).sum(dim=-1)
    sim_neg = (q_embs * neg_embs).sum(dim=-1)

    # Hinge margin ranking loss
    rank_loss = torch.relu(margin - (sim_pos - sim_neg)).mean()

    # Retention loss against cached frozen teacher normalized embeddings
    t_q = teacher_cache["q"].detach()
    t_pos = teacher_cache["pos"].detach()
    t_neg = teacher_cache["neg"].detach()

    ret_q = 1.0 - (q_embs * t_q).sum(dim=-1)
    ret_pos = 1.0 - (pos_embs * t_pos).sum(dim=-1)
    ret_neg = 1.0 - (neg_embs * t_neg).sum(dim=-1)
    ret_loss = (ret_q.mean() + ret_pos.mean() + ret_neg.mean()) / 3.0

    total_loss = rank_loss + retention_weight * ret_loss

    optimizer.zero_grad(set_to_none=True)
    total_loss.backward()
    if hasattr(student, "parameters"):
        torch.nn.utils.clip_grad_norm_(student.parameters(), clip_norm)
    optimizer.step()

    return float(total_loss.item()), float(rank_loss.item()), float(ret_loss.item())


class TransformerTextModel:
    """Wrapper around HuggingFace transformer model with mean pooling and L2 normalization."""
    def __init__(self, model: Any, tokenizer: Any, device: Any):
        self.model = model
        self.tokenizer = tokenizer
        self.device = device

    def parameters(self):
        return self.model.parameters()

    def train(self, mode: bool = True):
        self.model.train(mode)

    def eval(self):
        self.model.eval()

    def state_dict(self):
        return self.model.state_dict()

    def load_state_dict(self, state_dict):
        self.model.load_state_dict(state_dict)

    def save_pretrained(self, save_dir: Path | str):
        p = Path(save_dir)
        p.mkdir(parents=True, exist_ok=True)
        self.model.save_pretrained(str(p))
        self.tokenizer.save_pretrained(str(p))

    def forward_texts(self, texts: List[str], max_length: int = MAX_SEQ_LENGTH):
        """Differentiable forward pass on texts returning L2-normalized embeddings tensor."""
        import torch
        import torch.nn.functional as F

        batch = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        input_ids = batch["input_ids"].to(self.device)
        attention_mask = batch["attention_mask"].to(self.device)
        outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
        token_embeddings = outputs[0]

        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        pooled = sum_embeddings / sum_mask
        return F.normalize(pooled, p=2, dim=1)

    def encode(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """Evaluation encoding: eval mode, torch.no_grad, returns float vectors."""
        import torch
        self.eval()
        all_embs = []
        with torch.no_grad():
            for i in range(0, len(texts), batch_size):
                chunk = texts[i:i + batch_size]
                embs = self.forward_texts(chunk)
                all_embs.extend(embs.cpu().tolist())
        return all_embs

    @classmethod
    def from_pretrained(cls, path: Path | str, device: Any):
        path_str = str(path)
        try:
            from transformers import AutoModel, AutoTokenizer
            tokenizer = AutoTokenizer.from_pretrained(path_str, local_files_only=True)
            model = AutoModel.from_pretrained(path_str, local_files_only=True, use_safetensors=True).to(device)
            return cls(model=model, tokenizer=tokenizer, device=device)
        except Exception:
            from sentence_transformers import SentenceTransformer
            st = SentenceTransformer(path_str, device=str(device), model_kwargs={"local_files_only": True})

            class STAdapter:
                def __init__(self, st_model, dev):
                    self.st = st_model
                    self.device = dev

                def parameters(self):
                    return self.st.parameters()

                def train(self, mode: bool = True):
                    self.st.train(mode)

                def eval(self):
                    self.st.eval()

                def state_dict(self):
                    return self.st.state_dict()

                def load_state_dict(self, sd):
                    self.st.load_state_dict(sd)

                def save_pretrained(self, save_dir: Path | str):
                    self.st.save(str(save_dir))

                def forward_texts(self, texts: List[str], max_length: int = MAX_SEQ_LENGTH):
                    import torch
                    import torch.nn.functional as F
                    features = self.st.tokenize(texts)
                    for k, v in features.items():
                        if isinstance(v, torch.Tensor):
                            features[k] = v.to(self.device)
                    out = self.st(features)
                    embs = out["sentence_embedding"]
                    return F.normalize(embs, p=2, dim=1)

                def encode(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
                    self.eval()
                    res = self.st.encode(texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=False)
                    return res.tolist() if hasattr(res, "tolist") else res

            return STAdapter(st, device)


def build_teacher_cache(
    teacher: Any,
    comparisons: List[Dict[str, Any]],
    batch_size: int = 32,
) -> Dict[str, Any]:
    """Pre-cache normalized embeddings for all unique texts in comparisons using frozen teacher on CPU to save VRAM."""
    import torch
    unique_texts = set()
    for c in comparisons:
        req = c.get("requirement")
        pos = c.get("positive_evidence")
        neg = c.get("negative_evidence")
        if req:
            unique_texts.add(req)
        if pos:
            unique_texts.add(pos)
        if neg:
            unique_texts.add(neg)

    unique_list = sorted(unique_texts)
    teacher.eval()
    cache: Dict[str, Any] = {}
    with torch.no_grad():
        for i in range(0, len(unique_list), batch_size):
            chunk = unique_list[i : i + batch_size]
            if hasattr(teacher, "forward_texts"):
                embs = teacher.forward_texts(chunk)
            else:
                raw = teacher.encode(chunk)
                embs = torch.tensor(raw, device=getattr(teacher, "device", "cpu"))
            for t, emb in zip(chunk, embs):
                cache[t] = emb.detach().cpu()
    return cache


def get_batch_teacher_cache(
    cache: Dict[str, Any],
    teacher: Any,
    reqs: List[str],
    pos_texts: List[str],
    neg_texts: List[str],
) -> Dict[str, Any]:
    """Assemble teacher cache tensors for given batch on target device, computing missing embeddings on demand."""
    import torch
    target_device = getattr(teacher, "device", "cpu")
    for t in reqs + pos_texts + neg_texts:
        if t not in cache:
            with torch.no_grad():
                if hasattr(teacher, "forward_texts"):
                    emb = teacher.forward_texts([t])[0]
                else:
                    raw = teacher.encode([t])
                    emb = torch.tensor(raw[0], device=target_device)
                cache[t] = emb.detach().cpu()
    return {
        "q": torch.stack([cache[t] for t in reqs]).to(target_device),
        "pos": torch.stack([cache[t] for t in pos_texts]).to(target_device),
        "neg": torch.stack([cache[t] for t in neg_texts]).to(target_device),
    }


class SyntheticMockEmbedder:
    """Deterministic synthetic embedder strictly for smoke testing / CI environments without torch.

    Generates stable 384-dimensional normalized vectors from text hash.
    """
    def __init__(self, seed: int = 42, dim: int = 384):
        self.seed = seed
        self.dim = dim

    def encode(self, texts: List[str]) -> List[List[float]]:
        embeddings = []
        for text in texts:
            norm_t = normalize_semantic_text(text)
            h = hashlib.sha256(f"{self.seed}:{norm_t}".encode("utf-8")).digest()
            vec = []
            for i in range(self.dim):
                byte_val = h[i % len(h)]
                val = (byte_val - 128.0) / 128.0
                vec.append(val)
            norm_val = math.sqrt(sum(x * x for x in vec)) or 1.0
            vec = [x / norm_val for x in vec]
            embeddings.append(vec)
        return embeddings


def cosine_similarity_pure(v1: List[float], v2: List[float]) -> float:
    """Pure Python cosine similarity between normalized vectors."""
    return sum(a * b for a, b in zip(v1, v2))


def evaluate_pools_pure(
    pools: List[Dict[str, Any]],
    embedder: Any,
) -> List[Dict[str, Any]]:
    """Evaluate candidate pools using vector scoring with deterministic tie-breaking."""
    unique_texts = set()
    for p in pools:
        unique_texts.add(p["requirement"])
        for c in p["candidates"]:
            unique_texts.add(c["evidence"])

    text_list = sorted(unique_texts)
    emb_list = embedder.encode(text_list)
    emb_map = {t: emb for t, emb in zip(text_list, emb_list)}

    case_results = []
    for p in pools:
        q_emb = emb_map[p["requirement"]]
        scored_candidates = []
        for c in p["candidates"]:
            e_emb = emb_map[c["evidence"]]
            score = cosine_similarity_pure(q_emb, e_emb)
            scored_candidates.append({
                "candidate_id": c["candidate_id"],
                "evidence_id": c["evidence_id"],
                "evidence": c["evidence"],
                "label": c["label"],
                "score": score,
            })

        # Deterministic tie-breaking: sort descending by score, then ascending by candidate_id
        scored_candidates.sort(key=lambda x: (-x["score"], x["candidate_id"]))
        metrics = compute_query_ranking_metrics(scored_candidates)

        case_results.append({
            "split": p["split"],
            "job_id": p["job_id"],
            "requirement_id": p["requirement_id"],
            "requirement": p["requirement"],
            "language": p["language"],
            "metrics": metrics,
            "ranked_candidates": scored_candidates,
        })

    return case_results


def run_experiment(
    semantic_path: Path | str,
    silver_path: Path | str,
    model_path: Path | str,
    output_dir: Path | str,
    total_steps: int = DEFAULT_STEPS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    seed: int = DEFAULT_SEED,
    lr: float = DEFAULT_LR,
    margin: float = DEFAULT_MARGIN,
    retention_weight: float = DEFAULT_RETENTION_WEIGHT,
    silver_ratio: float = DEFAULT_SILVER_RATIO,
    smoke: bool = False,
    skip_manifest: bool = False,
) -> Dict[str, Any]:
    """Orchestrate entire AI1 experiment across Arms A, B, C."""
    out_path = Path(output_dir).resolve()
    out_path.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("AI1 Kaggle Continuation Experiment Runner")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print(f"Steps: {total_steps}, Batch: {batch_size}, Seed: {seed}, Smoke: {smoke}")
    print("=" * 80)

    # 1. Load data
    print("Loading semantic dataset...")
    records = load_semantic_records(semantic_path)
    val_pools = build_restricted_candidate_pools(records, split="validation")
    test_pools = build_restricted_candidate_pools(records, split="test")
    old_train_comparisons = build_train_comparisons_from_semantic(records)

    print(f"Loaded {len(records)} semantic records.")
    print(f"Validation pools: {len(val_pools)}, Test pools: {len(test_pools)}")
    print(f"Old train pairwise comparisons: {len(old_train_comparisons)}")

    print("Loading silver comparisons...")
    raw_silver = load_silver_comparisons(silver_path)
    silver_comparisons = validate_silver_records(raw_silver)
    print(f"Loaded and validated {len(silver_comparisons)} silver comparisons (invariant verified).")

    # 2. Leakage verification
    val_rows = [r for r in records if r.get("split") == "validation"]
    test_rows = [r for r in records if r.get("split") == "test"]
    validate_no_leakage(old_train_comparisons, silver_comparisons, val_rows, test_rows)
    print("Leakage verification passed: zero overlap between train/silver and val/test.")

    # 3. Model setup
    if not smoke:
        try:
            import torch
            try:
                from transformers import AutoModel, AutoTokenizer
                has_transformers = True
            except ImportError:
                has_transformers = False
            if not has_transformers:
                from sentence_transformers import SentenceTransformer
        except ImportError as e:
            raise RuntimeError(
                "PyTorch and transformers required for real training. Pass --smoke for mock smoke testing."
            ) from e

        model_dir = Path(model_path).resolve()
        if not model_dir.exists() or not model_dir.is_dir():
            raise FileNotFoundError(f"Model path does not exist or is not a directory: {model_dir}")
        config_file = model_dir / "config.json"
        if not config_file.exists():
            raise FileNotFoundError(f"Model directory missing config.json: {model_dir}")
        safetensors = list(model_dir.glob("*.safetensors"))
        if not safetensors:
            raise FileNotFoundError(f"Model directory missing safetensors weights (*.safetensors): {model_dir}")
        bins = list(model_dir.glob("*.bin"))
        if bins:
            print("Notice: .bin weights ignored, offline safetensors only mode active.")

        device_str = "cuda" if torch.cuda.is_available() else "cpu"
        device = torch.device(device_str)
        print(f"PyTorch real training mode. Device: {device_str}")

        teacher = TransformerTextModel.from_pretrained(model_dir, device)
        teacher.eval()
        for p in teacher.parameters():
            p.requires_grad = False
    else:
        print("WARNING: SMOKE MODE ACTIVE. Using SyntheticMockEmbedder, no real training performed.")
        device_str = "cpu"
        device = None

    # Samplers for Arm B and Arm C
    batches_b, stats_b = deterministic_batch_sampler(
        old_comparisons=old_train_comparisons,
        silver_comparisons=None,
        total_steps=total_steps,
        batch_size=batch_size,
        seed=seed,
    )

    batches_c, stats_c = deterministic_batch_sampler(
        old_comparisons=old_train_comparisons,
        silver_comparisons=silver_comparisons,
        total_steps=total_steps,
        batch_size=batch_size,
        silver_ratio=silver_ratio,
        seed=seed,
    )

    # 4. Execute Arms
    arms_results: Dict[str, Any] = {}

    # Common evaluation function
    def evaluate_model(embedder: Any, pools: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        case_results = evaluate_pools_pure(pools, embedder)
        agg = aggregate_metrics(case_results)
        return agg, case_results

    # === ARM A: Frozen Baseline M1 ===
    print("\n--- Running Arm A: Frozen Baseline M1 ---")
    if not smoke:
        embedder_a = teacher
    else:
        embedder_a = SyntheticMockEmbedder(seed=seed)

    val_agg_a, _ = evaluate_model(embedder_a, val_pools)
    arms_results["Arm_A"] = {
        "description": "Frozen unchanged M1 retention checkpoint",
        "selected_step": 0,
        "val_job_macro_mrr": val_agg_a["macro_job"]["mrr"],
        "val_metrics": val_agg_a,
    }
    if smoke:
        arms_results["Arm_A"]["embedder"] = embedder_a
    print(f"Arm A Validation Job-Macro MRR: {val_agg_a['macro_job']['mrr']:.4f}")

    eval_checkpoints = sorted(set(s for s in EVAL_CHECKPOINT_STEPS if 0 < s <= total_steps) | {total_steps})

    # === ARM B: Continuation Old Train Only ===
    print("\n--- Running Arm B: Continuation Old Train Only ---")
    val_history_b: List[Dict[str, Any]] = [
        {
            "step": 0,
            "val_job_macro_mrr": val_agg_a["macro_job"]["mrr"],
            "metrics": val_agg_a,
            "checkpoint_path": None,
        }
    ]

    if not smoke:
        student_b = TransformerTextModel.from_pretrained(model_dir, device)
        student_b.train()
        optimizer_b = torch.optim.AdamW(student_b.parameters(), lr=lr, weight_decay=0.01)

        teacher_cache_b = build_teacher_cache(teacher, old_train_comparisons, batch_size=32)

        for step_idx, batch in enumerate(batches_b, start=1):
            reqs = [item["requirement"] for item in batch]
            pos_texts = [item["positive_evidence"] for item in batch]
            neg_texts = [item["negative_evidence"] for item in batch]
            batch_t_cache = get_batch_teacher_cache(teacher_cache_b, teacher, reqs, pos_texts, neg_texts)

            loss, r_loss, ret_loss = train_step_torch(
                student=student_b,
                teacher_cache=batch_t_cache,
                q_inputs=reqs,
                pos_inputs=pos_texts,
                neg_inputs=neg_texts,
                optimizer=optimizer_b,
                margin=margin,
                retention_weight=retention_weight,
            )

            if step_idx in eval_checkpoints:
                student_b.eval()
                step_agg, _ = evaluate_model(student_b, val_pools)
                ckpt_dir = out_path / "checkpoints" / "Arm_B" / f"step_{step_idx}"
                student_b.save_pretrained(ckpt_dir)
                val_history_b.append({
                    "step": step_idx,
                    "val_job_macro_mrr": step_agg["macro_job"]["mrr"],
                    "metrics": step_agg,
                    "checkpoint_path": str(ckpt_dir),
                })
                print(f"Arm B Step {step_idx}/{total_steps} - Loss: {loss:.4f} (Rank: {r_loss:.4f}, Ret: {ret_loss:.4f}) - Val MRR: {step_agg['macro_job']['mrr']:.4f}")
                student_b.train()

        selected_b = select_best_checkpoint(val_history_b)
        # Clean up Arm B training memory immediately
        del student_b, optimizer_b, teacher_cache_b
        cleanup_memory()
    else:
        for step in eval_checkpoints:
            step_embedder = SyntheticMockEmbedder(seed=seed + 1 + step)
            step_agg, _ = evaluate_model(step_embedder, val_pools)
            val_history_b.append({
                "step": step,
                "val_job_macro_mrr": step_agg["macro_job"]["mrr"],
                "metrics": step_agg,
                "checkpoint_path": None,
                "embedder": step_embedder,
            })
        selected_b = select_best_checkpoint(val_history_b)
        best_embedder_b = selected_b.get("embedder", embedder_a)

    arms_results["Arm_B"] = {
        "description": "Continuation training on old semantic train split only",
        "exposure_stats": stats_b,
        "val_history": [
            {
                "step": h["step"],
                "val_job_macro_mrr": h["val_job_macro_mrr"],
                "checkpoint_path": h.get("checkpoint_path"),
            }
            for h in val_history_b
        ],
        "selected_step": selected_b["step"],
        "val_job_macro_mrr": selected_b["val_job_macro_mrr"],
        "checkpoint_path": selected_b.get("checkpoint_path"),
    }
    if smoke:
        arms_results["Arm_B"]["embedder"] = best_embedder_b
    print(f"Arm B Selected Step: {selected_b['step']} (Val Job-Macro MRR: {selected_b['val_job_macro_mrr']:.4f})")

    # === ARM C: Continuation Old Train + 56 Silver Comparisons ===
    print("\n--- Running Arm C: Continuation Old Train + 56 Silver Comparisons ---")
    val_history_c: List[Dict[str, Any]] = [
        {
            "step": 0,
            "val_job_macro_mrr": val_agg_a["macro_job"]["mrr"],
            "metrics": val_agg_a,
            "checkpoint_path": None,
        }
    ]

    if not smoke:
        student_c = TransformerTextModel.from_pretrained(model_dir, device)
        student_c.train()
        optimizer_c = torch.optim.AdamW(student_c.parameters(), lr=lr, weight_decay=0.01)

        teacher_cache_c = build_teacher_cache(teacher, old_train_comparisons + silver_comparisons, batch_size=32)

        for step_idx, batch in enumerate(batches_c, start=1):
            reqs = [item["requirement"] for item in batch]
            pos_texts = [item["positive_evidence"] for item in batch]
            neg_texts = [item["negative_evidence"] for item in batch]
            batch_t_cache = get_batch_teacher_cache(teacher_cache_c, teacher, reqs, pos_texts, neg_texts)

            loss, r_loss, ret_loss = train_step_torch(
                student=student_c,
                teacher_cache=batch_t_cache,
                q_inputs=reqs,
                pos_inputs=pos_texts,
                neg_inputs=neg_texts,
                optimizer=optimizer_c,
                margin=margin,
                retention_weight=retention_weight,
            )

            if step_idx in eval_checkpoints:
                student_c.eval()
                step_agg, _ = evaluate_model(student_c, val_pools)
                ckpt_dir = out_path / "checkpoints" / "Arm_C" / f"step_{step_idx}"
                student_c.save_pretrained(ckpt_dir)
                val_history_c.append({
                    "step": step_idx,
                    "val_job_macro_mrr": step_agg["macro_job"]["mrr"],
                    "metrics": step_agg,
                    "checkpoint_path": str(ckpt_dir),
                })
                print(f"Arm C Step {step_idx}/{total_steps} - Loss: {loss:.4f} (Rank: {r_loss:.4f}, Ret: {ret_loss:.4f}) - Val MRR: {step_agg['macro_job']['mrr']:.4f}")
                student_c.train()

        selected_c = select_best_checkpoint(val_history_c)
        # Clean up Arm C training memory immediately
        del student_c, optimizer_c, teacher_cache_c
        cleanup_memory()
    else:
        for step in eval_checkpoints:
            step_embedder = SyntheticMockEmbedder(seed=seed + 2 + step)
            step_agg, _ = evaluate_model(step_embedder, val_pools)
            val_history_c.append({
                "step": step,
                "val_job_macro_mrr": step_agg["macro_job"]["mrr"],
                "metrics": step_agg,
                "checkpoint_path": None,
                "embedder": step_embedder,
            })
        selected_c = select_best_checkpoint(val_history_c)
        best_embedder_c = selected_c.get("embedder", embedder_a)

    arms_results["Arm_C"] = {
        "description": "Continuation training on old train + 56 silver comparisons (25% stated mixture)",
        "exposure_stats": stats_c,
        "val_history": [
            {
                "step": h["step"],
                "val_job_macro_mrr": h["val_job_macro_mrr"],
                "checkpoint_path": h.get("checkpoint_path"),
            }
            for h in val_history_c
        ],
        "selected_step": selected_c["step"],
        "val_job_macro_mrr": selected_c["val_job_macro_mrr"],
        "checkpoint_path": selected_c.get("checkpoint_path"),
    }
    if smoke:
        arms_results["Arm_C"]["embedder"] = best_embedder_c
    print(f"Arm C Selected Step: {selected_c['step']} (Val Job-Macro MRR: {selected_c['val_job_macro_mrr']:.4f})")
    print(f"Arm C Silver Exposures: {stats_c['silver']['unique_exposures']} unique, {stats_c['silver']['total_exposures']} total")

    # 5. Final Evaluation on TEST split (strictly after selection!)
    print("\n" + "=" * 80)
    print("Evaluating Selected Checkpoints on TEST Split")
    print("=" * 80)

    # Arm A evaluation
    if not smoke:
        test_results_a, test_cases_a = evaluate_model(teacher, test_pools)
    else:
        test_results_a, test_cases_a = evaluate_model(arms_results["Arm_A"]["embedder"], test_pools)

    # Arm B evaluation
    if not smoke:
        if selected_b["step"] == 0 or not selected_b.get("checkpoint_path"):
            test_results_b, test_cases_b = evaluate_model(teacher, test_pools)
        else:
            embedder_b = TransformerTextModel.from_pretrained(selected_b["checkpoint_path"], device)
            test_results_b, test_cases_b = evaluate_model(embedder_b, test_pools)
            del embedder_b
            cleanup_memory()
    else:
        test_results_b, test_cases_b = evaluate_model(arms_results["Arm_B"]["embedder"], test_pools)

    # Arm C evaluation
    if not smoke:
        if selected_c["step"] == 0 or not selected_c.get("checkpoint_path"):
            test_results_c, test_cases_c = evaluate_model(teacher, test_pools)
        else:
            embedder_c = TransformerTextModel.from_pretrained(selected_c["checkpoint_path"], device)
            test_results_c, test_cases_c = evaluate_model(embedder_c, test_pools)
            del embedder_c
            cleanup_memory()
    else:
        test_results_c, test_cases_c = evaluate_model(arms_results["Arm_C"]["embedder"], test_pools)

    # Paired job bootstrap C - A and C - B
    job_scores_a = {j: v["mrr"] for j, v in test_results_a.get("job_averages", {}).items()}
    job_scores_b = {j: v["mrr"] for j, v in test_results_b.get("job_averages", {}).items()}
    job_scores_c = {j: v["mrr"] for j, v in test_results_c.get("job_averages", {}).items()}

    boot_c_a = paired_job_bootstrap(job_scores_c, job_scores_a, n_resamples=1000, seed=seed)
    boot_c_b = paired_job_bootstrap(job_scores_c, job_scores_b, n_resamples=1000, seed=seed)

    print(f"Test Arm A Job-Macro MRR: {test_results_a['macro_job']['mrr']:.4f}")
    print(f"Test Arm B Job-Macro MRR: {test_results_b['macro_job']['mrr']:.4f}")
    print(f"Test Arm C Job-Macro MRR: {test_results_c['macro_job']['mrr']:.4f}")
    print(f"Bootstrap Delta (C - A): {boot_c_a['mean_delta']:+.4f} (95% CI: [{boot_c_a['ci_95_low']:+.4f}, {boot_c_a['ci_95_high']:+.4f}])")
    print(f"Bootstrap Delta (C - B): {boot_c_b['mean_delta']:+.4f} (95% CI: [{boot_c_b['ci_95_low']:+.4f}, {boot_c_b['ci_95_high']:+.4f}])")

    # Bilingual breakdown on test split
    en_cases_c = [c for c in test_cases_c if c["language"] == "en" and c["metrics"]["has_positive"]]
    vi_cases_c = [c for c in test_cases_c if c["language"] == "vi" and c["metrics"]["has_positive"]]
    en_mrr_c = sum(c["metrics"]["mrr"] for c in en_cases_c) / len(en_cases_c) if en_cases_c else None
    vi_mrr_c = sum(c["metrics"]["mrr"] for c in vi_cases_c) / len(vi_cases_c) if vi_cases_c else None

    # Clean embedder references before serialization
    for arm in arms_results.values():
        arm.pop("embedder", None)

    summary = {
        "status": "COMPLETED",
        "smoke_synthetic": smoke,
        "execution_mode": "SMOKE_SYNTHETIC" if smoke else "TORCH_REAL",
        "disclaimer": (
            "WARNING: SMOKE MODE ACTIVE (SYNTHETIC MOCK EMBEDDINGS). Using SyntheticMockEmbedder, no real training performed. "
            "Diagnostic evidence-ranking on restricted candidate pool only; not production within-CV or AI2."
            if smoke
            else "Diagnostic evidence-ranking on restricted candidate pool only; not production within-CV or AI2."
        ),
        "environment": {
            "platform": platform.platform(),
            "python_version": sys.version,
            "device": device_str,
            "smoke_mode": smoke,
        },
        "config": {
            "total_steps": total_steps,
            "batch_size": batch_size,
            "seed": seed,
            "learning_rate": lr,
            "margin": margin,
            "retention_weight": retention_weight,
            "silver_ratio": silver_ratio,
        },
        "selection_protocol": {
            "metric": "validation_job_macro_mrr",
            "baseline_step0_eligible": True,
            "tie_breaking": "prefer_earlier_step",
            "test_split_touched_during_selection": False,
        },
        "arms": arms_results,
        "test_evaluation": {
            "arm_a": {
                "micro": test_results_a["micro"],
                "macro_job": test_results_a["macro_job"],
            },
            "arm_b": {
                "micro": test_results_b["micro"],
                "macro_job": test_results_b["macro_job"],
            },
            "arm_c": {
                "micro": test_results_c["micro"],
                "macro_job": test_results_c["macro_job"],
                "bilingual": {
                    "en_mrr": en_mrr_c,
                    "vi_mrr": vi_mrr_c,
                    "en_count": len(en_cases_c),
                    "vi_count": len(vi_cases_c),
                },
            },
            "bootstrap_comparisons": {
                "delta_c_minus_a": boot_c_a,
                "delta_c_minus_b": boot_c_b,
            },
            "pool_distribution": test_results_c["pool_distribution"],
            "disclaimer": "Diagnostic evidence-ranking on restricted candidate pool only; not production within-CV or AI2.",
        },
    }

    # Save artifacts
    results_file = out_path / "experiment_results.json"
    with open(results_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    # Save test predictions for all arms
    for arm_code, test_cases_arm in [("arm_a", test_cases_a), ("arm_b", test_cases_b), ("arm_c", test_cases_c)]:
        preds_file_arm = out_path / f"test_predictions_{arm_code}.jsonl"
        with open(preds_file_arm, "w", encoding="utf-8") as f:
            for c in test_cases_arm:
                row = {
                    "arm": arm_code,
                    "job_id": c["job_id"],
                    "requirement_id": c["requirement_id"],
                    "language": c["language"],
                    "metrics": c["metrics"],
                    "ranked_candidates": [
                        {"candidate_id": rc["candidate_id"], "label": rc["label"], "score": rc["score"]}
                        for rc in c["ranked_candidates"]
                    ],
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Keep backward-compatible test_predictions.jsonl (pointing to arm_c)
    preds_file = out_path / "test_predictions.jsonl"
    with open(preds_file, "w", encoding="utf-8") as f:
        for c in test_cases_c:
            row = {
                "job_id": c["job_id"],
                "requirement_id": c["requirement_id"],
                "language": c["language"],
                "metrics": c["metrics"],
                "ranked_candidates": [
                    {"candidate_id": rc["candidate_id"], "label": rc["label"], "score": rc["score"]}
                    for rc in c["ranked_candidates"]
                ],
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"\nArtifacts saved successfully to: {out_path}")
    print(f"- Summary: {results_file}")
    print(f"- Predictions: {preds_file} (and test_predictions_arm_a/b/c.jsonl)")
    return summary


def main():
    parser = argparse.ArgumentParser(description="AI1 Kaggle Continuation Experiment Runner")
    parser.add_argument("--semantic", type=str, required=True, help="Path to semantic.jsonl")
    parser.add_argument("--silver", type=str, required=True, help="Path to silver_comparisons.jsonl")
    parser.add_argument("--model", type=str, required=True, help="Path to baseline model directory")
    parser.add_argument("--output", type=str, required=True, help="Directory to save experiment outputs")
    parser.add_argument("--steps", type=int, default=DEFAULT_STEPS, help="Update steps (default 155)")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Batch size (default 8)")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Random seed (default 42)")
    parser.add_argument("--lr", type=float, default=DEFAULT_LR, help="Learning rate (default 2e-5)")
    parser.add_argument("--margin", type=float, default=DEFAULT_MARGIN, help="Hinge margin (default 0.1)")
    parser.add_argument("--retention-weight", type=float, default=DEFAULT_RETENTION_WEIGHT, help="Retention weight (default 1.0)")
    parser.add_argument("--silver-ratio", type=float, default=DEFAULT_SILVER_RATIO, help="Silver slots ratio (default 0.25)")
    parser.add_argument("--smoke", action="store_true", help="Run tiny smoke test (no heavy GPU training)")
    parser.add_argument("--skip-manifest-check", action="store_true", help="Skip manifest verification")

    args = parser.parse_args()

    # If bundle root manifest check is requested
    if not args.skip_manifest_check:
        # Check if parent of semantic is bundle root with manifest.json
        p = Path(args.semantic).resolve()
        candidate_root = p.parent.parent
        if (candidate_root / "manifest.json").exists():
            verify_manifest(candidate_root)

    run_experiment(
        semantic_path=args.semantic,
        silver_path=args.silver,
        model_path=args.model,
        output_dir=args.output,
        total_steps=args.steps,
        batch_size=args.batch_size,
        seed=args.seed,
        lr=args.lr,
        margin=args.margin,
        retention_weight=args.retention_weight,
        silver_ratio=args.silver_ratio,
        smoke=args.smoke,
        skip_manifest=args.skip_manifest_check,
    )


if __name__ == "__main__":
    main()
