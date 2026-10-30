#!/usr/bin/env python3
"""Evaluation-only script for existing AI1 Kaggle checkpoints without retraining.

Strict evaluation-only runner:
- Reuses existing trained checkpoints from experiment_results.json and checkpoint dir
- Evaluates Arms A (baseline step 0), B (selected step from summary/dir), C (selected step from summary/dir)
- Evaluates the same frozen restricted candidate pool across all arms
- Resolves candidate ambiguity via unique evidence identity (candidate_id::evidence_id::record_id)
- Computes micro and macro_job MRR, Hit@1, Hit@3, Recall@1, Recall@3 (all queries, mixed-only, positive-only, no-positive)
- Computes pairwise positive-vs-negative ordering and tracks tie counts
- Computes paired JD bootstrap deltas C - A and C - B
- Exports per-arm per-query candidate ranking with full provenance and file hashes
- Explicitly labels all test analyses as post-hoc diagnostics, NOT selection criteria
- Fails closed on path traversal, symlinks, missing checkpoints (no fallback), non-finite scores, or output collisions
"""

import argparse
import copy
from collections import defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import re
import sys
import unicodedata
import zipfile
from typing import Any, Dict, List, Optional, Set, Tuple


# ==============================================================================
# Custom Exceptions (Fail-closed)
# ==============================================================================

class RefuseOverwriteError(Exception):
    """Raised when output directory exists and is not empty."""
    pass


class SmokeExperimentError(Exception):
    """Raised when experiment_results.json represents a smoke/synthetic run."""
    pass


class MissingCheckpointError(Exception):
    """Raised when a selected checkpoint directory does not exist on disk."""
    pass


class PathTraversalError(Exception):
    """Raised when a path traverses outside allowed boundaries or contains symlinks."""
    pass


class NonFiniteScoreError(Exception):
    """Raised when cosine similarity calculation results in non-finite value."""
    pass


class CheckpointValidationError(Exception):
    """Raised when checkpoint metadata or layout violates strict selection rules."""
    pass


class SafeArchiveError(Exception):
    """Raised when archive extraction violates strict safety rules."""
    pass


# ==============================================================================
# Safe Archive Extraction & Recovery
# ==============================================================================

ALLOWED_ARCHIVE_EXTENSIONS = {
    ".json", ".jsonl", ".safetensors", ".txt", ".bin", ".pt", ".pth", ".md"
}

ALLOWED_ARCHIVE_NAMES = {
    "experiment_results.json",
    "test_predictions.jsonl",
    "config.json",
    "model.safetensors",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
    "sentence_bert_config.json",
    "modules.json",
    "config_sentence_transformers.json",
}

MAX_ARCHIVE_ENTRIES = 1000
MAX_ENTRY_SIZE_BYTES = 500 * 1024 * 1024  # 500 MiB for model weights
MAX_TOTAL_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB


def safe_extract_results_archive(
    archive_path: Path | str,
    target_dir: Path | str,
) -> Path:
    """Safely extract results archive into target_dir with strict safety guarantees.

    Guarantees:
    - target_dir must be a fresh empty directory
    - Rejects absolute paths, '..', backslashes, symlinks, duplicate member names
    - Enforces allowlist on file extensions/names
    - Enforces entry count and size limits
    - Never executes any code from archive
    """
    arc = Path(archive_path).resolve()
    if not arc.exists() or not arc.is_file():
        raise FileNotFoundError(f"Archive file not found: {arc}")

    out_p = Path(target_dir).resolve()
    if out_p.exists() and any(out_p.iterdir()):
        raise SafeArchiveError(f"Target directory for archive extraction is not empty: {out_p}")
    out_p.mkdir(parents=True, exist_ok=True)

    if not zipfile.is_zipfile(arc):
        raise SafeArchiveError(f"File is not a valid zip archive: {arc}")

    with zipfile.ZipFile(arc, "r") as zf:
        infolist = zf.infolist()
        if len(infolist) > MAX_ARCHIVE_ENTRIES:
            raise SafeArchiveError(f"Archive exceeds maximum entries limit: {len(infolist)} > {MAX_ARCHIVE_ENTRIES}")

        seen_names: Set[str] = set()
        total_extracted_bytes = 0

        for member in infolist:
            name = member.filename

            # Reject backslashes
            if "\\" in name:
                raise SafeArchiveError(f"Rejected archive member with backslash: {name}")

            # Reject absolute paths or path traversal
            member_path = Path(name)
            if member_path.is_absolute() or ".." in member_path.parts:
                raise SafeArchiveError(f"Path traversal detected in archive member: {name}")

            # Reject duplicates
            norm_name = str(member_path)
            if norm_name in seen_names:
                raise SafeArchiveError(f"Duplicate archive member detected: {name}")
            seen_names.add(norm_name)

            # Check symlink attributes
            # In zip format, symlinks have mode attribute with S_IFLNK (0o120000)
            mode = member.external_attr >> 16
            if mode & 0o170000 == 0o120000:
                raise SafeArchiveError(f"Symlink detected in archive member: {name}")

            if member.is_dir():
                continue

            # Check entry size
            if member.file_size > MAX_ENTRY_SIZE_BYTES:
                raise SafeArchiveError(
                    f"Member size exceeds limit: {member.file_size} > {MAX_ENTRY_SIZE_BYTES} ({name})"
                )
            total_extracted_bytes += member.file_size
            if total_extracted_bytes > MAX_TOTAL_EXTRACTED_BYTES:
                raise SafeArchiveError(
                    f"Total uncompressed size exceeds limit: {total_extracted_bytes} > {MAX_TOTAL_EXTRACTED_BYTES}"
                )

            # Check allowlist
            suffix = member_path.suffix.lower()
            if suffix not in ALLOWED_ARCHIVE_EXTENSIONS:
                raise SafeArchiveError(
                    f"Archive member '{name}' has disallowed extension '{suffix}'"
                )

            dest_file = (out_p / member_path).resolve()
            try:
                dest_file.relative_to(out_p)
            except ValueError:
                raise SafeArchiveError(f"Archive member extracts outside target directory: {dest_file}")

            # Double check destination isn't a symlink
            if dest_file.is_symlink():
                raise SafeArchiveError(f"Destination path is a symlink: {dest_file}")

            dest_file.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, open(dest_file, "wb") as dst:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)

    return out_p


