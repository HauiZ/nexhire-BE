#!/usr/bin/env python3
"""Offline diagnostic and hard-negative mining runner for AI1 train split.

Loads M1 SentenceTransformer checkpoint, scores all training pairs in semantic.jsonl,
identifies ranking inversions and margin violations, and exports review artifacts.
"""

import argparse
import csv
import hashlib
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MAX_SEQ_LENGTH: int = 256
TRAIN_SPLIT_DISCLAIMER: str = (
    "Silver train data pending human review; train split mining only; "
    "cannot be used to infer heldout generalization."
)


def normalize_semantic_text(value: Optional[str]) -> str:
    """Normalize text matching standard repo convention."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip().lower()


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


def compute_model_hash(model_dir: Path | str) -> str:
    """Compute deterministic hash of model weights and configuration files."""
    model_path = Path(model_dir)
    if not model_path.exists():
        return "unknown"
    if model_path.is_file():
        return compute_file_sha256(model_path)

    key_files = sorted([
        f for f in model_path.rglob("*")
        if f.is_file() and f.name in (
            "config.json",
            "model.safetensors",
            "pytorch_model.bin",
            "modules.json",
            "tokenizer_config.json",
        )
    ])
    if not key_files:
        key_files = sorted([f for f in model_path.glob("*") if f.is_file()])

    if not key_files:
        return "unknown"

    h = hashlib.sha256()
    for kf in key_files:
        h.update(kf.name.encode("utf-8"))
        h.update(compute_file_sha256(kf).encode("utf-8"))
    return h.hexdigest()


def get_environment_metadata(
    model_path: Optional[Path | str] = None,
    semantic_path: Optional[Path | str] = None,
) -> Dict[str, Any]:
    """Capture runtime library versions, python version, and data/model hashes."""
    meta: Dict[str, Any] = {
        "python_version": sys.version,
        "library_versions": {},
    }
    for mod_name in ["torch", "sentence_transformers", "transformers", "numpy"]:
        if mod_name in sys.modules:
            mod = sys.modules[mod_name]
            meta["library_versions"][mod_name] = getattr(mod, "__version__", "unknown")
        else:
            try:
                mod = __import__(mod_name)
                meta["library_versions"][mod_name] = getattr(mod, "__version__", "unknown")
            except ImportError:
                meta["library_versions"][mod_name] = "not_installed"

    if semantic_path and Path(semantic_path).exists():
        meta["input_semantic_sha256"] = compute_file_sha256(Path(semantic_path))
    else:
        meta["input_semantic_sha256"] = "unknown"

    if model_path and Path(model_path).exists():
        meta["model_hash"] = compute_model_hash(Path(model_path))
    else:
        meta["model_hash"] = "unknown"

    return meta


def load_train_records(semantic_path: Path | str) -> List[Dict[str, Any]]:
    """Load only train split records from semantic dataset.

    Rejects missing record_id, duplicate record_ids, and conflicting labels.
    """
    train_records = []
    seen_records: Dict[str, Dict[str, Any]] = {}
    with open(semantic_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            if record.get("split") == "train":
                rec_id = record.get("record_id")
                if not rec_id:
                    raise ValueError(f"Missing or empty record_id at line {line_num}")
                rec_id_str = str(rec_id).strip()
                if not rec_id_str:
                    raise ValueError(f"Empty record_id at line {line_num}")

                if rec_id_str in seen_records:
                    prev = seen_records[rec_id_str]
                    if prev.get("label") != record.get("label"):
                        raise ValueError(
                            f"Conflicting labels for duplicate record_id '{rec_id_str}': "
                            f"{prev.get('label')} vs {record.get('label')} at line {line_num}"
                        )
                    raise ValueError(f"Duplicate record_id found: '{rec_id_str}' at line {line_num}")

                seen_records[rec_id_str] = record
                train_records.append(record)
    return train_records


def classify_comparison(
    pos_score: float, neg_score: float, margin: float = 0.1
) -> Tuple[str, bool, bool]:
    """Classify comparison into INVERSION_ERROR, MARGIN_VIOLATION, or CORRECT.

    Returns:
        (status_string, is_inversion_error, is_margin_violation)
    """
    diff = neg_score - pos_score
    if diff >= 0:
        return "INVERSION_ERROR", True, True
    elif pos_score - neg_score < margin:
        return "MARGIN_VIOLATION", False, True
    else:
        return "CORRECT", False, False


def form_comparisons(
    records: List[Dict[str, Any]],
    scores: Dict[str, float],
    margin: float = 0.1,
) -> List[Dict[str, Any]]:
    """Group train records by (job_id, requirement_id, exact requirement) and build pos vs neg comparisons.

    Validates scores: rejects missing or nonfinite scores.
    """
    grouped = defaultdict(lambda: {"pos": [], "neg": []})
    for r in records:
        key = (str(r["job_id"]), str(r["requirement_id"]), str(r.get("requirement", "")))
        if r["label"] == 1:
            grouped[key]["pos"].append(r)
        elif r["label"] == 0:
            grouped[key]["neg"].append(r)

    comparisons = []
    comp_counter = 0
    for (job_id, req_id, req_text), pool in sorted(grouped.items()):
        pos_list = pool["pos"]
        neg_list = pool["neg"]
        if not pos_list or not neg_list:
            continue

        for pos in pos_list:
            pos_id = pos["record_id"]
            if pos_id not in scores:
                raise ValueError(f"Missing score for pos record_id: '{pos_id}'")
            pos_score = scores[pos_id]
            if pos_score is None or not math.isfinite(pos_score):
                raise ValueError(f"Missing or nonfinite score for pos record_id '{pos_id}': {pos_score}")

            for neg in neg_list:
                neg_id = neg["record_id"]
                if neg_id not in scores:
                    raise ValueError(f"Missing score for neg record_id: '{neg_id}'")
                neg_score = scores[neg_id]
                if neg_score is None or not math.isfinite(neg_score):
                    raise ValueError(f"Missing or nonfinite score for neg record_id '{neg_id}': {neg_score}")

                status, is_err, is_margin = classify_comparison(pos_score, neg_score, margin)
                diff = round(neg_score - pos_score, 6)

                lang = req_id.rsplit("@", 1)[-1] if "@" in req_id else "en"
                comp_counter += 1
                comp_id = f"cmp_{job_id}_{comp_counter:04d}"

                comparisons.append({
                    "comparison_id": comp_id,
                    "split": "train",
                    "job_id": job_id,
                    "requirement_id": req_id,
                    "language": lang,
                    "requirement": pos["requirement"],
                    "pos_record_id": pos["record_id"],
                    "pos_candidate_id": pos.get("candidate_id"),
                    "pos_evidence_id": pos.get("evidence_id"),
                    "pos_evidence_source": pos.get("evidence_source"),
                    "pos_label": pos["label"],
                    "pos_original_label": pos.get("original_label", pos["label"]),
                    "pos_evidence": pos["evidence"],
                    "positive_evidence": pos["evidence"],
                    "pos_score": round(pos_score, 6),
                    "neg_record_id": neg["record_id"],
                    "neg_candidate_id": neg.get("candidate_id"),
                    "neg_evidence_id": neg.get("evidence_id"),
                    "neg_evidence_source": neg.get("evidence_source"),
                    "neg_label": neg["label"],
                    "neg_original_label": neg.get("original_label", neg["label"]),
                    "neg_type": neg.get("negative_type"),
                    "neg_evidence": neg["evidence"],
                    "negative_evidence": neg["evidence"],
                    "neg_score": round(neg_score, 6),
                    "score_diff": diff,
                    "status": status,
                    "is_inversion_error": is_err,
                    "is_margin_violation": is_margin,
                    "review_decision": "pending_human_review",
                    "disclaimer": TRAIN_SPLIT_DISCLAIMER,
                })

    return comparisons


def encode_and_score(
    model: Any,
    records: List[Dict[str, Any]],
    batch_size: int = 64,
) -> Tuple[Dict[str, float], Dict[str, Any]]:
    """Encode all unique texts offline, validate maxseq256, track truncation, compute cosine."""
    import numpy as np

    if hasattr(model, "max_seq_length"):
        if model.max_seq_length != MAX_SEQ_LENGTH:
            model.max_seq_length = MAX_SEQ_LENGTH

    unique_reqs = {normalize_semantic_text(r["requirement"]) for r in records}
    unique_evis = {normalize_semantic_text(r["evidence"]) for r in records}
    all_texts = sorted(unique_reqs | unique_evis)

    truncation_info: Dict[str, Any] = {
        "max_seq_length": MAX_SEQ_LENGTH,
        "total_unique_texts": len(all_texts),
        "truncated_texts_count": 0,
        "truncation_verified": False,
    }
    if hasattr(model, "tokenizer") and model.tokenizer is not None:
        try:
            trunc_count = sum(
                1 for t in all_texts
                if len(model.tokenizer.encode(t, truncation=False)) > MAX_SEQ_LENGTH
            )
            truncation_info["truncated_texts_count"] = trunc_count
            truncation_info["truncation_verified"] = True
        except Exception as exc:
            truncation_info["truncation_error"] = str(exc)

    print(f"Encoding {len(all_texts)} unique texts using SentenceTransformer (maxseq={MAX_SEQ_LENGTH})...", flush=True)
    t0 = time.perf_counter()
    embeddings = model.encode(
        all_texts,
        batch_size=batch_size,
        show_progress_bar=True,
        normalize_embeddings=True,
    )
    t1 = time.perf_counter()
    print(f"Encoded in {t1 - t0:.2f} seconds ({len(all_texts)/(t1 - t0):.1f} texts/sec).", flush=True)

    text_to_vec = dict(zip(all_texts, embeddings))

    scores: Dict[str, float] = {}
    for r in records:
        req_norm = normalize_semantic_text(r["requirement"])
        evi_norm = normalize_semantic_text(r["evidence"])
        v_req = text_to_vec[req_norm]
        v_evi = text_to_vec[evi_norm]
        cosine = float(np.dot(v_req, v_evi))
        if not math.isfinite(cosine):
            raise ValueError(f"Non-finite cosine score computed for record {r.get('record_id')}: {cosine}")
        scores[r["record_id"]] = cosine

    return scores, truncation_info


def compute_comparison_statistics(
    comparisons: List[Dict[str, Any]],
    margin: float = 0.1,
    top_review: int = 200,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """Compute bilingual and negative_type stats and slice top review pairs."""
    inversion_errors = [c for c in comparisons if c["is_inversion_error"]]
    margin_violations = [c for c in comparisons if c["is_margin_violation"]]

    stats_by_lang = defaultdict(lambda: {"total": 0, "errors": 0, "margin_violations": 0})
    stats_by_neg_type = defaultdict(lambda: {"total": 0, "errors": 0, "margin_violations": 0})

    for c in comparisons:
        lang = c["language"]
        neg_type = str(c["neg_type"])
        stats_by_lang[lang]["total"] += 1
        stats_by_neg_type[neg_type]["total"] += 1
        if c["is_inversion_error"]:
            stats_by_lang[lang]["errors"] += 1
            stats_by_neg_type[neg_type]["errors"] += 1
        if c["is_margin_violation"]:
            stats_by_lang[lang]["margin_violations"] += 1
            stats_by_neg_type[neg_type]["margin_violations"] += 1

    top_review_pairs = comparisons[:top_review]
    top_inversions = sum(1 for c in top_review_pairs if c["is_inversion_error"])
    top_margins_only = sum(1 for c in top_review_pairs if c["is_margin_violation"] and not c["is_inversion_error"])
    top_ordered = sum(1 for c in top_review_pairs if not c["is_margin_violation"] and not c["is_inversion_error"])

    top_composition = {
        "total_exported": len(top_review_pairs),
        "inversion_errors": top_inversions,
        "margin_violations_only": top_margins_only,
        "ordered_cases": top_ordered,
        "note": "Top review exports most difficult pairs sorted by score_diff (neg - pos). May include ordered cases if inversion errors < top_review.",
    }

    stats = {
        "total_comparisons": len(comparisons),
        "inversion_errors_count": len(inversion_errors),
        "inversion_error_rate": round(len(inversion_errors) / len(comparisons), 4) if comparisons else 0.0,
        "margin_violations_count": len(margin_violations),
        "margin_violation_rate": round(len(margin_violations) / len(comparisons), 4) if comparisons else 0.0,
        "margin": margin,
        "by_language": dict(stats_by_lang),
        "by_negative_type": dict(stats_by_neg_type),
        "top_review_count": len(top_review_pairs),
        "top_review_composition": top_composition,
        "disclaimer": TRAIN_SPLIT_DISCLAIMER,
    }

    return top_review_pairs, stats, dict(stats_by_lang), dict(stats_by_neg_type)


def write_mining_artifacts(
    output_dir: Path,
    comparisons: List[Dict[str, Any]],
    top_review_pairs: List[Dict[str, Any]],
    summary_dict: Dict[str, Any],
    stats_by_lang: Dict[str, Any],
    stats_by_neg_type: Dict[str, Any],
    model_identifier: str,
    train_records_count: int,
    scored_records: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Write all mining output artifacts including CSV, JSONL, summary, and REPORT.md."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Scored train records (if provided)
    if scored_records is not None:
        scored_path = output_dir / "scored_train_records.jsonl"
        with open(scored_path, "w", encoding="utf-8") as f:
            for r in scored_records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # All comparisons
    with open(output_dir / "all_comparisons.jsonl", "w", encoding="utf-8") as f:
        for c in comparisons:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    # Top review JSONL
    with open(output_dir / "review.jsonl", "w", encoding="utf-8") as f:
        for c in top_review_pairs:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    # Top review CSV with explicit evidence texts and split
    csv_fields = [
        "comparison_id",
        "split",
        "job_id",
        "language",
        "status",
        "score_diff",
        "neg_score",
        "pos_score",
        "pos_label",
        "neg_label",
        "neg_type",
        "pos_evidence_source",
        "neg_evidence_source",
        "requirement",
        "positive_evidence",
        "negative_evidence",
        "review_decision",
        "disclaimer",
    ]
    with open(output_dir / "review.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        for c in top_review_pairs:
            row = {k: c.get(k) for k in csv_fields}
            writer.writerow(row)

    # Summary JSON
    with open(output_dir / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_dict, f, ensure_ascii=False, indent=2)

    # REPORT.md
    comp_info = summary_dict.get("top_review_composition", {})
    inversion_count = summary_dict.get("inversion_errors_count", 0)
    margin_count = summary_dict.get("margin_violations_count", 0)
    total_comps = summary_dict.get("total_comparisons", 0)
    margin_val = summary_dict.get("margin", 0.1)

    inv_pct = f"{inversion_count / total_comps * 100:.2f}%" if total_comps else "0.00%"
    mar_pct = f"{margin_count / total_comps * 100:.2f}%" if total_comps else "0.00%"

    report_md = f"""# Báo cáo Chẩn đoán Hard Negatives trên Tập Train (M1 Baseline)

