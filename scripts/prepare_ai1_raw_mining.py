#!/usr/bin/env python3
"""Prepare train-eligible raw mining candidate manifest and dataset artifacts.

Processes raw_llm_dataset (1).json (885 jobs) and anchors against baseline
semantic.jsonl splits. Enforces exact normalized JD description grouping,
preserves baseline splits, holds out test/validation data outside mining candidates,
and establishes strict review gates before any model training.
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
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

ALLOWED_SPLITS: Set[str] = {"train", "validation", "test"}
HELDOUT_SPLITS: Set[str] = {"validation", "test"}

LIMITATION_BASELINE_JD_ABSENT: str = (
    "Near duplicate detection against baseline cannot complete because baseline "
    "JD texts are absent from semantic.jsonl (only job_id and record metadata are present). "
    "This is an explicit limitation and blocker for final production train approval."
)

REVIEW_STATUS_UNREVIEWED: str = "unreviewed_silver"
TRAINING_GATE_BLOCKED: str = "BLOCKED_PENDING_HUMAN_REVIEW"


def normalize_description(text: Optional[str]) -> str:
    """Normalize JD description for exact duplicate detection matching repo convention."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", str(text))
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def compute_file_sha256(filepath: Path | str) -> str:
    """Compute sha256 hex digest of a file in streaming chunks."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def validate_ratios(train_ratio: float, val_ratio: float) -> None:
    """Validate finite ratios: 0 < train <= 1, 0 <= val < 1, and train + val <= 1."""
    if not (isinstance(train_ratio, (int, float)) and math.isfinite(train_ratio)):
        raise ValueError("train_ratio must be a finite number")
    if not (isinstance(val_ratio, (int, float)) and math.isfinite(val_ratio)):
        raise ValueError("val_ratio must be a finite number")
    if not (0.0 < train_ratio <= 1.0):
        raise ValueError(f"train_ratio must satisfy 0 < train_ratio <= 1, got {train_ratio}")
    if not (0.0 <= val_ratio < 1.0):
        raise ValueError(f"val_ratio must satisfy 0 <= val_ratio < 1, got {val_ratio}")
    if (train_ratio + val_ratio) > 1.0:
        raise ValueError(
            f"Split ratios must satisfy train_ratio + val_ratio <= 1.0, got {train_ratio + val_ratio}"
        )


def assign_deterministic_split(
    norm_desc: str,
    seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> str:
    """Deterministic split for new unanchored jobs using description hash."""
    seed_str = f"{seed}:{norm_desc}"
    digest = hashlib.sha256(seed_str.encode("utf-8")).hexdigest()
    val = int(digest[:8], 16) / 0xFFFFFFFF
    if val < train_ratio:
        return "train"
    elif val < (train_ratio + val_ratio):
        return "validation"
    else:
        return "test"


def load_baseline_splits(baseline_path: Path | str) -> Tuple[Dict[str, str], int]:
    """Load baseline job splits from semantic.jsonl.

    Rejects missing/empty IDs, invalid splits, and conflicting splits.
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
                    f"Invalid split '{split}' in baseline for job_id '{jid}' at line {line_num}."
                )

            if jid in baseline_splits and baseline_splits[jid] != split:
                raise ValueError(
                    f"Conflicting splits in baseline for job_id '{jid}': "
                    f"'{baseline_splits[jid]}' vs '{split}' at line {line_num}"
                )
            baseline_splits[jid] = split

    return baseline_splits, total_records