# ==============================================================================
# Hashing & File Integrity
# ==============================================================================

def compute_sha256(filepath: Path | str) -> str:
    """Compute sha256 hex digest of a file in streaming chunks. Rejects symlinks."""
    p = Path(filepath).resolve()
    if p.is_symlink():
        raise PathTraversalError(f"Refusing to compute SHA-256 on symlink: {p}")
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def directory_sha256_manifest(dirpath: Path | str) -> Dict[str, str]:
    """Compute relative path -> sha256 mapping for all regular files in a directory.

    Rejects symlinks anywhere in directory tree.
    """
    p = Path(dirpath).resolve()
    manifest: Dict[str, str] = {}
    if not p.is_dir():
        return manifest
    for file_p in sorted(p.rglob("*")):
        if file_p.is_symlink():
            raise PathTraversalError(f"Symlink rejected in directory tree: {file_p}")
        if file_p.is_file():
            rel_str = str(file_p.relative_to(p))
            manifest[rel_str] = compute_sha256(file_p)
    return manifest


def verify_bundle_manifest(bundle_root: Path | str) -> Dict[str, Any]:
    """Verify all artifacts in bundle manifest.json. Fails closed on mismatch, symlink, or unexpected file."""
    root = Path(bundle_root).resolve()
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing manifest.json in bundle root: {root}")
    if manifest_path.is_symlink():
        raise PathTraversalError(f"manifest.json cannot be a symlink: {manifest_path}")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    artifacts = manifest.get("artifacts", {})
    if not artifacts:
        raise ValueError("Empty or invalid artifacts in manifest.json")

    for rel_path, expected_sha in artifacts.items():
        # Validate rel_path structure: no leading slash, no '..', no backslash
        if "\\" in rel_path:
            raise PathTraversalError(f"Backslash in manifest path: {rel_path}")
        p_rel = Path(rel_path)
        if p_rel.is_absolute() or ".." in p_rel.parts:
            raise PathTraversalError(f"Path traversal in manifest artifact: {rel_path}")

        artifact_path = (root / p_rel).resolve()
        try:
            artifact_path.relative_to(root)
        except ValueError:
            raise PathTraversalError(f"Manifest artifact traverses outside bundle root: {rel_path}")

        if not artifact_path.exists():
            raise FileNotFoundError(f"Artifact listed in manifest missing on disk: {rel_path}")
        if artifact_path.is_symlink():
            raise PathTraversalError(f"Symlink rejected for manifest artifact: {rel_path}")

        actual_sha = compute_sha256(artifact_path)
        if actual_sha != expected_sha:
            raise ValueError(f"SHA-256 mismatch for artifact '{rel_path}': expected {expected_sha}, got {actual_sha}")

    for p in root.rglob("*"):
        if p.is_symlink():
            raise PathTraversalError(f"Symlink detected in bundle directory: {p}")
        if p.is_file():
            rel = str(p.relative_to(root))
            if rel == "manifest.json" or rel.startswith("."):
                continue
            if rel not in artifacts:
                raise ValueError(f"Unexpected file not listed in manifest: {rel}")

    return manifest


# ==============================================================================
# Summary Loading & Checkpoint Resolution
# ==============================================================================