> **CẢNH BÁO / DISCLAIMER BẮT BUỘC:**
> Dữ liệu được trích xuất và chẩn đoán **hoàn toàn trên tập huấn luyện (`split: train`)**.
> Đây là dữ liệu silver đang **chờ rà soát thủ công (`pending_human_review`)**, **TUYỆT ĐỐI KHÔNG ĐƯỢC** sử dụng tỷ lệ lỗi trên tập train này để suy diễn khả năng tổng quát hóa trên tập kiểm thử độc lập (heldout generalization).

## 1. Thống kê Tổng quan

- **Mô hình kiểm tra:** `{model_identifier}`
- **Tổng số bản ghi train:** {train_records_count}
- **Tổng số cặp đối đầu (positive vs negative cùng job, req_id, exact requirement):** {total_comps}
- **Số cặp bị đảo ngược (Inversion Errors - Negative >= Positive):** **{inversion_count}** ({inv_pct})
- **Số cặp vi phạm lề (Margin Violations - Positive - Negative < {margin_val}):** **{margin_count}** ({mar_pct})

## 2. Phân bố theo Nhóm Ngôn ngữ (Bilingual Source Group Counts)

| Ngôn ngữ | Tổng số cặp | Lỗi đảo ngược | Tỷ lệ lỗi | Vi phạm lề | Tỷ lệ vi phạm lề |
| :--- | :---: | :---: | :---: | :---: | :---: |
"""
    for lang, st in sorted(stats_by_lang.items()):
        err_rate = st["errors"] / st["total"] * 100 if st["total"] > 0 else 0
        mar_rate = st["margin_violations"] / st["total"] * 100 if st["total"] > 0 else 0
        report_md += f"| `{lang}` | {st['total']} | {st['errors']} | {err_rate:.2f}% | {st['margin_violations']} | {mar_rate:.2f}% |\n"

    report_md += f"""