def group_and_split_raw_jobs(
    raw_jobs: List[Dict[str, Any]],
    baseline_splits: Dict[str, str],
    seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Tuple[Dict[str, str], Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
    """Strict exact normalized description duplicate grouping and deterministic split resolution.

    - Preserves baseline splits for overlapping job IDs.
    - Propagates baseline split across all jobs in the same exact description group.
    - Rejects conflicting baseline splits inside the same group.
    - Unanchored groups are assigned deterministically by hash.
    """
    validate_ratios(train_ratio, val_ratio)

    seen_raw_ids: Set[str] = set()
    desc_to_jobs: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for idx, item in enumerate(raw_jobs):
        raw_jid = item.get("job_id")
        if raw_jid is None:
            raise ValueError(f"Missing job_id in raw dataset item {idx}")
        jid = str(raw_jid).strip()
        if not jid:
            raise ValueError(f"Empty job_id in raw dataset item {idx}")

        if jid in seen_raw_ids:
            raise ValueError(f"Duplicate raw job_id found: '{jid}'")
        seen_raw_ids.add(jid)

        raw_desc = item.get("description")
        if raw_desc is None or not str(raw_desc).strip():
            raise ValueError(f"Missing or empty description for raw job_id '{jid}'")

        norm = normalize_description(raw_desc)
        desc_to_jobs[norm].append(item)

    resolved_splits: Dict[str, str] = {}
    duplicate_groups_count = 0
    duplicate_jobs_count = 0
    baseline_anchored_groups = 0
    baseline_anchored_jobs = 0
    new_hashed_groups = 0
    new_hashed_jobs = 0

    for norm_desc, jobs in desc_to_jobs.items():
        if len(jobs) > 1:
            duplicate_groups_count += 1
            duplicate_jobs_count += len(jobs)

        group_job_ids = [str(j["job_id"]) for j in jobs]
        group_baseline_splits = {
            jid: baseline_splits[jid]
            for jid in group_job_ids
            if jid in baseline_splits
        }

        unique_baseline_splits = set(group_baseline_splits.values())
        if len(unique_baseline_splits) > 1:
            raise ValueError(
                f"Conflicting baseline splits for jobs in same description group {group_job_ids}: "
                f"{unique_baseline_splits}"
            )

        if unique_baseline_splits:
            target_split = unique_baseline_splits.pop()
            baseline_anchored_groups += 1
            for j in jobs:
                jid = str(j["job_id"])
                resolved_splits[jid] = target_split
                baseline_anchored_jobs += 1
        else:
            target_split = assign_deterministic_split(
                norm_desc=norm_desc,
                seed=seed,
                train_ratio=train_ratio,
                val_ratio=val_ratio,
            )
            new_hashed_groups += 1
            for j in jobs:
                jid = str(j["job_id"])
                resolved_splits[jid] = target_split
                new_hashed_jobs += 1

    stats = {
        "total_raw_jobs": len(raw_jobs),
        "unique_normalized_descriptions": len(desc_to_jobs),
        "exact_duplicate_groups_count": duplicate_groups_count,
        "exact_duplicate_jobs_count": duplicate_jobs_count,
        "baseline_anchored_groups": baseline_anchored_groups,
        "baseline_anchored_jobs": baseline_anchored_jobs,
        "new_hashed_groups": new_hashed_groups,
        "new_hashed_jobs": new_hashed_jobs,
    }

    return resolved_splits, dict(desc_to_jobs), stats


def extract_candidate_records(
    job: Dict[str, Any],
    split: str,
) -> List[Dict[str, Any]]:
    """Extract candidate records from raw job response with honest metadata and synthetic provenance."""
    job_id = str(job["job_id"])
    title = job.get("title", "")
    job_group = job.get("job_group", "")
    job_group_label = job.get("job_group_label", "")
    desc_sha = job.get("description_sha256", "")

    provenance = {
        "generator_model": job.get("generator_model"),
        "prompt_sha256": job.get("prompt_sha256"),
        "generated_at": job.get("generated_at"),
        "generator_api_mode": job.get("generator_api_mode"),
        "generation_schema_sha256": job.get("generation_schema_sha256"),
    }

    resp = job.get("response", {})
    if not isinstance(resp, dict):
        return []

    cvs = resp.get("generated_cvs", [])
    records = []

    for cv_idx, cv in enumerate(cvs):
        candidate_label = cv.get("candidate_label")
        candidate_id = f"cand_{job_id}_{cv_idx:02d}"

        pairs = cv.get("requirement_evidence_pairs_for_ai1", [])
        for pair_idx, pair in enumerate(pairs):
            req_text = str(pair.get("requirement", "")).strip()
            evi_text = str(pair.get("cv_evidence", "")).strip()
            is_match = pair.get("is_semantic_match")

            # Evidence source is absent in raw generation: record honestly as None
            evi_source = pair.get("evidence_source", None)

            pair_id = f"ai1_raw_{job_id}_{cv_idx:02d}_{pair_idx:02d}"
            req_id = f"req_{job_id}_{pair_idx:02d}"
            evi_id = f"evi_{job_id}_{cv_idx:02d}_{pair_idx:02d}"

            records.append({
                "candidate_pair_id": pair_id,
                "split": split,
                "job_id": job_id,
                "job_title": title,
                "job_group": job_group,
                "job_group_label": job_group_label,
                "description_sha256": desc_sha,
                "requirement_id": req_id,
                "requirement": req_text,
                "evidence_id": evi_id,
                "evidence": evi_text,
                "candidate_id": candidate_id,
                "raw_candidate_label": candidate_label,
                "raw_is_semantic_match": is_match,
                "original_label": is_match,
                "evidence_source": evi_source,
                "synthetic_provenance": provenance,
                "review_status": REVIEW_STATUS_UNREVIEWED,
                "approved_for_training": False,
                "training_gate_status": TRAINING_GATE_BLOCKED,
                "disclaimer": (
                    "Assistant-generated silver candidate with unreviewed ambiguous labels. "
                    "MUST NOT be used for training without human review. "
                    "Candidate label is not evidence truth."
                ),
            })

    return records


def generate_review_instructions_vietnamese(
    manifest_data: Dict[str, Any],
) -> str:
    """Generate concise Vietnamese review instructions explaining gate status and guidelines."""
    s = manifest_data["split_summary"]
    return f"""# HƯỚNG DẪN RÀ SOÁT DỮ LIỆU KHAI PHÁ AI1 (REVIEW INSTRUCTIONS)

> **TRẠNG THÁI KHÓA HUẤN LUYỆN: `{manifest_data['training_gate']['status']}`**
> **HUẤN LUYỆN ĐƯỢC PHÊ DUYỆT: `{manifest_data['training_gate']['approved_for_training']}`**
> Toàn bộ ứng viên trong tập dữ liệu này là **silver data sinh bởi LLM trợ lý**, **CHƯA ĐƯỢC PHÉP** đưa vào huấn luyện mô hình khi chưa hoàn thành quy trình rà soát và phê duyệt của con người.

---

## 1. Mục Đích & Phạm Vi Tập Dữ Liệu

1. **Tập ứng viên huấn luyện (`candidates.jsonl`):**
   - Chứa **{s['train_candidates']}** cặp (requirement, evidence) từ **{s['train_jobs']}** việc làm thuộc tập `train`.
   - Đây là tập duy nhất đủ điều kiện đưa vào rà soát phục vụ khai phá hard negatives/positives cho AI1.

2. **Tập lưu giữ kiểm thử độc lập (`heldout_candidates.jsonl`):**
   - Chứa **{s['heldout_candidates_total']}** cặp từ **{s['heldout_jobs_total']}** việc làm thuộc các tập kiểm thử (`validation`: {s['validation_jobs']} jobs / {s['validation_candidates']} pairs; `test`: {s['test_jobs']} jobs / {s['test_candidates']} pairs).
   - Được tách biệt hoàn toàn bên ngoài tệp khai phá huấn luyện để ngăn chặn rò rỉ dữ liệu (data leakage).

---

## 2. Các Rào Cản & Giới Hạn Cốt Lõi (Blockers & Limitations)

1. **Nhãn thô chưa được kiểm duyệt (Ambiguous Raw Labels):**
   - `original_label` / `raw_is_semantic_match` (0 hoặc 1) được sinh tự động bởi LLM và có thể chứa ảo giác hoặc nhầm lẫn logic.
   - `raw_candidate_label` (0 đến 3) là **nhãn cấp ứng viên** (toàn bộ CV của AI2), **TUYỆT ĐỐI KHÔNG ĐƯỢC** suy diễn thành chân lý nhãn đúng/sai cho từng cặp bằng chứng của AI1.

2. **Khuyết thiếu nguồn bằng chứng (`evidence_source: null`):**
   - Generator ban đầu không phân đoạn rõ nguồn bằng chứng (kinh nghiệm, kỹ năng, dự án, học vấn).
   - Reviewer phải bổ sung trường `evidence_source` khi thẩm định.

3. **Giới hạn kiểm tra trùng lặp với baseline (Crucial Blocker):**
   - Tệp baseline gốc (`semantic.jsonl`) chỉ chứa bản ghi đánh giá và `job_id`, **KHÔNG CHỨA văn bản mô tả công việc (JD description)**.
   - Do đó, việc khử trùng lặp văn bản giữa raw và baseline chỉ thực hiện được qua `job_id` (đã tìm thấy và cách ly job `921716` vào validation).
   - **Không thể khẳng định hoàn toàn không có near-duplicate hoặc paraphrase giữa raw JD và baseline JD.** Đây là rào cản bắt buộc phải ghi nhận trước khi phê duyệt huấn luyện.

---

## 3. Quy Trình & Tiêu Chí Thẩm Định Của Reviewer

Mỗi reviewer khi mở bản ghi trong `candidates.jsonl` cần kiểm tra 4 tiêu chí:

1. **Tính xác thực của yêu cầu (`requirement`):**
   - Yêu cầu có thực tế, rõ ràng và nằm trong JD không?
2. **Tính chính xác của bằng chứng (`evidence`):**
   - Đoạn văn bằng chứng trích xuất từ CV có thực sự chứng minh được yêu cầu hay không?
   - Nhãn gán lại: `1` (positive - hỗ trợ đầy đủ), `0` (negative - không hỗ trợ hoặc lệch công nghệ/năm kinh nghiệm).
3. **Phân loại nguồn bằng chứng (`evidence_source`):**
   - Gán giá trị hợp lệ: `experience` (kinh nghiệm làm việc), `skill` (danh sách kỹ năng), `project` (dự án cá nhân/mô phỏng), `education` (bằng cấp học vấn).
4. **Phân loại negative (`negative_type` nếu nhãn là 0):**
   - Gán một trong các loại chuẩn: `technology_mismatch`, `years_shortfall`, `domain_mismatch`, `partial_condition`, `unrelated`.

---

## 4. Điều Kiện Mở Khóa Huấn Luyện

Chỉ khi:
1. Đã hoàn thành thẩm định con người trên mẫu đại diện hoặc toàn bộ tập `candidates.jsonl`.
2. Trường `evidence_source` được điền đầy đủ và nhãn `label` được xác nhận bởi chuyên gia.
3. Giải quyết hoặc chấp thuận rủi ro giới hạn văn bản baseline JD.
Khi đó mới được chuyển cờ `approved_for_training = true`.
"""


def build_raw_mining_preparation(
    raw_path: Path | str,
    semantic_path: Path | str,
    output_dir: Path | str,
    seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Dict[str, Any]:
    """Execute complete raw mining candidate manifest preparation and export artifacts."""
    raw_file = Path(raw_path)
    sem_file = Path(semantic_path)
    out_dir = Path(output_dir)

    if not raw_file.exists():
        raise FileNotFoundError(f"Raw dataset file not found: {raw_file}")
    if not sem_file.exists():
        raise FileNotFoundError(f"Semantic baseline file not found: {sem_file}")

    print(f"Loading raw dataset from {raw_file}...", flush=True)
    with open(raw_file, "r", encoding="utf-8") as f:
        raw_jobs = json.load(f)

    if not isinstance(raw_jobs, list):
        raise ValueError("Raw dataset must be a JSON array of job records")

    print(f"Loading baseline splits from {sem_file}...", flush=True)
    baseline_splits, baseline_total_records = load_baseline_splits(sem_file)
    print(f"Loaded {len(baseline_splits)} unique baseline jobs across {baseline_total_records} records.", flush=True)

    print("Grouping raw jobs by normalized JD description and resolving splits...", flush=True)
    resolved_splits, desc_to_jobs, grouping_stats = group_and_split_raw_jobs(
        raw_jobs=raw_jobs,
        baseline_splits=baseline_splits,
        seed=seed,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
    )

    out_dir.mkdir(parents=True, exist_ok=True)

    candidates_path = out_dir / "candidates.jsonl"
    heldout_path = out_dir / "heldout_candidates.jsonl"

    train_candidates_count = 0
    heldout_candidates_count = 0
    validation_candidates_count = 0
    test_candidates_count = 0

    jobs_by_split: Dict[str, List[str]] = defaultdict(list)
    for jid, sp in resolved_splits.items():
        jobs_by_split[sp].append(jid)

    overlapping_baseline_jobs = []
    for j in raw_jobs:
        jid = str(j["job_id"])
        if jid in baseline_splits:
            overlapping_baseline_jobs.append({
                "job_id": jid,
                "baseline_split": baseline_splits[jid],
                "resolved_split": resolved_splits[jid],
            })

    excluded_jobs_from_train = []
    for sp in HELDOUT_SPLITS:
        for jid in sorted(jobs_by_split[sp]):
            reason = "baseline_anchor_overlap" if jid in baseline_splits else f"deterministic_hash_split_{sp}"
            excluded_jobs_from_train.append({
                "job_id": jid,
                "split": sp,
                "exclusion_reason": reason,
            })

    print("Extracting candidate records and separating heldout splits...", flush=True)
    with open(candidates_path, "w", encoding="utf-8") as f_cand, open(heldout_path, "w", encoding="utf-8") as f_held:
        for j in raw_jobs:
            jid = str(j["job_id"])
            sp = resolved_splits[jid]
            records = extract_candidate_records(j, split=sp)

            for r in records:
                line = json.dumps(r, ensure_ascii=False) + "\n"
                if sp == "train":
                    f_cand.write(line)
                    train_candidates_count += 1
                else:
                    f_held.write(line)
                    heldout_candidates_count += 1
                    if sp == "validation":
                        validation_candidates_count += 1
                    elif sp == "test":
                        test_candidates_count += 1

    split_summary = {
        "train_jobs": len(jobs_by_split["train"]),
        "train_candidates": train_candidates_count,
        "validation_jobs": len(jobs_by_split["validation"]),
        "validation_candidates": validation_candidates_count,
        "test_jobs": len(jobs_by_split["test"]),
        "test_candidates": test_candidates_count,
        "heldout_jobs_total": len(jobs_by_split["validation"]) + len(jobs_by_split["test"]),
        "heldout_candidates_total": heldout_candidates_count,
        "total_jobs": len(raw_jobs),
        "total_candidates": train_candidates_count + heldout_candidates_count,
    }

    manifest_data = {
        "dataset_name": "ai1-raw-mining-preparation",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "input_files": {
            "raw_dataset_path": str(raw_file),
            "raw_dataset_sha256": compute_file_sha256(raw_file),
            "raw_jobs_count": len(raw_jobs),
            "baseline_semantic_path": str(sem_file),
            "baseline_semantic_sha256": compute_file_sha256(sem_file),
            "baseline_jobs_count": len(baseline_splits),
        },
        "grouping_and_deduplication": grouping_stats,
        "split_configuration": {
            "seed": seed,
            "train_ratio": train_ratio,
            "val_ratio": val_ratio,
            "test_ratio": round(1.0 - train_ratio - val_ratio, 4),
        },
        "split_summary": split_summary,
        "overlapping_baseline_jobs": overlapping_baseline_jobs,
        "excluded_jobs_from_train_count": len(excluded_jobs_from_train),
        "excluded_jobs_from_train": excluded_jobs_from_train,
        "training_gate": {
            "approved_for_training": False,
            "status": TRAINING_GATE_BLOCKED,
            "blockers": [
                "Raw binary labels (is_semantic_match) are unreviewed synthetic model outputs.",
                "Candidate-level labels (0-3) cannot be reinterpreted as evidence-level truth.",
                "Evidence source annotations are absent in raw outputs (recorded honestly as null).",
                LIMITATION_BASELINE_JD_ABSENT,
            ],
            "required_actions_before_training": [
                "Complete human review on sampled or full candidate pairs.",
                "Populate evidence_source (experience, skill, project, education).",
                "Formally sign off on the absence of baseline JD texts limitation.",
            ],
        },
        "near_duplicate_detection_limitation": LIMITATION_BASELINE_JD_ABSENT,
        "artifacts": {
            "candidates_file": str(candidates_path),
            "heldout_file": str(heldout_path),
            "instructions_file": str(out_dir / "REVIEW_INSTRUCTIONS.md"),
        },
    }

    with open(out_dir / "manifest.json", "w", encoding="utf-8") as f_man:
        json.dump(manifest_data, f_man, ensure_ascii=False, indent=2)

    instructions_md = generate_review_instructions_vietnamese(manifest_data)
    with open(out_dir / "REVIEW_INSTRUCTIONS.md", "w", encoding="utf-8") as f_inst:
        f_inst.write(instructions_md)

    print(f"Raw mining candidate preparation artifacts written to: {out_dir}")
    return manifest_data


def main():
    parser = argparse.ArgumentParser(
        description="Prepare train-eligible raw mining candidate manifest and datasets."
    )
    parser.add_argument(
        "--raw",
        type=Path,
        default=Path("raw_llm_dataset (1).json"),
        help="Path to raw_llm_dataset (1).json (default: raw_llm_dataset (1).json)",
    )
    parser.add_argument(
        "--semantic",
        type=Path,
        default=Path("semantic.jsonl"),
        help="Path to baseline semantic.jsonl (default: semantic.jsonl)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("dataset/ai1-raw-mining-preparation"),
        help="Output directory (default: dataset/ai1-raw-mining-preparation)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Deterministic hash seed (default: 42)",
    )
    parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.8,
        help="Train split ratio for unanchored jobs (default: 0.8)",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.1,
        help="Validation split ratio for unanchored jobs (default: 0.1)",
    )

    args = parser.parse_args()

    build_raw_mining_preparation(
        raw_path=args.raw,
        semantic_path=args.semantic,
        output_dir=args.output,
        seed=args.seed,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
    )


if __name__ == "__main__":
    main()