def load_experiment_results(summary_path: Path | str) -> Dict[str, Any]:
    """Load experiment_results.json, validating completion and refusing smoke summaries."""
    p = Path(summary_path).resolve()
    if p.is_symlink():
        raise PathTraversalError(f"Symlink rejected for summary file: {p}")
    if not p.exists():
        raise FileNotFoundError(f"experiment_results.json not found at: {p}")

    with open(p, "r", encoding="utf-8") as f:
        summary = json.load(f)

    if summary.get("status") != "COMPLETED":
        raise ValueError(f"Experiment status is '{summary.get('status')}', not COMPLETED.")

    if summary.get("smoke_synthetic") is True or summary.get("execution_mode") == "SMOKE_SYNTHETIC":
        raise SmokeExperimentError(
            "Refusing smoke experiment: evaluation-only runner requires real trained checkpoints."
        )

    if "arms" not in summary:
        raise ValueError("Missing 'arms' section in experiment_results.json.")

    return summary


def resolve_arm_checkpoint_target(
    arm_name: str,
    arm_summary: Dict[str, Any],
    experiment_dir: Path,
    base_model_dir: Path,
) -> Tuple[int, Path, str]:
    """Resolve (selected_step, resolved_path, source_desc) for an arm with strict cross-checks.

    Rules:
    - Arm_A: must be step 0, resolves to base bundle model
    - Arm_B / Arm_C:
        * selected_step must be an integer >= 0
        * cross-checked against val_history entries (step, checkpoint_path)
        * if selected_step == 0: must have checkpoint_path == null or base model; rejects non-zero positive steps claiming step 0
        * if selected_step > 0: rejects null checkpoint_path, must match checkpoints/{arm_name}/step_{selected_step}
        * Kaggle absolute path relocation validated strictly relative to experiment_dir
        * Fails closed on path traversal, missing checkpoints (no fallback), symlinks, or cross-check discrepancy
    """
    base_model_resolved = base_model_dir.resolve()
    if base_model_resolved.is_symlink():
        raise PathTraversalError(f"Base model dir is a symlink: {base_model_resolved}")

    if arm_name == "Arm_A":
        selected_step = arm_summary.get("selected_step", 0)
        if selected_step != 0:
            raise CheckpointValidationError(f"Arm_A selected_step must be 0, got {selected_step}")
        return 0, base_model_resolved, "base_bundle_model_step0"

    selected_step = arm_summary.get("selected_step")
    if selected_step is None or not isinstance(selected_step, int):
        raise CheckpointValidationError(f"Missing or non-integer selected_step in summary for {arm_name}: {selected_step}")

    val_history = arm_summary.get("val_history", [])
    if not val_history:
        raise CheckpointValidationError(f"Missing val_history for {arm_name}")

    # Cross-check selected_step in val_history
    history_steps = {h.get("step"): h for h in val_history if isinstance(h, dict) and "step" in h}
    if selected_step not in history_steps:
        raise CheckpointValidationError(
            f"Selected step {selected_step} for {arm_name} does not exist in val_history: {list(history_steps.keys())}"
        )

    matched_history_row = history_steps[selected_step]

    if selected_step == 0:
        # Must be baseline step 0
        ckpt_path_val = arm_summary.get("checkpoint_path")
        if ckpt_path_val is not None and str(ckpt_path_val).strip() != "":
            # If checkpoint_path is present for step 0, ensure it does not point to a trained non-zero checkpoint dir
            if f"step_" in str(ckpt_path_val) and not str(ckpt_path_val).endswith("step_0"):
                raise CheckpointValidationError(
                    f"Arm {arm_name} selected_step is 0 but checkpoint_path points to positive step: {ckpt_path_val}"
                )
        return 0, base_model_resolved, f"{arm_name}_step0_base_bundle_model"

    # For selected_step > 0:
    exp_dir_resolved = experiment_dir.resolve()
    if exp_dir_resolved.is_symlink():
        raise PathTraversalError(f"Experiment dir is a symlink: {exp_dir_resolved}")

    # Standard expected relative checkpoint directory layout: checkpoints/{arm_name}/step_{selected_step}
    expected_rel_path = Path("checkpoints") / arm_name / f"step_{selected_step}"
    expected_full_path = (exp_dir_resolved / expected_rel_path).resolve()

    # Inspect summary checkpoint_path
    ckpt_path_str = arm_summary.get("checkpoint_path")
    if not ckpt_path_str:
        raise CheckpointValidationError(
            f"Arm {arm_name} has positive selected_step={selected_step} but missing checkpoint_path in summary"
        )

    # Relocate recorded path safely to exp_dir_resolved
    p = Path(ckpt_path_str)
    candidate_paths: List[Path] = [expected_full_path]

    if p.is_absolute():
        parts = p.parts
        if "checkpoints" in parts:
            idx = parts.index("checkpoints")
            subpath = Path(*parts[idx:])
            candidate_paths.insert(0, (exp_dir_resolved / subpath).resolve())
        elif "experiment_outputs" in parts:
            idx = parts.index("experiment_outputs")
            subpath = Path(*parts[idx + 1:])
            candidate_paths.insert(0, (exp_dir_resolved / subpath).resolve())
        else:
            # Absolute path does not match expected experiment layout -> path traversal or outside exp_dir
            raise PathTraversalError(
                f"Path traversal or invalid checkpoint location for {arm_name}: {p}"
            )
    else:
        candidate_paths.insert(0, (exp_dir_resolved / p).resolve())

    # Path traversal validation
    resolved_ckpt = None
    for cand in candidate_paths:
        try:
            cand.relative_to(exp_dir_resolved)
        except ValueError:
            raise PathTraversalError(
                f"Path traversal or invalid checkpoint location for {arm_name}: {cand} outside {exp_dir_resolved}"
            )

        # Enforce that checkpoint path matches expected step and arm
        if cand.name != f"step_{selected_step}" or cand.parent.name != arm_name:
            raise CheckpointValidationError(
                f"Checkpoint path '{cand}' violates expected layout checkpoints/{arm_name}/step_{selected_step}"
            )

        if cand.is_symlink():
            raise PathTraversalError(f"Checkpoint directory is a symlink: {cand}")

        if cand.exists() and cand.is_dir():
            resolved_ckpt = cand
            break

    if resolved_ckpt is None:
        raise MissingCheckpointError(
            f"Checkpoint directory missing on disk for {arm_name} step {selected_step}: {candidate_paths[0]}"
        )

    # Cross-check with val_history checkpoint_path if recorded
    val_ckpt = matched_history_row.get("checkpoint_path")
    if val_ckpt:
        v_name = Path(val_ckpt).name
        if v_name != f"step_{selected_step}":
            raise CheckpointValidationError(
                f"val_history row for step {selected_step} records mismatched checkpoint {val_ckpt}"
            )

    return selected_step, resolved_ckpt, f"checkpoint_step_{selected_step}"


