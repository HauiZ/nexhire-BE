#!/usr/bin/env python3
"""Offline AI1 dataset pilot builder.

Processes raw LLM JDs, baseline split anchors, and curated records
to export versioned AI1 evaluation and candidate artifacts.
"""

import argparse
import datetime
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

ALLOWED_SUPPORT_LABELS: Set[str] = {
    "full",
    "partial",
    "insufficient",
    "contradicted",
    "irrelevant",
}

ALLOWED_SOURCES: Set[str] = {
    "skill",
    "experience",
    "project",
    "education",
    "certification",
    "profile",
}

ALLOWED_NEGATIVE_TYPES: Set[str] = {
    "technology_mismatch",
    "training_only",
    "negation",
    "years_shortfall",
    "domain_mismatch",
    "unrelated",
    "partial_condition",
}

ALLOWED_SPLITS: Set[str] = {"train", "validation", "test"}
HELDOUT_SPLITS: Set[str] = {"test", "validation"}

SYNTHETIC_SILVER_CAVEAT: str = (
    "Dataset contains assistant-generated synthetic/silver data with pending "
    "human review. Not approved for final production training without verification."
)

NEAR_DUPLICATE_DISCLAIMER: str = (
    "Exact normalized description hashing detects exact identical text only. "
    "Hashes do not detect near duplicates, minor edits, or semantic paraphrases."
)

MINING_REPORT: str = (
    "No actual negative mining performed; candidate sections extracted directly "
    "from input artifacts."
)

BASELINE_DESCRIPTION_COVERAGE_CAVEAT: str = (
    "Semantic baseline file (semantic.jsonl) records splits and anchors but lacks "
    "job descriptions. Description matching and cross-dataset duplicate detection "
    "can only inspect baseline jobs whose descriptions are present in the raw "
    "dataset. Full cross-dataset textual duplicate check cannot be claimed for "
    "baseline jobs not present in raw."
)


def validate_ratios(train_ratio: float, val_ratio: float) -> None:
    """Validate finite ratios: 0 < train < 1, 0 <= val < 1, and train + val < 1."""
    if not (isinstance(train_ratio, (int, float)) and math.isfinite(train_ratio)):
        raise ValueError("train_ratio must be a finite number")
    if not (isinstance(val_ratio, (int, float)) and math.isfinite(val_ratio)):
        raise ValueError("val_ratio must be a finite number")
    if not (0.0 < train_ratio < 1.0):
        raise ValueError(f"train_ratio must satisfy 0 < train_ratio < 1, got {train_ratio}")
    if not (0.0 <= val_ratio < 1.0):
        raise ValueError(f"val_ratio must satisfy 0 <= val_ratio < 1, got {val_ratio}")
    if (train_ratio + val_ratio) >= 1.0:
        raise ValueError(
            f"Split ratios must satisfy train_ratio + val_ratio < 1.0, got {train_ratio + val_ratio}"
        )


def compute_file_sha256(filepath: str) -> str:
    """Compute sha256 hex digest of a file in streaming chunks."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def normalize_description(text: Optional[str]) -> str:
    """Normalize JD description for exact duplicate detection."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def assign_deterministic_split(
    norm_desc: str,
    seed: int,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> str:
    """Deterministic split for new jobs using description hash."""
    seed_str = f"{seed}:{norm_desc}"
    digest = hashlib.sha256(seed_str.encode("utf-8")).hexdigest()
    val = int(digest[:8], 16) / 0xFFFFFFFF
    if val < train_ratio:
        return "train"
    elif val < (train_ratio + val_ratio):
        return "validation"
    else:
        return "test"