## 3. Phân bố theo Loại Negative (`negative_type`)

| Negative Type | Tổng số cặp | Lỗi đảo ngược (Neg >= Pos) | Tỷ lệ lỗi | Vi phạm lề (< {margin_val}) |
| :--- | :---: | :---: | :---: | :---: |
"""
    for neg_type, st in sorted(stats_by_neg_type.items()):
        err_rate = st["errors"] / st["total"] * 100 if st["total"] > 0 else 0
        report_md += f"| `{neg_type}` | {st['total']} | {st['errors']} | {err_rate:.2f}% | {st['margin_violations']} |\n"

    report_md += f"""
## 4. Tệp Xuất Phục Vụ Rà Soát (Thành phần Top {summary_dict.get('top_review_count', 200)})

- **Tệp xuất:** `{output_dir / 'review.csv'}` và `{output_dir / 'review.jsonl'}`
- **Thành phần top review:**
  - Lỗi đảo ngược thực tế (Inversion Errors, `neg_score >= pos_score`): **{comp_info.get('inversion_errors', 0)}**
  - Vi phạm lề (Margin Violations, `pos_score - neg_score < {margin_val}`): **{comp_info.get('margin_violations_only', 0)}**
  - Các cặp đúng thứ tự nhưng khoảng cách thấp nhất (Ordered Cases): **{comp_info.get('ordered_cases', 0)}**
  *(Lưu ý: Danh sách top review bao gồm cả các ca đúng thứ tự biên hẹp khi tổng số lỗi đảo ngược nhỏ hơn ngưỡng xuất, không phải toàn bộ 200 cặp đều là lỗi đảo ngược).*