# ==============================================================================
# Model Loading & Embedding Wrapper (Eval-Only)
# ==============================================================================

class EvalModelWrapper:
    """Read-only inference wrapper ensuring model remains in eval mode with no parameter updates."""
    def __init__(self, model: Any, tokenizer: Any, device: Any):
        self.model = model
        self.tokenizer = tokenizer
        self.device = device
        self.model.eval()

    def encode(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        import torch
        import torch.nn.functional as F

        self.model.eval()
        all_embs = []
        with torch.no_grad():
            for i in range(0, len(texts), batch_size):
                chunk = texts[i:i + batch_size]
                batch = self.tokenizer(
                    chunk,
                    padding=True,
                    truncation=True,
                    max_length=256,
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
                normalized = F.normalize(pooled, p=2, dim=1)
                all_embs.extend(normalized.cpu().tolist())
        return all_embs


def load_model_for_arm(model_dir: Path | str, device: str = "cpu") -> Any:
    """Load model and tokenizer strictly in eval mode with no gradients.

    Requires use_safetensors=True without fallback to arbitrary unpickling.
    """
    p = Path(model_dir).resolve()
    if p.is_symlink():
        raise PathTraversalError(f"Model directory is a symlink: {p}")
    dir_str = str(p)

    try:
        from transformers import AutoModel, AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(dir_str, local_files_only=True)
        # Strict use_safetensors=True - no insecure pickle fallback!
        model = AutoModel.from_pretrained(dir_str, local_files_only=True, use_safetensors=True).to(device)
        for param in model.parameters():
            param.requires_grad_(False)
        return EvalModelWrapper(model=model, tokenizer=tokenizer, device=device)
    except Exception as e:
        # Fall back only to sentence-transformers if safetensors model load via AutoModel fails
        from sentence_transformers import SentenceTransformer
        st = SentenceTransformer(dir_str, device=str(device), model_kwargs={"local_files_only": True})
        st.eval()
        for param in st.parameters():
            param.requires_grad_(False)

        class STEvalAdapter:
            def __init__(self, st_model, dev):
                self.st = st_model
                self.device = dev
                self.model = st_model

            def encode(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
                self.st.eval()
                res = self.st.encode(texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=False)
                return res.tolist() if hasattr(res, "tolist") else res

        return STEvalAdapter(st, device)


# ==============================================================================
# Candidate Pool Builder with Evidence Identity Disambiguation
# ==============================================================================

def normalize_semantic_text(value: Optional[str]) -> str:
    """Normalize text matching standard repo convention: NFKC, lowercase, single-spaced."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value))).strip().lower()


def build_eval_pools_with_unique_ids(
    records: List[Dict[str, Any]],
    split: str = "test",
) -> List[Dict[str, Any]]:
    """Group split records by (job_id, requirement_id, requirement), ensuring unique candidate identity.

    Candidate_id alone has duplicates (e.g. 10 occurrences); unique evidence key is constructed
    as candidate_id::evidence_id::record_id to prevent collision or misattribution.
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
                        f"existing {prev_lbl} vs new {lbl}"
                    )
                continue

            norm_seen[evi_norm] = lbl
            cand_id = str(row.get("candidate_id") or "")
            ev_id = str(row.get("evidence_id") or "")
            rec_id = str(row.get("record_id") or "")
            unique_key = f"{cand_id}::{ev_id}::{rec_id}" if (ev_id or rec_id) else cand_id

            evidence_text = str(row.get("evidence", ""))
            text_sha = hashlib.sha256(evidence_text.encode("utf-8")).hexdigest()

            deduped_candidates.append({
                "unique_evidence_key": unique_key,
                "candidate_id": cand_id,
                "evidence_id": ev_id,
                "record_id": rec_id,
                "evidence": evidence_text,
                "normalized_evidence": evi_norm,
                "evidence_sha256": text_sha,
                "label": lbl,
            })

        pos_count = sum(1 for c in deduped_candidates if c["label"] == 1)
        lang = req_id.split("@")[-1] if "@" in req_id else "unknown"

        pools.append({
            "split": split,
            "job_id": job_id,
            "requirement_id": req_id,
            "requirement": req_text,
            "requirement_sha256": hashlib.sha256(req_text.encode("utf-8")).hexdigest(),
            "language": lang,
            "candidates": deduped_candidates,
            "pool_size": len(deduped_candidates),
            "pos_count": pos_count,
            "has_positive": pos_count > 0,
        })

    return pools


# ==============================================================================
# Model Evaluation & Metrics (All, Mixed-Only, Positive-Only, Pairwise)
# ==============================================================================

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    score = sum(a * b for a, b in zip(v1, v2))
    if not math.isfinite(score):
        raise NonFiniteScoreError(f"Non-finite cosine score detected: {score}")
    return float(score)


def evaluate_arm_model(
    embedder: Any,
    pools: List[Dict[str, Any]],
    arm_name: str,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Score candidate pools with embedder, sorting deterministically with tie tracking."""
    unique_texts = set()
    for p in pools:
        unique_texts.add(p["requirement"])
        for c in p["candidates"]:
            unique_texts.add(c["evidence"])

    text_list = sorted(unique_texts)
    emb_list = embedder.encode(text_list)
    emb_map = {t: emb for t, emb in zip(text_list, emb_list)}

    scored_cases = []
    for p in pools:
        q_emb = emb_map[p["requirement"]]
        scored_cands = []
        for c in p["candidates"]:
            e_emb = emb_map[c["evidence"]]
            score = cosine_similarity(q_emb, e_emb)
            scored_cands.append({
                "unique_evidence_key": c["unique_evidence_key"],
                "candidate_id": c["candidate_id"],
                "evidence_id": c["evidence_id"],
                "record_id": c["record_id"],
                "evidence_sha256": c["evidence_sha256"],
                "label": c["label"],
                "score": score,
            })

        # Deterministic tie-breaking: sort descending by score, then ascending by unique_evidence_key
        scored_cands.sort(key=lambda x: (-x["score"], x["unique_evidence_key"]))

        scored_cases.append({
            "split": p["split"],
            "job_id": p["job_id"],
            "requirement_id": p["requirement_id"],
            "requirement": p["requirement"],
            "requirement_sha256": p["requirement_sha256"],
            "language": p["language"],
            "candidates": scored_cands,
        })

    metrics = compute_diagnostic_metrics(scored_cases)
    return metrics, scored_cases


def compute_diagnostic_metrics(scored_cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute micro and macro_job metrics across partitions with pairwise tie accounting."""
    all_positive_cases = []
    mixed_cases = []
    positive_only_cases = []
    no_positive_cases = []

    pos_neg_pairs_total = 0
    pos_beats_neg_total = 0
    pos_loses_neg_total = 0
    pos_neg_ties_total = 0
    total_score_ties = 0

    for case in scored_cases:
        cands = case["candidates"]
        scores = [c["score"] for c in cands]
        for s in scores:
            if not math.isfinite(s):
                raise NonFiniteScoreError(f"Non-finite cosine score detected: {s}")

        # Count ties among all candidate scores in this pool
        for i in range(len(scores)):
            for j in range(i + 1, len(scores)):
                if abs(scores[i] - scores[j]) < 1e-12:
                    total_score_ties += 1

        pos_cands = [c for c in cands if c["label"] == 1]
        neg_cands = [c for c in cands if c["label"] == 0]

        # Pairwise positive vs negative comparisons
        for pos in pos_cands:
            for neg in neg_cands:
                pos_neg_pairs_total += 1
                if pos["score"] > neg["score"] + 1e-12:
                    pos_beats_neg_total += 1
                elif neg["score"] > pos["score"] + 1e-12:
                    pos_loses_neg_total += 1
                else:
                    pos_neg_ties_total += 1

        total_positives = len(pos_cands)
        pool_size = len(cands)

        if total_positives == 0:
            m = {
                "has_positive": False,
                "total_positives": 0,
                "pool_size": pool_size,
                "mrr": None,
                "hit1": None,
                "hit3": None,
                "recall1": None,
                "recall3": None,
            }
            c_copy = dict(case)
            c_copy["metrics"] = m
            no_positive_cases.append(c_copy)
            continue

        ranks = [idx + 1 for idx, c in enumerate(cands) if c["label"] == 1]
        first_rank = ranks[0]
        mrr = 1.0 / first_rank
        hit1 = 1.0 if first_rank <= 1 else 0.0
        hit3 = 1.0 if first_rank <= 3 else 0.0
        pos_in_top1 = sum(1 for r in ranks if r <= 1)
        pos_in_top3 = sum(1 for r in ranks if r <= 3)
        recall1 = pos_in_top1 / total_positives
        recall3 = pos_in_top3 / total_positives

        m = {
            "has_positive": True,
            "total_positives": total_positives,
            "pool_size": pool_size,
            "mrr": mrr,
            "hit1": hit1,
            "hit3": hit3,
            "recall1": recall1,
            "recall3": recall3,
        }
        c_copy = dict(case)
        c_copy["metrics"] = m
        all_positive_cases.append(c_copy)

        if len(neg_cands) > 0:
            mixed_cases.append(c_copy)
        else:
            positive_only_cases.append(c_copy)

    def aggregate_subset(eval_cases: List[Dict[str, Any]]) -> Dict[str, Any]:
        metric_keys = ["mrr", "hit1", "hit3", "recall1", "recall3"]
        n_queries = len(eval_cases)
        if n_queries == 0:
            return {
                "queries": 0,
                "jobs": 0,
                "micro": {k: None for k in metric_keys},
                "macro_job": {k: None for k in metric_keys},
                "job_averages": {},
            }

        micro = {k: sum(c["metrics"][k] for c in eval_cases) / n_queries for k in metric_keys}

        by_job: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for c in eval_cases:
            by_job[c["job_id"]].append(c["metrics"])

        job_averages: Dict[str, Dict[str, float]] = {}
        for jid, q_list in by_job.items():
            job_averages[jid] = {k: sum(q[k] for q in q_list) / len(q_list) for k in metric_keys}

        job_count = len(job_averages)
        macro_job = {k: sum(job_averages[j][k] for j in job_averages) / job_count for k in metric_keys}
        macro_job["job_count"] = job_count

        return {
            "queries": n_queries,
            "jobs": job_count,
            "micro": micro,
            "macro_job": macro_job,
            "job_averages": job_averages,
        }

    return {
        "all_positive": aggregate_subset(all_positive_cases),
        "mixed_only": aggregate_subset(mixed_cases),
        "positive_only": aggregate_subset(positive_only_cases),
        "no_positive": {
            "queries": len(no_positive_cases),
            "jobs": len(set(c["job_id"] for c in no_positive_cases)),
        },
        "pairwise_ordering": {
            "pos_neg_pairs": pos_neg_pairs_total,
            "pos_beats_neg": pos_beats_neg_total,
            "pos_loses_neg": pos_loses_neg_total,
            "pos_neg_ties": pos_neg_ties_total,
            "total_score_ties": total_score_ties,
        }
    }


def paired_job_bootstrap_eval(
    job_scores_primary: Dict[str, float],
    job_scores_baseline: Dict[str, float],
    n_resamples: int = 1000,
    seed: int = 42,
) -> Dict[str, Any]:
    """Seeded paired bootstrap for job-macro MRR difference."""
    common_jobs = sorted(set(job_scores_primary.keys()) & set(job_scores_baseline.keys()))
    if not common_jobs:
        return {
            "mean_delta": 0.0,
            "ci_95_low": 0.0,
            "ci_95_high": 0.0,
            "common_jobs_count": 0,
            "resamples": n_resamples,
            "seed": seed,
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


def build_per_query_evidence_comparison(
    cases_primary: List[Dict[str, Any]],
    cases_baseline: List[Dict[str, Any]],
    primary_name: str,
    baseline_name: str,
) -> List[Dict[str, Any]]:
    """Compare candidate score and rank changes matched strictly by unique_evidence_key."""
    baseline_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for case in cases_baseline:
        jid = case["job_id"]
        rid = case["requirement_id"]
        for rank_idx, c in enumerate(case["candidates"], start=1):
            key = (jid, rid, c["unique_evidence_key"])
            baseline_map[key] = {
                "rank": rank_idx,
                "score": c["score"],
            }

    comparisons = []
    for case in cases_primary:
        jid = case["job_id"]
        rid = case["requirement_id"]
        for rank_idx, c in enumerate(case["candidates"], start=1):
            key = (jid, rid, c["unique_evidence_key"])
            base_info = baseline_map.get(key)
            if base_info is None:
                continue

            score_delta = c["score"] - base_info["score"]
            rank_delta = base_info["rank"] - rank_idx  # Positive means rank improved

            comparisons.append({
                "job_id": jid,
                "requirement_id": rid,
                "unique_evidence_key": c["unique_evidence_key"],
                "candidate_id": c["candidate_id"],
                "evidence_id": c["evidence_id"],
                "record_id": c["record_id"],
                "evidence_sha256": c["evidence_sha256"],
                "label": c["label"],
                f"{primary_name}_score": c["score"],
                f"{primary_name}_rank": rank_idx,
                f"{baseline_name}_score": base_info["score"],
                f"{baseline_name}_rank": base_info["rank"],
                "score_delta": score_delta,
                "rank_delta": rank_delta,
            })

    return comparisons


# ==============================================================================
# Main Orchestrator
# ==============================================================================

def run_eval_only(
    bundle_dir: Path | str,
    experiment_dir: Path | str,
    output_dir: Path | str,
    device: str = "cpu",
    split: str = "test",
) -> Dict[str, Any]:
    """Execute evaluation-only pipeline across Arms A, B, and C."""
    b_dir = Path(bundle_dir).resolve()
    e_dir = Path(experiment_dir).resolve()
    out_dir = Path(output_dir).resolve()

    if b_dir.is_symlink():
        raise PathTraversalError(f"Bundle dir cannot be a symlink: {b_dir}")
    if e_dir.is_symlink():
        raise PathTraversalError(f"Experiment dir cannot be a symlink: {e_dir}")
    if out_dir.is_symlink():
        raise PathTraversalError(f"Output dir cannot be a symlink: {out_dir}")

    # Fail closed on output directory collision
    if out_dir.exists() and any(out_dir.iterdir()):
        raise RefuseOverwriteError(
            f"Collision: output directory exists and is not empty: {out_dir}"
        )
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Verify bundle integrity
    print(f"[1/6] Verifying bundle manifest at {b_dir}...")
    manifest = verify_bundle_manifest(b_dir)

    # 2. Load summary and check for smoke run
    summary_path = e_dir / "experiment_results.json"
    print(f"[2/6] Loading experiment results from {summary_path}...")
    summary = load_experiment_results(summary_path)

    # 3. Resolve checkpoints for Arms A, B, C
    print("[3/6] Resolving checkpoint targets (no training / no selection mutation)...")
    base_model_dir = b_dir / "model"
    arm_targets = {}
    for arm_name in ["Arm_A", "Arm_B", "Arm_C"]:
        arm_summary = summary["arms"].get(arm_name, {})
        step, ckpt_path, desc = resolve_arm_checkpoint_target(
            arm_name, arm_summary, e_dir, base_model_dir
        )
        arm_targets[arm_name] = {
            "selected_step": step,
            "checkpoint_path": str(ckpt_path),
            "description": desc,
            "checkpoint_files_sha256": directory_sha256_manifest(ckpt_path),
        }
        print(f"  - {arm_name}: step {step} at {ckpt_path}")

    # 4. Load semantic test records with unique evidence IDs
    print(f"[4/6] Building restricted pools for split='{split}' with unique evidence keys...")
    semantic_path = b_dir / "data" / "semantic.jsonl"
    records = []
    with open(semantic_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))

    pools = build_eval_pools_with_unique_ids(records, split=split)
    print(f"  - Loaded {len(pools)} {split} queries across {len(set(p['job_id'] for p in pools))} jobs.")

    # 5. Evaluate Arms A, B, C
    print("[5/6] Evaluating models strictly in eval mode...")
    arm_eval_results = {}
    arm_scored_cases = {}
    for arm_name, target in arm_targets.items():
        print(f"  Evaluating {arm_name} (step {target['selected_step']})...")
        model = load_model_for_arm(target["checkpoint_path"], device=device)
        metrics, scored_cases = evaluate_arm_model(model, pools, arm_name)
        arm_eval_results[arm_name] = metrics
        arm_scored_cases[arm_name] = scored_cases
        del model

    # 6. Bootstrap comparisons & Pairwise rank/score changes
    print("[6/6] Computing paired job bootstrap and matched evidence comparisons...")
    job_scores_a = arm_eval_results["Arm_A"]["all_positive"]["job_averages"]
    job_scores_b = arm_eval_results["Arm_B"]["all_positive"]["job_averages"]
    job_scores_c = arm_eval_results["Arm_C"]["all_positive"]["job_averages"]

    job_mrr_a = {j: m["mrr"] for j, m in job_scores_a.items()}
    job_mrr_b = {j: m["mrr"] for j, m in job_scores_b.items()}
    job_mrr_c = {j: m["mrr"] for j, m in job_scores_c.items()}

    boot_c_a = paired_job_bootstrap_eval(job_mrr_c, job_mrr_a, n_resamples=1000, seed=42)
    boot_c_b = paired_job_bootstrap_eval(job_mrr_c, job_mrr_b, n_resamples=1000, seed=42)

    comp_c_a = build_per_query_evidence_comparison(arm_scored_cases["Arm_C"], arm_scored_cases["Arm_A"], "Arm_C", "Arm_A")
    comp_c_b = build_per_query_evidence_comparison(arm_scored_cases["Arm_C"], arm_scored_cases["Arm_B"], "Arm_C", "Arm_B")

    # Record environment and provenance
    try:
        import torch
        torch_ver = torch.__version__
    except ImportError:
        torch_ver = "unavailable"

    try:
        import transformers
        trans_ver = transformers.__version__
    except ImportError:
        trans_ver = "unavailable"

    current_script_path = Path(__file__).resolve()
    provenance = {
        "script": str(current_script_path),
        "script_sha256": compute_sha256(current_script_path),
        "bundle_manifest_sha256": compute_sha256(b_dir / "manifest.json"),
        "semantic_data_sha256": compute_sha256(semantic_path),
        "source_experiment_results_sha256": compute_sha256(summary_path),
        "python_version": sys.version,
        "platform": platform.platform(),
        "torch_version": torch_ver,
        "transformers_version": trans_ver,
        "device": device,
    }

    final_report = {
        "status": "COMPLETED",
        "evaluation_type": "SAVED_CHECKPOINTS_EVAL_ONLY_NO_RETRAINING",
        "diagnostic_disclaimer": (
            "POST-HOC DIAGNOSTICS ONLY. Evaluation was conducted on saved checkpoints without retraining. "
            "All test metrics and score comparisons are diagnostic and must NOT be used for independent checkpoint selection."
        ),
        "provenance": provenance,
        "arm_targets": arm_targets,
        "evaluation_metrics": arm_eval_results,
        "bootstrap_comparisons": {
            "delta_c_minus_a": boot_c_a,
            "delta_c_minus_b": boot_c_b,
        },
        "pairwise_evidence_comparison_summary": {
            "c_vs_a": {
                "total_matched_evidences": len(comp_c_a),
                "rank_improvements": sum(1 for x in comp_c_a if x["rank_delta"] > 0),
                "rank_regressions": sum(1 for x in comp_c_a if x["rank_delta"] < 0),
                "rank_unchanged": sum(1 for x in comp_c_a if x["rank_delta"] == 0),
            },
            "c_vs_b": {
                "total_matched_evidences": len(comp_c_b),
                "rank_improvements": sum(1 for x in comp_c_b if x["rank_delta"] > 0),
                "rank_regressions": sum(1 for x in comp_c_b if x["rank_delta"] < 0),
                "rank_unchanged": sum(1 for x in comp_c_b if x["rank_delta"] == 0),
            }
        }
    }

    # Save outputs
    metrics_file = out_dir / "eval_diagnostic_results.json"
    with open(metrics_file, "w", encoding="utf-8") as f:
        json.dump(final_report, f, indent=2, ensure_ascii=False)

    for arm_name in ["Arm_A", "Arm_B", "Arm_C"]:
        pred_file = out_dir / f"eval_predictions_{arm_name}.jsonl"
        with open(pred_file, "w", encoding="utf-8") as f:
            for case in arm_scored_cases[arm_name]:
                f.write(json.dumps(case, ensure_ascii=False) + "\n")

    diff_file_ca = out_dir / "eval_score_rank_diff_c_vs_a.jsonl"
    with open(diff_file_ca, "w", encoding="utf-8") as f:
        for item in comp_c_a:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    diff_file_cb = out_dir / "eval_score_rank_diff_c_vs_b.jsonl"
    with open(diff_file_cb, "w", encoding="utf-8") as f:
        for item in comp_c_b:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"\nEvaluation-only export complete! Files saved to: {out_dir}")
    return final_report


def main():
    parser = argparse.ArgumentParser(description="Evaluate existing AI1 checkpoints without retraining")
    parser.add_argument("--bundle", required=True, help="Path to input bundle containing manifest.json")
    parser.add_argument("--experiment", required=True, help="Path to existing experiment_outputs directory or results zip")
    parser.add_argument("--output", required=True, help="Path to directory for eval-only outputs (must not exist)")
    parser.add_argument("--device", default="cpu", help="Device to use for eval (cpu or cuda)")
    parser.add_argument("--split", default="test", help="Dataset split to evaluate")
    args = parser.parse_args()

    exp_path = Path(args.experiment).resolve()
    if exp_path.is_file() and zipfile.is_zipfile(exp_path):
        # Extract into a clean dedicated directory
        extract_dir = exp_path.parent / f"_extracted_{exp_path.stem}"
        if extract_dir.exists():
            import time
            extract_dir = exp_path.parent / f"_extracted_{exp_path.stem}_{int(time.time())}"
        print(f"Extracting results archive {exp_path} to {extract_dir}...")
        safe_extract_results_archive(exp_path, extract_dir)
        exp_dir = extract_dir
    else:
        exp_dir = exp_path

    run_eval_only(
        bundle_dir=args.bundle,
        experiment_dir=exp_dir,
        output_dir=args.output,
        device=args.device,
        split=args.split,
    )


if __name__ == "__main__":
    main()