def load_raw_dataset(raw_path: str) -> Dict[str, Dict[str, Any]]:
    """Load raw dataset JSON and index by string job_id.

    Rejects missing/empty IDs, duplicate raw IDs, and empty/missing descriptions.
    """
    with open(raw_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Raw dataset must be a JSON array of job records")

    raw_jobs: Dict[str, Dict[str, Any]] = {}
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            raise ValueError(f"Raw dataset item at index {idx} must be a dictionary")

        raw_jid = item.get("job_id")
        if raw_jid is None:
            raise ValueError(f"Missing job_id in raw dataset item {idx}")
        jid = str(raw_jid).strip()
        if not jid:
            raise ValueError(f"Empty job_id in raw dataset item {idx}")

        if jid in raw_jobs:
            raise ValueError(f"Duplicate raw job_id found: '{jid}'")

        raw_desc = item.get("description")
        if raw_desc is None or not str(raw_desc).strip():
            raise ValueError(f"Missing or empty description for raw job_id '{jid}'")

        raw_jobs[jid] = item
    return raw_jobs


def load_baseline_splits(baseline_path: str) -> Tuple[Dict[str, str], int]:
    """Load baseline job splits from JSONL.

    Rejects missing/empty IDs, invalid baseline splits, and conflicting splits.
    """
    baseline_splits: Dict[str, str] = {}
    total_records = 0

    with open(baseline_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            total_records += 1
            obj = json.loads(line)
            if not isinstance(obj, dict):
                raise ValueError(f"Baseline line {line_num} must be a dictionary")

            raw_jid = obj.get("job_id")
            if raw_jid is None:
                raise ValueError(f"Missing job_id in baseline at line {line_num}")
            jid = str(raw_jid).strip()
            if not jid:
                raise ValueError(f"Empty job_id in baseline at line {line_num}")

            raw_split = obj.get("split")
            if raw_split is None:
                raise ValueError(f"Missing split in baseline at line {line_num}")
            split = str(raw_split).strip()
            if split not in ALLOWED_SPLITS:
                raise ValueError(
                    f"Invalid split '{split}' in baseline for job_id '{jid}' at line {line_num}. "
                    f"Allowed: {sorted(ALLOWED_SPLITS)}"
                )

            if jid in baseline_splits and baseline_splits[jid] != split:
                raise ValueError(
                    f"Conflicting splits in baseline for job_id '{jid}': "
                    f"'{baseline_splits[jid]}' vs '{split}' at line {line_num}"
                )
            baseline_splits[jid] = split

    return baseline_splits, total_records


def resolve_job_splits(
    raw_jobs: Dict[str, Dict[str, Any]],
    baseline_splits: Dict[str, str],
    seed: int,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """Resolve splits for all raw jobs.

    - Preserves existing baseline splits.
    - Rejects conflicting old splits sharing normalized description.
    - Exact normalized duplicates share the same split.
    - Deterministic hashing for unanchored jobs.
    - Rejects attempts to train known heldout sources.
    """
    validate_ratios(train_ratio, val_ratio)

    desc_to_jobs: Dict[str, List[str]] = defaultdict(list)
    for jid, job in raw_jobs.items():
        norm_desc = normalize_description(job.get("description", ""))
        desc_to_jobs[norm_desc].append(jid)

    resolved_splits: Dict[str, str] = {}
    exact_matches_with_baseline: List[Dict[str, Any]] = []
    baseline_anchored_count = 0
    new_jobs_count = 0

    for norm_desc, job_ids in desc_to_jobs.items():
        baseline_group_splits = {
            jid: baseline_splits[jid]
            for jid in job_ids
            if jid in baseline_splits
        }

        unique_old_splits = set(baseline_group_splits.values())
        if len(unique_old_splits) > 1:
            raise ValueError(
                f"Conflicting old splits sharing description for jobs {job_ids}: "
                f"{unique_old_splits}"
            )

        if unique_old_splits:
            target_split = unique_old_splits.pop()
            for jid in job_ids:
                if jid in baseline_splits and baseline_splits[jid] in HELDOUT_SPLITS:
                    if target_split == "train":
                        raise ValueError(
                            f"Attempted to train known heldout source '{jid}'"
                        )
                resolved_splits[jid] = target_split
                if jid in baseline_group_splits:
                    baseline_anchored_count += 1
                else:
                    new_jobs_count += 1
                    exact_matches_with_baseline.append(
                        {
                            "job_id": jid,
                            "inherited_split": target_split,
                            "matched_baseline_jobs": [
                                k for k in baseline_group_splits.keys()
                            ],
                        }
                    )
        else:
            target_split = assign_deterministic_split(
                norm_desc=norm_desc,
                seed=seed,
                train_ratio=train_ratio,
                val_ratio=val_ratio,
            )
            for jid in job_ids:
                resolved_splits[jid] = target_split
                new_jobs_count += 1

    # Record remaining baseline jobs
    for jid, sp in baseline_splits.items():
        if jid not in resolved_splits:
            resolved_splits[jid] = sp

    baseline_jobs_in_raw_count = len(set(baseline_splits.keys()) & set(raw_jobs.keys()))
    baseline_jobs_missing_from_raw = len(baseline_splits) - baseline_jobs_in_raw_count

    leakage_report = {
        "exact_matches_with_baseline_count": len(exact_matches_with_baseline),
        "exact_matches_with_baseline": exact_matches_with_baseline,
        "baseline_anchored_jobs_in_raw": baseline_anchored_count,
        "new_jobs_in_raw": new_jobs_count,
        "unique_normalized_descriptions": len(desc_to_jobs),
        "duplicate_description_groups": sum(
            1 for v in desc_to_jobs.values() if len(v) > 1
        ),
        "baseline_total_jobs": len(baseline_splits),
        "baseline_jobs_in_raw_with_description": baseline_jobs_in_raw_count,
        "baseline_jobs_missing_from_raw": baseline_jobs_missing_from_raw,
        "baseline_description_coverage_caveat": BASELINE_DESCRIPTION_COVERAGE_CAVEAT,
        "near_duplicate_disclaimer": NEAR_DUPLICATE_DISCLAIMER,
        "mining_performed": False,
        "mining_report": MINING_REPORT,
    }

    return resolved_splits, leakage_report


def validate_and_process_curated(
    curated_path: str,
    raw_jobs: Dict[str, Dict[str, Any]],
    job_splits: Dict[str, str],
) -> Tuple[
    List[Dict[str, Any]],
    List[Dict[str, Any]],
    List[Dict[str, Any]],
    int,
    Counter,
]:
    """Validate curated records and build documents, pairs, and comparison candidates.

    Hardened against malformed types and ensures unapproved training flags are rejected.
    """
    documents_dict: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    pairs: List[Dict[str, Any]] = []
    seen_pair_ids: Set[str] = set()
    # (job_id, query) -> list of (support_label, section, curated_record)
    query_sections: Dict[Tuple[str, str], List[Tuple[str, Dict[str, Any], Dict[str, Any]]]] = defaultdict(list)

    total_curated_records = 0
    support_label_counts: Counter = Counter()

    with open(curated_path, "r", encoding="utf-8") as f:
        for line_idx, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            total_curated_records += 1
            record = json.loads(line)

            if not isinstance(record, dict):
                raise ValueError(f"Curated record must be a dictionary at line {line_idx}")

            # Reject any attempt to mark approved training
            if record.get("approved_for_training") is True:
                raise ValueError(
                    f"Curated records cannot have approved_for_training=True at line {line_idx}"
                )
            if record.get("review_status") == "approved_training":
                raise ValueError(
                    f"Curated records cannot claim review_status='approved_training' at line {line_idx}"
                )

            for req_field in [
                "job_id",
                "requirement_index",
                "requirement_original",
                "query",
                "query_note",
                "cv_id",
                "sections",
                "provenance",
            ]:
                if req_field not in record:
                    raise ValueError(f"Missing required field '{req_field}' at line {line_idx}")

            raw_jid = record["job_id"]
            if not isinstance(raw_jid, str) or not raw_jid.strip():
                raise ValueError(f"job_id must be a non-empty string at line {line_idx}")
            jid = raw_jid.strip()

            if jid not in raw_jobs:
                raise ValueError(f"Unknown job_id '{jid}' in curated line {line_idx}")

            raw_job = raw_jobs[jid]
            raw_reqs = raw_job.get("response", {}).get("extracted_jd_requirements", [])
            req_idx = record["requirement_index"]
            if not isinstance(req_idx, int) or isinstance(req_idx, bool) or req_idx < 0 or req_idx >= len(raw_reqs):
                raise IndexError(
                    f"Requirement index {req_idx} out of bounds (0..{len(raw_reqs)-1}) "
                    f"for job '{jid}' at line {line_idx}"
                )

            req_orig = record["requirement_original"]
            if not isinstance(req_orig, str):
                raise ValueError(f"requirement_original must be a string at line {line_idx}")
            expected_original = raw_reqs[req_idx]
            if req_orig != expected_original:
                raise ValueError(
                    f"Invalid original quote for job '{jid}' index {req_idx}: "
                    f"expected '{expected_original}', got '{req_orig}'"
                )

            query = record["query"]
            if not isinstance(query, str) or not query.strip():
                raise ValueError(f"query must be a non-empty string at line {line_idx}")

            cv_id_raw = record["cv_id"]
            if not isinstance(cv_id_raw, str) or not cv_id_raw.strip():
                raise ValueError(f"cv_id must be a non-empty string at line {line_idx}")
            cv_id = cv_id_raw.strip()

            # Validate provenance
            provenance = record.get("provenance")
            if not isinstance(provenance, dict):
                raise ValueError(f"Provenance must be a dict at line {line_idx}")
            if provenance.get("kind") != "assistant_synthetic":
                raise ValueError(
                    f"Invalid provenance.kind '{provenance.get('kind')}' at line {line_idx}. "
                    "Expected 'assistant_synthetic'"
                )
            if provenance.get("review_status") != "pending_human_review":
                raise ValueError(
                    f"Invalid provenance.review_status '{provenance.get('review_status')}' at line {line_idx}. "
                    "Expected 'pending_human_review'"
                )
            author = provenance.get("author")
            if not isinstance(author, str) or not author.strip():
                raise ValueError(f"Missing or non-string provenance.author at line {line_idx}")

            sections = record.get("sections")
            if not isinstance(sections, list) or not sections:
                raise ValueError(f"Sections must be a non-empty list at line {line_idx}")

            seen_evidence_ids_in_record: Set[str] = set()
            if jid not in job_splits:
                raise ValueError(f"Missing split for job_id '{jid}'")
            job_split = job_splits[jid]

            for s_idx, sec in enumerate(sections):
                if not isinstance(sec, dict):
                    raise ValueError(f"Section {s_idx} must be a dictionary at line {line_idx}")

                if sec.get("approved_for_training") is True:
                    raise ValueError(
                        f"Section cannot be approved for training at line {line_idx}"
                    )

                raw_ev = sec.get("evidence_id")
                if not isinstance(raw_ev, str) or not raw_ev.strip():
                    raise ValueError(f"Missing or empty evidence_id in section {s_idx} at line {line_idx}")
                ev_id = raw_ev.strip()

                if ev_id in seen_evidence_ids_in_record:
                    raise ValueError(
                        f"Duplicate evidence_id '{ev_id}' in curated record for job "
                        f"'{jid}', cv '{cv_id}' at line {line_idx}"
                    )
                seen_evidence_ids_in_record.add(ev_id)

                source = sec.get("source")
                if not isinstance(source, str) or source not in ALLOWED_SOURCES:
                    raise ValueError(
                        f"Invalid source '{source}' at line {line_idx}. "
                        f"Allowed: {sorted(ALLOWED_SOURCES)}"
                    )

                label = sec.get("support_label")
                if not isinstance(label, str) or label not in ALLOWED_SUPPORT_LABELS:
                    raise ValueError(
                        f"Invalid support_label '{label}' at line {line_idx}. "
                        f"Allowed: {sorted(ALLOWED_SUPPORT_LABELS)}"
                    )
                support_label_counts[label] += 1

                neg_type = sec.get("negative_type")
                if neg_type is not None and (not isinstance(neg_type, str) or neg_type not in ALLOWED_NEGATIVE_TYPES):
                    raise ValueError(
                        f"Invalid negative_type '{neg_type}' at line {line_idx}. "
                        f"Allowed: {sorted(ALLOWED_NEGATIVE_TYPES)} or null"
                    )

                text = sec.get("text")
                if not isinstance(text, str) or not text.strip():
                    raise ValueError(f"Missing or non-string text in section {s_idx} at line {line_idx}")

                # Register document retaining original fields/source and provenance
                doc_key = (jid, cv_id, ev_id)
                if doc_key in documents_dict:
                    existing = documents_dict[doc_key]
                    if existing["text"] != text or existing["source"] != source:
                        raise ValueError(
                            f"Duplicate IDs with conflicting content for "
                            f"job '{jid}', cv '{cv_id}', evidence '{ev_id}'"
                        )
                else:
                    doc = dict(sec)
                    doc.pop("support_label", None)
                    doc.pop("negative_type", None)
                    doc["document_id"] = ev_id
                    doc["evidence_id"] = ev_id
                    doc["job_id"] = jid
                    doc["cv_id"] = cv_id
                    doc["source"] = source
                    doc["text"] = text
                    doc["split"] = job_split
                    doc["provenance"] = provenance
                    documents_dict[doc_key] = doc

                # Register pair with deterministic hash of structured identity tuple
                pair_identity = (jid, cv_id, req_idx, query, ev_id)
                pair_id = hashlib.sha256(
                    json.dumps(pair_identity, ensure_ascii=False).encode("utf-8")
                ).hexdigest()
                if pair_id in seen_pair_ids:
                    raise ValueError(
                        f"Duplicate pair ID '{pair_id}' for identity {pair_identity} at line {line_idx}"
                    )
                seen_pair_ids.add(pair_id)

                pair_record = {
                    "pair_id": pair_id,
                    "job_id": jid,
                    "cv_id": cv_id,
                    "requirement_index": req_idx,
                    "requirement_original": req_orig,
                    "query": query,
                    "query_note": record.get("query_note"),
                    "evidence_id": ev_id,
                    "source": source,
                    "evidence_source": source,
                    "text": text,
                    "evidence": text,
                    "support_label": label,
                    "negative_type": neg_type,
                    "split": job_split,
                    "provenance": provenance,
                    "review_status": "pending_human_review",
                    "approved_for_training": False,
                }
                pairs.append(pair_record)

                # Collect comparison candidate members
                if label == "full":
                    query_sections[(jid, query)].append(("full", sec, record))
                elif label in ("contradicted", "irrelevant"):
                    query_sections[(jid, query)].append((label, sec, record))

    # Generate comparison candidates
    comparison_candidates: List[Dict[str, Any]] = []
    seen_comparisons: Set[str] = set()

    for (jid, query), pool in query_sections.items():
        positives = [item for item in pool if item[0] == "full"]
        negatives = [item for item in pool if item[0] in ("contradicted", "irrelevant")]

        if jid not in job_splits:
            raise ValueError(f"Missing split for job_id '{jid}'")
        job_split = job_splits[jid]

        for _, pos_sec, pos_rec in positives:
            pos_cv = str(pos_rec["cv_id"])
            pos_ev = str(pos_sec["evidence_id"])
            pos_req_idx = pos_rec["requirement_index"]

            for neg_label, neg_sec, neg_rec in negatives:
                neg_cv = str(neg_rec["cv_id"])
                neg_ev = str(neg_sec["evidence_id"])
                neg_req_idx = neg_rec["requirement_index"]

                if pos_cv == neg_cv:
                    continue

                comp_identity = (
                    jid,
                    query,
                    pos_req_idx,
                    neg_req_idx,
                    pos_cv,
                    pos_ev,
                    neg_cv,
                    neg_ev,
                )
                comp_id = hashlib.sha256(
                    json.dumps(comp_identity, ensure_ascii=False).encode("utf-8")
                ).hexdigest()
                if comp_id in seen_comparisons:
                    continue
                seen_comparisons.add(comp_id)

                candidate_record = {
                    "comparison_id": comp_id,
                    "job_id": jid,
                    "query": query,
                    "requirement_index": pos_rec["requirement_index"],
                    "requirement_original": pos_rec["requirement_original"],
                    "split": job_split,
                    "positive": {
                        "cv_id": pos_cv,
                        "evidence_id": pos_ev,
                        "source": pos_sec["source"],
                        "text": pos_sec["text"],
                        "support_label": "full",
                        "negative_type": None,
                    },
                    "negative": {
                        "cv_id": neg_cv,
                        "evidence_id": neg_ev,
                        "source": neg_sec["source"],
                        "text": neg_sec["text"],
                        "support_label": neg_label,
                        "negative_type": neg_sec.get("negative_type"),
                    },
                    "positive_cv_id": pos_cv,
                    "positive_evidence_id": pos_ev,
                    "positive_text": pos_sec["text"],
                    "positive_source": pos_sec["source"],
                    "negative_cv_id": neg_cv,
                    "negative_evidence_id": neg_ev,
                    "negative_text": neg_sec["text"],
                    "negative_source": neg_sec["source"],
                    "negative_support_label": neg_label,
                    "negative_type": neg_sec.get("negative_type"),
                    "review_status": "pending_human_review",
                    "approved_for_training": False,
                    "provenance": {
                        "kind": "assistant_synthetic",
                        "review_status": "pending_human_review",
                        "author": pos_rec.get("provenance", {}).get(
                            "author", "ai1_dataset_v2"
                        ),
                    },
                }
                comparison_candidates.append(candidate_record)

    documents = list(documents_dict.values())
    return documents, pairs, comparison_candidates, total_curated_records, support_label_counts


def build_ai1_dataset(
    raw_path: str,
    baseline_path: str,
    curated_path: str,
    output_dir: str,
    seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Dict[str, Any]:
    """Execute complete dataset build pipeline."""
    validate_ratios(train_ratio, val_ratio)

    if os.path.exists(output_dir):
        raise FileExistsError(f"Output directory already exists: {output_dir}")

    raw_jobs = load_raw_dataset(raw_path)
    baseline_splits, total_baseline_records = load_baseline_splits(baseline_path)

    job_splits, leakage_report = resolve_job_splits(
        raw_jobs=raw_jobs,
        baseline_splits=baseline_splits,
        seed=seed,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
    )

    documents, pairs, comparison_candidates, total_curated_records, support_label_counts = (
        validate_and_process_curated(
            curated_path=curated_path,
            raw_jobs=raw_jobs,
            job_splits=job_splits,
        )
    )

    input_checksums = {
        "raw": compute_file_sha256(raw_path),
        "baseline": compute_file_sha256(baseline_path),
        "curated": compute_file_sha256(curated_path),
    }

    split_counts: Counter = Counter()
    for doc in documents:
        split_counts[doc["split"]] += 1

    counts = {
        "raw_jobs": len(raw_jobs),
        "baseline_records": total_baseline_records,
        "curated_records": total_curated_records,
        "documents": len(documents),
        "pairs": len(pairs),
        "comparison_candidates": len(comparison_candidates),
        "support_labels": dict(support_label_counts),
        "documents_by_split": dict(split_counts),
    }

    job_splits_distribution: Counter = Counter(job_splits.values())

    split_info = {
        "counts_by_split": dict(job_splits_distribution),
        "ratios": {
            "train": train_ratio,
            "validation": val_ratio,
            "test": round(1.0 - train_ratio - val_ratio, 4),
        },
        "strategy": "baseline_preserved_then_normalized_description_hash",
        "job_splits": job_splits,
    }

    manifest = {
        "dataset_name": "ai1_dataset_v2_pilot",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "seed": seed,
        "input_checksums": input_checksums,
        "counts": counts,
        "split_info": split_info,
        "synthetic_silver_caveat": SYNTHETIC_SILVER_CAVEAT,
        "leakage_report": leakage_report,
        "review_status": "pending_human_review",
        "approved_for_training": False,
    }

    os.makedirs(output_dir, exist_ok=False)

    docs_file = os.path.join(output_dir, "documents.jsonl")
    with open(docs_file, "w", encoding="utf-8") as f:
        for doc in documents:
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")

    pairs_file = os.path.join(output_dir, "pairs.jsonl")
    with open(pairs_file, "w", encoding="utf-8") as f:
        for pair in pairs:
            f.write(json.dumps(pair, ensure_ascii=False) + "\n")

    comp_file = os.path.join(output_dir, "comparison_candidates.jsonl")
    with open(comp_file, "w", encoding="utf-8") as f:
        for cand in comparison_candidates:
            f.write(json.dumps(cand, ensure_ascii=False) + "\n")

    leakage_file = os.path.join(output_dir, "leakage_report.json")
    with open(leakage_file, "w", encoding="utf-8") as f:
        json.dump(leakage_report, f, indent=2, ensure_ascii=False)

    manifest_file = os.path.join(output_dir, "manifest.json")
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    return manifest


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Offline AI1 dataset pilot builder",
    )
    parser.add_argument("--raw", required=True, help="Path to raw LLM dataset JSON")
    parser.add_argument(
        "--baseline",
        required=True,
        help="Path to baseline anchors semantic.jsonl",
    )
    parser.add_argument(
        "--curated",
        required=True,
        help="Path to curated JSONL input",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to output directory (must not exist)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for deterministic hashing (default: 42)",
    )
    parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.8,
        help="Train split ratio (default: 0.8)",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.1,
        help="Validation split ratio (default: 0.1)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    """CLI entrypoint."""
    args = parse_args(argv)
    try:
        manifest = build_ai1_dataset(
            raw_path=args.raw,
            baseline_path=args.baseline,
            curated_path=args.curated,
            output_dir=args.output,
            seed=args.seed,
            train_ratio=args.train_ratio,
            val_ratio=args.val_ratio,
        )
        print(f"Dataset successfully built in {args.output}")
        print(f"Documents: {manifest['counts']['documents']}")
        print(f"Pairs: {manifest['counts']['pairs']}")
        print(f"Comparison candidates: {manifest['counts']['comparison_candidates']}")
        return 0
    except FileExistsError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error building dataset: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