- Toàn bộ kết quả đối đầu: `{output_dir / 'all_comparisons.jsonl'}`.
"""
    with open(output_dir / "REPORT.md", "w", encoding="utf-8") as f:
        f.write(report_md)


def export_corrected_review_from_scored(
    scored_path: Path | str,
    output_dir: Path | str,
    margin: float = 0.1,
    top_review: int = 200,
) -> None:
    """Read existing scored records and export NEW corrected review artifacts without re-running inference."""
    scored_file = Path(scored_path)
    out_dir = Path(output_dir)

    if not scored_file.exists():
        raise FileNotFoundError(f"Scored records file not found: {scored_file}")

    if out_dir.exists() and any(out_dir.iterdir()):
        raise FileExistsError(f"Target output directory already exists and is not empty: {out_dir}")

    records = []
    scores = {}
    with open(scored_file, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            rec_id = str(rec.get("record_id", "")).strip()
            if not rec_id:
                raise ValueError(f"Missing record_id at line {line_num} in {scored_file}")
            score = rec.get("m1_cosine_score")
            if score is None or not math.isfinite(score):
                raise ValueError(f"Missing or nonfinite m1_cosine_score for record {rec_id} at line {line_num}")
            records.append(rec)
            scores[rec_id] = float(score)

    comparisons = form_comparisons(records, scores, margin=margin)
    comparisons.sort(key=lambda c: (-c["score_diff"], c["comparison_id"]))

    top_pairs, stats, lang_stats, neg_stats = compute_comparison_statistics(
        comparisons, margin=margin, top_review=top_review
    )

    summary_dict = {
        "export_mode": "corrected_from_scored_records",
        "scored_source_path": str(scored_file),
        "total_train_records": len(records),
        "truncation_info": "unknown_from_historical_run",
        "library_versions": "unknown_from_historical_run",
        "model_hash": "unknown_from_historical_run",
        "input_semantic_sha256": "unknown_from_historical_run",
        **stats,
    }

    write_mining_artifacts(
        output_dir=out_dir,
        comparisons=comparisons,
        top_review_pairs=top_pairs,
        summary_dict=summary_dict,
        stats_by_lang=lang_stats,
        stats_by_neg_type=neg_stats,
        model_identifier="M1 Ranking Retention (historical run)",
        train_records_count=len(records),
        scored_records=None,  # Do not duplicate scored records
    )
    print(f"Corrected review artifacts written to: {out_dir}")


def main():
    parser = argparse.ArgumentParser(description="Mine hard negatives from AI1 train split using M1 checkpoint.")
    parser.add_argument("--semantic", type=Path, default=Path("semantic.jsonl"), help="Path to semantic.jsonl")
    parser.add_argument("--model", type=Path, default=None, help="Path to verified M1 model directory")
    parser.add_argument("--output", type=Path, required=True, help="New directory to store mining artifacts")
    parser.add_argument("--margin", type=float, default=0.1, help="Ranking margin (default: 0.1)")
    parser.add_argument("--batch-size", type=int, default=64, help="Embedding batch size (default: 64)")
    parser.add_argument("--top-review", type=int, default=200, help="Number of top difficult pairs to export (default: 200)")
    parser.add_argument("--from-scored", type=Path, default=None, help="Export corrected review from scored records without inference")

    args = parser.parse_args()

    if args.from_scored:
        export_corrected_review_from_scored(
            scored_path=args.from_scored,
            output_dir=args.output,
            margin=args.margin,
            top_review=args.top_review,
        )
        return

    if args.model is None:
        raise ValueError("--model path is required unless --from-scored is specified")

    if args.output.exists():
        raise FileExistsError(f"Output directory already exists: {args.output}")

    if not args.semantic.exists():
        raise FileNotFoundError(f"Semantic file not found: {args.semantic}")

    if not args.model.exists():
        raise FileNotFoundError(f"Model path not found: {args.model}")

    # Set offline environment variables
    os.environ.update(
        HF_HUB_OFFLINE="1",
        TRANSFORMERS_OFFLINE="1",
        USE_TF="0",
        USE_FLAX="0",
        TOKENIZERS_PARALLELISM="false",
    )

    import torch
    from sentence_transformers import SentenceTransformer

    torch.set_num_threads(4)

    env_meta = get_environment_metadata(model_path=args.model, semantic_path=args.semantic)

    print(f"Loading M1 model from {args.model}...", flush=True)
    model = SentenceTransformer(
        str(args.model),
        device="cpu",
        trust_remote_code=False,
        local_files_only=True,
        model_kwargs={"use_safetensors": True, "local_files_only": True},
        tokenizer_kwargs={"local_files_only": True},
        config_kwargs={"local_files_only": True},
    )
    model.eval()

    print(f"Loading train records from {args.semantic}...", flush=True)
    train_records = load_train_records(args.semantic)
    print(f"Loaded {len(train_records)} train records.", flush=True)

    scores, truncation_info = encode_and_score(model, train_records, batch_size=args.batch_size)

    comparisons = form_comparisons(train_records, scores, margin=args.margin)
    comparisons.sort(key=lambda c: (-c["score_diff"], c["comparison_id"]))

    top_pairs, stats, lang_stats, neg_stats = compute_comparison_statistics(
        comparisons, margin=args.margin, top_review=args.top_review
    )

    scored_records_list = []
    for r in train_records:
        item = dict(r)
        item["m1_cosine_score"] = round(scores[r["record_id"]], 6)
        scored_records_list.append(item)

    summary_dict = {
        "model_path": str(args.model),
        "semantic_path": str(args.semantic),
        "total_train_records": len(train_records),
        "truncation_info": truncation_info,
        **env_meta,
        **stats,
    }

    write_mining_artifacts(
        output_dir=args.output,
        comparisons=comparisons,
        top_review_pairs=top_pairs,
        summary_dict=summary_dict,
        stats_by_lang=lang_stats,
        stats_by_neg_type=neg_stats,
        model_identifier=args.model.name,
        train_records_count=len(train_records),
        scored_records=scored_records_list,
    )

    print(f"Artifacts exported successfully to: {args.output}")


if __name__ == "__main__":
    main()
