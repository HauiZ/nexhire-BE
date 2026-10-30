#!/usr/bin/env python3
"""Standalone stdlib offline evaluator for AI1 pilot dataset.

Evaluates within-CV section retrieval and cross-CV pairwise diagnostic ranking.
Pure Python BM25 by default; optional local-only SentenceTransformer safetensors loader.
No network access, no model downloading, no production claims.
"""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
import os
import platform
import re
import sys
import time
from typing import Any, Dict, List, Optional, Set, Tuple


def compute_file_sha256(path: str) -> str:
    """Compute SHA256 checksum of a file in 64KB blocks."""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def tokenize(text: str) -> List[str]:
    """Tokenize text into lowercase Unicode word tokens (document convention)."""
    if not text:
        return []
    return re.findall(r"\w+", text.lower(), flags=re.UNICODE)


class BM25:
    """Pure Python Okapi BM25 with Robertson/Lucene positive IDF smoothing."""

    def __init__(
        self,
        doc_ids: List[str],
        tokenized_docs: List[List[str]],
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        self.k1 = k1
        self.b = b
        self.doc_ids = doc_ids
        self.N = len(doc_ids)
        self.doc_lengths = [len(d) for d in tokenized_docs]
        self.avgdl = sum(self.doc_lengths) / self.N if self.N > 0 else 0.0

        self.df: Dict[str, int] = defaultdict(int)
        self.doc_tfs: List[Counter] = []
        for doc in tokenized_docs:
            tf = Counter(doc)
            self.doc_tfs.append(tf)
            for term in tf:
                self.df[term] += 1

        # Smooth positive IDF: ln(1.0 + (N - df + 0.5) / (df + 0.5))
        self.idf: Dict[str, float] = {}
        for term, freq in self.df.items():
            val = math.log(1.0 + (self.N - freq + 0.5) / (freq + 0.5))
            self.idf[term] = val if math.isfinite(val) else 0.0

    @classmethod
    def from_documents(
        cls,
        documents: List[Dict[str, Any]],
        k1: float = 1.5,
        b: float = 0.75,
    ) -> "BM25":
        """Instantiate BM25 from list of dicts with 'id' and 'text'."""
        doc_ids = [d["id"] for d in documents]
        tokenized = [tokenize(d.get("text", "") or "") for d in documents]
        return cls(doc_ids, tokenized, k1=k1, b=b)

    def score_query(self, query: str) -> Dict[str, float]:
        """Compute finite BM25 scores for all documents given a query string."""
        if self.N == 0:
            return {}
        q_tokens = tokenize(query)
        scores = {doc_id: 0.0 for doc_id in self.doc_ids}
        if not q_tokens:
            return scores

        for idx, doc_id in enumerate(self.doc_ids):
            tf = self.doc_tfs[idx]
            dl = self.doc_lengths[idx]
            denom_const = self.k1 * (1.0 - self.b + self.b * (dl / self.avgdl if self.avgdl > 0 else 1.0))
            score = 0.0
            for term in q_tokens:
                if term in tf:
                    t_freq = tf[term]
                    idf_val = self.idf.get(term, 0.0)
                    score += idf_val * (t_freq * (self.k1 + 1.0)) / (t_freq + denom_const)
            scores[doc_id] = float(score) if math.isfinite(score) else 0.0
        return scores


def load_sentence_transformer_model(model_path: str):
    """Local-only safetensors loader with trust_remote_code=False, offline env."""
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise ImportError(
            f"SentenceTransformer not available in environment: {exc}. "
            "Install sentence-transformers or run with default pure Python BM25."
        ) from exc

    model = SentenceTransformer(model_path, trust_remote_code=False)
    if hasattr(model, "max_seq_length"):
        model.max_seq_length = 256
    return model


def score_with_model(
    model: Any,
    query: str,
    candidates: List[Dict[str, Any]],
) -> Dict[str, float]:
    """Score candidates using local SentenceTransformer cosine similarity."""
    if not candidates:
        return {}
    texts = [c.get("text", "") or "" for c in candidates]
    all_texts = [query] + texts
    embeddings = model.encode(all_texts, normalize_embeddings=True, show_progress_bar=False)

    q_vec = embeddings[0]
    cand_vecs = embeddings[1:]

    scores: Dict[str, float] = {}
    for idx, c in enumerate(candidates):
        c_id = c.get("evidence_id") or c.get("id")
        c_vec = cand_vecs[idx]
        # Normalized cosine similarity is dot product
        cos_sim = float(sum(q * k for q, k in zip(q_vec, c_vec)))
        scores[c_id] = cos_sim if math.isfinite(cos_sim) else 0.0
    return scores


def evaluate_single_case(
    ranked_candidates: List[Dict[str, Any]],
    target: str = "full_support",
) -> Dict[str, Any]:
    """Evaluate within-CV candidate ranking for a single case under a diagnostic target.

    Targets:
      - 'full_support': positives have support_label == 'full'
      - 'any_support': positives have support_label in ('full', 'partial')
    """
    if target == "full_support":
        pos_labels = {"full"}
    elif target == "any_support":
        pos_labels = {"full", "partial"}
    else:
        raise ValueError(f"Unknown diagnostic target: '{target}'. Allowed: 'full_support', 'any_support'")

    pos_ranks: List[int] = []
    for rank_1idx, cand in enumerate(ranked_candidates, 1):
        if cand.get("support_label") in pos_labels:
            pos_ranks.append(rank_1idx)

    if not pos_ranks:
        return {
            "has_positive": False,
            "target": target,
            "total_positives": 0,
            "first_positive_rank": None,
            "mrr": None,
            "hit1": None,
            "hit3": None,
            "recall1": None,
            "recall3": None,
            "recall5": None,
            "recall10": None,
        }

    first_rank = min(pos_ranks)
    total_pos = len(pos_ranks)

    return {
        "has_positive": True,
        "target": target,
        "total_positives": total_pos,
        "first_positive_rank": first_rank,
        "mrr": 1.0 / first_rank,
        "hit1": 1.0 if first_rank <= 1 else 0.0,
        "hit3": 1.0 if first_rank <= 3 else 0.0,
        "recall1": sum(1 for r in pos_ranks if r <= 1) / total_pos,
        "recall3": sum(1 for r in pos_ranks if r <= 3) / total_pos,
        "recall5": sum(1 for r in pos_ranks if r <= 5) / total_pos,
        "recall10": sum(1 for r in pos_ranks if r <= 10) / total_pos,
    }


def evaluate_cross_cv_diagnostic(
    job_queries: List[Dict[str, Any]],
    model: Optional[Any] = None,
    k1: float = 1.5,
    b: float = 0.75,
) -> Dict[str, Any]:
    """Evaluate separate cross-CV full vs contradicted/irrelevant pairwise error rate.

    BM25 uses a common corpus per (job_id, requirement_index, query) so scores are comparable.
    Pairwise error: score_negative >= score_positive (counting ties as errors).
    """
    total_pairs = 0
    error_pairs = 0
    tie_pairs = 0
    evaluated_jq = 0

    for jq in job_queries:
        sections = jq.get("sections", [])
        if not sections:
            continue
        query = jq.get("query", "")

        # Score all sections with common corpus
        if model is not None:
            scores = score_with_model(model, query, sections)
        else:
            corpus_docs = [{"id": s["evidence_id"], "text": s.get("text", "")} for s in sections]
            bm25 = BM25.from_documents(corpus_docs, k1=k1, b=b)
            scores = bm25.score_query(query)

        positives = [s for s in sections if s.get("support_label") == "full"]
        negatives = [s for s in sections if s.get("support_label") in ("contradicted", "irrelevant")]

        if positives and negatives:
            evaluated_jq += 1
            for pos in positives:
                pos_score = scores.get(pos["evidence_id"], 0.0)
                for neg in negatives:
                    if pos.get("cv_id") and neg.get("cv_id") and pos["cv_id"] == neg["cv_id"]:
                        continue
                    neg_score = scores.get(neg["evidence_id"], 0.0)
                    total_pairs += 1
                    if neg_score >= pos_score:
                        error_pairs += 1
                        if neg_score == pos_score:
                            tie_pairs += 1

    pairwise_error_rate = (error_pairs / total_pairs) if total_pairs > 0 else None
    tie_rate = (tie_pairs / total_pairs) if total_pairs > 0 else None

    return {
        "diagnostic_target": "cross_cv_full_vs_contradicted_irrelevant",
        "evaluated_job_queries_count": evaluated_jq,
        "total_pairs": total_pairs,
        "error_pairs": error_pairs,
        "tie_pairs": tie_pairs,
        "pairwise_error_rate": pairwise_error_rate,
        "tie_rate": tie_rate,
        "description": "Cross-CV pairwise error rate: tỷ lệ cặp (full, contradicted/irrelevant) có score_negative >= score_positive (tính cả ties).",
    }


def evaluate_dataset(
    pairs_path: str,
    model: Optional[Any] = None,
    k1: float = 1.5,
    b: float = 0.75,
) -> Dict[str, Any]:
    """Load pairs.jsonl, deduplicate, score candidates within-CV, and evaluate metrics."""
    seen_pair_records: Dict[Tuple[str, int, str, str, str], Tuple[str, str]] = {}
    dedup_count = 0

    # Group candidates strictly per (job_id, requirement_index, query, cv_id)
    cv_cases: Dict[Tuple[str, int, str, str], List[Dict[str, Any]]] = defaultdict(list)
    # Also collect sections per (job_id, requirement_index, query) for cross-CV diagnostic
    cross_cv_groups: Dict[Tuple[str, int, str], Dict[str, Dict[str, Any]]] = defaultdict(dict)

    with open(pairs_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            job_id = str(item.get("job_id", "")).strip()
            req_idx = int(item.get("requirement_index", 0))
            query = str(item.get("query", "")).strip()
            cv_id = str(item.get("cv_id", "")).strip()
            ev_id = str(item.get("evidence_id", "")).strip()
            text = str(item.get("text") or item.get("evidence") or "")
            label = str(item.get("support_label", "")).strip()

            pair_key = (job_id, req_idx, query, cv_id, ev_id)
            if pair_key in seen_pair_records:
                prev_label, prev_text = seen_pair_records[pair_key]
                if prev_label != label or prev_text != text:
                    raise ValueError(
                        f"Conflicting duplicate pair at line {line_num} for identity {pair_key}: "
                        f"existing label='{prev_label}', new label='{label}'; "
                        f"existing text='{prev_text}', new text='{text}'"
                    )
                dedup_count += 1
                continue
            seen_pair_records[pair_key] = (label, text)

            candidate_obj = {
                "evidence_id": ev_id,
                "text": text,
                "support_label": label,
                "source": item.get("source") or item.get("evidence_source", ""),
                "negative_type": item.get("negative_type"),
            }
            case_key = (job_id, req_idx, query, cv_id)
            cv_cases[case_key].append(candidate_obj)

            # Cross-CV tracking: unique section per CV and evidence_id
            cross_key = (job_id, req_idx, query)
            sec_unique_id = f"{cv_id}::{ev_id}"
            cross_cv_groups[cross_key][sec_unique_id] = {
                "cv_id": cv_id,
                "evidence_id": sec_unique_id,
                "original_evidence_id": ev_id,
                "text": text,
                "support_label": label,
            }

    evaluated_cases = []
    pool_sizes = []
    latencies_sec = []

    # Warmup scorer once if cases exist
    if cv_cases:
        dummy_cands = [{"evidence_id": "dummy", "text": "warmup text", "support_label": "irrelevant"}]
        if model is not None:
            score_with_model(model, "warmup", dummy_cands)
        else:
            w_bm25 = BM25.from_documents([{"id": "dummy", "text": "warmup text"}], k1=k1, b=b)
            w_bm25.score_query("warmup")

    for (job_id, req_idx, query, cv_id), candidates in cv_cases.items():
        pool_sizes.append(len(candidates))

        if model is not None:
            t0 = time.perf_counter()
            scores = score_with_model(model, query, candidates)
            t1 = time.perf_counter()
        else:
            corpus_docs = [{"id": c["evidence_id"], "text": c.get("text", "")} for c in candidates]
            bm25 = BM25.from_documents(corpus_docs, k1=k1, b=b)
            t0 = time.perf_counter()
            scores = bm25.score_query(query)
            t1 = time.perf_counter()
        latencies_sec.append(t1 - t0)

        # Candidate isolation: candidates are strictly within this CV's pool
        # Deterministic ranking: score descending, then evidence_id ascending
        ranked = []
        for c in candidates:
            c_score = scores.get(c["evidence_id"], 0.0)
            ranked.append({
                "evidence_id": c["evidence_id"],
                "score": c_score,
                "support_label": c["support_label"],
                "source": c.get("source"),
                "text": c.get("text"),
                "negative_type": c.get("negative_type"),
            })
        ranked.sort(key=lambda x: (-x["score"], x["evidence_id"]))

        # Assign 1-indexed rank
        for r_idx, cand in enumerate(ranked, 1):
            cand["rank"] = r_idx

        eval_full = evaluate_single_case(ranked, target="full_support")
        eval_any = evaluate_single_case(ranked, target="any_support")

        evaluated_cases.append({
            "job_id": job_id,
            "requirement_index": req_idx,
            "query": query,
            "cv_id": cv_id,
            "candidate_pool_size": len(candidates),
            "ranked_candidates": ranked,
            "eval_full_support": eval_full,
            "eval_any_support": eval_any,
        })

    # Prepare cross-CV groups
    cross_cv_list = []
    for (job_id, req_idx, query), sec_dict in cross_cv_groups.items():
        cross_cv_list.append({
            "job_id": job_id,
            "requirement_index": req_idx,
            "query": query,
            "sections": list(sec_dict.values()),
        })

    cross_cv_diag = evaluate_cross_cv_diagnostic(cross_cv_list, model=model, k1=k1, b=b)

    return {
        "cases": evaluated_cases,
        "pool_sizes": pool_sizes,
        "deduplicated_pairs_count": dedup_count,
        "latencies_sec": latencies_sec,
        "cross_cv_diagnostic": cross_cv_diag,
    }


def aggregate_target_metrics(
    cases: List[Dict[str, Any]],
    target_key: str,
) -> Dict[str, Any]:
    """Aggregate micro and macro metrics for a target, excluding no-positive queries from denominators."""
    metric_keys = ["mrr", "hit1", "hit3", "recall1", "recall3", "recall5", "recall10"]

    eval_cases = [c for c in cases if c[target_key]["has_positive"]]
    no_pos_cases = [c for c in cases if not c[target_key]["has_positive"]]

    evaluated_count = len(eval_cases)
    no_pos_count = len(no_pos_cases)
    total_count = len(cases)

    if evaluated_count == 0:
        micro = {k: None for k in metric_keys}
        micro["denominator"] = 0
        macro_job = {k: None for k in metric_keys}
        macro_job["job_count"] = 0
    else:
        # Micro metrics: direct average across all evaluated queries
        micro = {k: sum(c[target_key][k] for c in eval_cases) / evaluated_count for k in metric_keys}
        micro["denominator"] = evaluated_count

        # Macro job metrics: average per job first, then average across jobs
        by_job: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for c in eval_cases:
            by_job[c["job_id"]].append(c[target_key])

        job_means: Dict[str, Dict[str, float]] = {}
        for job_id, job_cases in by_job.items():
            job_n = len(job_cases)
            job_means[job_id] = {k: sum(jc[k] for jc in job_cases) / job_n for k in metric_keys}

        job_count = len(job_means)
        macro_job = {k: sum(jm[k] for jm in job_means.values()) / job_count for k in metric_keys}
        macro_job["job_count"] = job_count

    return {
        "target_name": target_key.replace("eval_", ""),
        "evaluated_queries_count": evaluated_count,
        "no_positive_queries_count": no_pos_count,
        "total_queries_count": total_count,
        "micro": micro,
        "macro_job": macro_job,
    }


def _fmt_m(val: Optional[float]) -> str:
    return f"{val:.4f}" if val is not None else "N/A"


def _fmt_pct(val: Optional[float]) -> str:
    return f"{val * 100:.2f}%" if val is not None else "N/A"


def build_vietnamese_report(metrics_dict: Dict[str, Any], superseded_notice: Optional[str] = None) -> str:
    """Generate Vietnamese markdown report with explicit draft/pilot disclaimers."""
    full_tgt = metrics_dict["diagnostic_targets"]["full_support"]
    any_tgt = metrics_dict["diagnostic_targets"]["any_support"]
    sat_warn = metrics_dict["saturated_k_warning"]
    cross_diag = metrics_dict["cross_cv_diagnostic"]
    meta = metrics_dict["metadata"]
    latency = metrics_dict.get("latency", {})

    superseded_section = ""
    if superseded_notice:
        superseded_section = f"""
> **THÔNG BÁO QUAN TRỌNG: BÁO CÁO NÀY THAY THẾ (SUPERSEDES) BÁO CÁO TRƯỚC ĐÓ:**
> {superseded_notice}

---
"""

    report = f"""# Báo cáo Đánh giá Thử nghiệm AI1 Pilot (Draft / Offline Diagnostic)
{superseded_section}
> **LƯU Ý QUAN TRỌNG VỀ TÍNH CHẤT BÁO CÁO (DRAFT / DEVELOPMENT DISCLAIMER):**
> 1. **Dữ liệu thử nghiệm nội bộ (Internal Draft Dataset):** Đây là kết quả đo lường thử nghiệm ngoại tuyến (offline diagnostic) trên tập dữ liệu phác thảo AI1 v2 pilot ({meta.get('total_queries_count', 0)} queries trên {meta.get('job_count', 0)} việc làm).
> 2. **Chưa qua kiểm định chuyên gia độc lập (Non-independent / Pending Human Verification):** Dữ liệu được tổng hợp bán tự động kết hợp rà soát nội bộ, chưa được kiểm định độc lập bởi chuyên gia tuyển dụng.
> 3. **Không tuyên bố cải thiện (No Improvement Claim):** Báo cáo này không tuyên bố sự cải thiện hay vượt trội so với bất kỳ hệ thống nào, cũng như không phản ánh chất lượng vận hành cuối cùng trên môi trường production.
> 4. **Xếp hạng hỗ trợ đại diện (Support-based Proxy Ranking):** Các chỉ số phản ánh mức độ ưu tiên section theo nhãn bằng chứng (`full` hoặc `partial`), không phải quyết định tuyển dụng thực tế.

---

## 1. Thông số Thực thi & Môi trường

| Thông số | Giá trị |
| :--- | :--- |
| **Mô hình đánh giá** | `{meta.get('model_name')}` |
| **Phương pháp** | {meta.get('method_description', 'BM25 pure Python (k1=1.5, b=0.75)')} |
| **SHA256 File Input (`pairs.jsonl`)** | `{meta.get('input_sha256')}` |
| **SHA256 Script Đánh giá** | `{meta.get('evaluator_script_sha256')}` |
| **SHA256 Trọng số Mô hình** | `{meta.get('model_weights_sha256') or 'N/A (Pure Python BM25)'}` |
| **Nền tảng / Hệ điều hành** | `{meta.get('platform')}` |
| **CPU** | `{meta.get('processor') or meta.get('machine')}` |
| **Phiên bản Python** | `{meta.get('python_version')}` |
| **Thời gian đo lường mẫu (warm latency)** | {latency.get('warm_mean_per_case_ms', 0):.3f} ms / query ({latency.get('note', 'Chỉ đo suy luận scoring truy vấn, không bao gồm corpus build và model load; không phải production serving')}) |

---

## 2. Kích thước Candidate Pool & Cảnh báo Bão hòa K

- **Số lượng queries đánh giá:** {meta.get('total_queries_count')}
- **Kích thước Candidate Pool:** Tối thiểu = {sat_warn.get('min_pool_size')}, Trung bình = {sat_warn.get('mean_pool_size', 0):.2f}, Tối đa = {sat_warn.get('max_pool_size')} sections/CV.
- **Cảnh báo bão hòa K (Saturated K Warning):**
  > {sat_warn.get('message')}

---

## 3. Kết quả Xếp hạng Trong CV (Within-CV Retrieval)

Các query không có positive tương ứng trong candidate pool được tách riêng, **không đưa vào mẫu số** của MRR / Hit / Recall nhằm tránh tạo ra độ chính xác giả lập (invented not-found accuracy).

### 3.1. Mục tiêu chẩn đoán: `full_support` (Positives = nhãn `full`)

- **Số query có ít nhất 1 full positive (Mẫu số đánh giá):** {full_tgt.get('evaluated_queries_count')}
- **Số query không có full positive (Loại khỏi mẫu số):** {full_tgt.get('no_positive_queries_count')}

| Chỉ số | Micro (Mẫu số: {full_tgt['micro'].get('denominator')}) | Macro Job ({full_tgt['macro_job'].get('job_count')} jobs) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **MRR** | {_fmt_m(full_tgt['micro']['mrr'])} | {_fmt_m(full_tgt['macro_job']['mrr'])} | Thứ hạng nghịch đảo của positive đầu tiên |
| **Hit@1** | {_fmt_m(full_tgt['micro']['hit1'])} | {_fmt_m(full_tgt['macro_job']['hit1'])} | Positive xuất hiện ở top 1 |
| **Hit@3** | {_fmt_m(full_tgt['micro']['hit3'])} | {_fmt_m(full_tgt['macro_job']['hit3'])} | Positive xuất hiện trong top 3 |
| **Recall@1** | {_fmt_m(full_tgt['micro']['recall1'])} | {_fmt_m(full_tgt['macro_job']['recall1'])} | Tỷ lệ positive được tìm thấy ở rank 1 |
| **Recall@3** | {_fmt_m(full_tgt['micro']['recall3'])} | {_fmt_m(full_tgt['macro_job']['recall3'])} | Tỷ lệ positive được tìm thấy trong top 3 |
| **Recall@5** | {_fmt_m(full_tgt['micro']['recall5'])} | {_fmt_m(full_tgt['macro_job']['recall5'])} | *Bão hòa do kích thước pool <= 4* |
| **Recall@10** | {_fmt_m(full_tgt['micro']['recall10'])} | {_fmt_m(full_tgt['macro_job']['recall10'])} | *Bão hòa hiển nhiên (trivial 1.0)* |

### 3.2. Mục tiêu chẩn đoán: `any_support` (Positives = nhãn `full` hoặc `partial`)

- **Số query có positive (`full` hoặc `partial`) (Mẫu số đánh giá):** {any_tgt.get('evaluated_queries_count')}
- **Số query không có positive (Loại khỏi mẫu số):** {any_tgt.get('no_positive_queries_count')}

| Chỉ số | Micro (Mẫu số: {any_tgt['micro'].get('denominator')}) | Macro Job ({any_tgt['macro_job'].get('job_count')} jobs) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **MRR** | {_fmt_m(any_tgt['micro']['mrr'])} | {_fmt_m(any_tgt['macro_job']['mrr'])} | Thứ hạng nghịch đảo của positive đầu tiên |
| **Hit@1** | {_fmt_m(any_tgt['micro']['hit1'])} | {_fmt_m(any_tgt['macro_job']['hit1'])} | Positive xuất hiện ở top 1 |
| **Hit@3** | {_fmt_m(any_tgt['micro']['hit3'])} | {_fmt_m(any_tgt['macro_job']['hit3'])} | Positive xuất hiện trong top 3 |
| **Recall@1** | {_fmt_m(any_tgt['micro']['recall1'])} | {_fmt_m(any_tgt['macro_job']['recall1'])} | Tỷ lệ positive tìm thấy ở rank 1 |
| **Recall@3** | {_fmt_m(any_tgt['micro']['recall3'])} | {_fmt_m(any_tgt['macro_job']['recall3'])} | Tỷ lệ positive tìm thấy trong top 3 |
| **Recall@5** | {_fmt_m(any_tgt['micro']['recall5'])} | {_fmt_m(any_tgt['macro_job']['recall5'])} | *Bão hòa do kích thước pool <= 4* |
| **Recall@10** | {_fmt_m(any_tgt['micro']['recall10'])} | {_fmt_m(any_tgt['macro_job']['recall10'])} | *Bão hòa hiển nhiên (trivial 1.0)* |

---

## 4. Chẩn đoán Liên-CV (Cross-CV Pairwise Diagnostic)

Chỉ số chẩn đoán riêng biệt giữa các CV khác nhau cho cùng job/query (bỏ qua các cặp cùng CV: `pos.cv_id == neg.cv_id`). **Tuyệt đối không gộp chung với chỉ số truy hồi trong CV (within-CV).** Điểm BM25 sử dụng tập ngữ liệu chung cho toàn bộ các section của cùng job/query nhằm đảm bảo khả năng so sánh điểm số trực tiếp.

- **Mục tiêu so sánh:** Nhãn `full` vs nhãn `contradicted` / `irrelevant`.
- **Tổng số nhóm job/query có cả 2 nhãn từ các CV khác nhau:** {cross_diag.get('evaluated_job_queries_count')}
- **Tổng số cặp đối đầu liên CV (positive vs negative cross-CV):** {cross_diag.get('total_pairs')}
- **Số cặp lỗi (`score_negative >= score_positive` bao gồm ties):** {cross_diag.get('error_pairs')}
- **Số cặp hòa điểm (ties):** {cross_diag.get('tie_pairs')} (Tỷ lệ hòa: {_fmt_m(cross_diag.get('tie_rate'))})
- **Tỷ lệ lỗi cặp đối đầu (Pairwise Error Rate):** **{_fmt_m(cross_diag.get('pairwise_error_rate'))}** ({_fmt_pct(cross_diag.get('pairwise_error_rate'))})

---

## 5. Kết luận & Khuyến nghị Kỹ thuật

1. **Hiệu ứng bão hòa K trên Pilot:** Do pilot chỉ gồm 4 sections/CV, các chỉ số Recall@5 và Recall@10 luôn đạt 1.0 khi có positive. Đề xuất tập trung vào **Hit@1, MRR và Recall@1** làm thước đo phân giải.
2. **Tách bạch Within-CV và Cross-CV:** Việc tách riêng retrieval trong CV và pairwise ranking liên CV giúp cô lập lỗi suy diễn ngữ nghĩa với lỗi xếp hạng cục bộ.
3. **Bước tiếp theo:** Rà soát chuyên gia (human annotation verification) trước khi sử dụng tập dữ liệu này cho bất kỳ mục đích huấn luyện (fine-tuning) hay công bố benchmark chính thức.
"""
    return report


def run_evaluation_pipeline(
    pairs_path: str,
    output_dir: str,
    model_path: Optional[str] = None,
    model_name: Optional[str] = None,
    k1: float = 1.5,
    b: float = 0.75,
    superseded_notice: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute end-to-end evaluation pipeline and write predictions, metrics, and report."""
    # Reject if output directory already exists
    if os.path.exists(output_dir):
        raise FileExistsError(f"Output directory already exists: '{output_dir}'. Refusing to overwrite.")

    if model_path is not None and not model_name:
        raise ValueError("--model-name is required when --model path is provided.")

    if not model_name:
        model_name = "bm25"

    if not os.path.isfile(pairs_path):
        raise FileNotFoundError(f"Pairs file not found: '{pairs_path}'")

    input_sha = compute_file_sha256(pairs_path)
    script_path = os.path.abspath(__file__)
    script_sha = compute_file_sha256(script_path) if os.path.isfile(script_path) else "unknown"

    model_weights_sha: Optional[str] = None
    loaded_model = None

    if model_path is not None:
        if os.path.isfile(model_path):
            model_weights_sha = compute_file_sha256(model_path)
        elif os.path.isdir(model_path):
            st_path = os.path.join(model_path, "model.safetensors")
            if os.path.isfile(st_path):
                model_weights_sha = compute_file_sha256(st_path)
        loaded_model = load_sentence_transformer_model(model_path)

    # Evaluate dataset
    eval_results = evaluate_dataset(pairs_path, model=loaded_model, k1=k1, b=b)
    cases = eval_results["cases"]
    pool_sizes = eval_results["pool_sizes"]
    cross_cv_diag = eval_results["cross_cv_diagnostic"]
    latencies = eval_results["latencies_sec"]

    # Compute metrics for diagnostic targets
    full_metrics = aggregate_target_metrics(cases, "eval_full_support")
    any_metrics = aggregate_target_metrics(cases, "eval_any_support")

    # Saturated K warning
    min_pool = min(pool_sizes) if pool_sizes else 0
    max_pool = max(pool_sizes) if pool_sizes else 0
    mean_pool = sum(pool_sizes) / len(pool_sizes) if pool_sizes else 0.0

    saturated_ks = [k for k in [1, 3, 5, 10] if max_pool <= k]
    is_saturated = len(saturated_ks) > 0
    if is_saturated:
        sat_msg = (
            f"Kích thước candidate pool tối đa là {max_pool} (trung bình {mean_pool:.1f}), "
            f"nhỏ hơn hoặc bằng K cho {saturated_ks}. Recall@10 và các chỉ số tại K >= {max_pool} "
            f"đạt mức bão hòa hiển nhiên (trivial 1.0) và không phản ánh khả năng phân biệt truy hồi thực tế."
        )
    else:
        sat_msg = "Không phát hiện bão hòa K."

    saturated_k_warning = {
        "is_saturated": is_saturated,
        "saturated_k_values": saturated_ks,
        "min_pool_size": min_pool,
        "mean_pool_size": mean_pool,
        "max_pool_size": max_pool,
        "message": sat_msg,
    }

    unique_jobs = {c["job_id"] for c in cases}
    warm_mean_ms = (sum(latencies) / len(latencies) * 1000.0) if latencies else 0.0

    metrics_payload = {
        "diagnostic_targets": {
            "full_support": full_metrics,
            "any_support": any_metrics,
        },
        "saturated_k_warning": saturated_k_warning,
        "cross_cv_diagnostic": cross_cv_diag,
        "metadata": {
            "input_pairs_path": os.path.abspath(pairs_path),
            "input_sha256": input_sha,
            "evaluator_script_sha256": script_sha,
            "model_weights_sha256": model_weights_sha,
            "model_name": model_name,
            "method_description": f"BM25 pure Python (k1={k1}, b={b})" if model_path is None else f"SentenceTransformer ({model_name})",
            "python_version": sys.version,
            "platform": platform.platform(),
            "processor": platform.processor(),
            "machine": platform.machine(),
            "total_queries_count": len(cases),
            "job_count": len(unique_jobs),
            "deduplicated_pairs_count": eval_results["deduplicated_pairs_count"],
        },
        "latency": {
            "warm_mean_per_case_ms": warm_mean_ms,
            "note": "Warm per-case query scoring latency excluding corpus preparation and model loading. Diagnostic only; not production latency.",
        },
        "disclaimer": "All outputs draft; development internal proxy ranking only; non-independent; no production improvement claim; no training.",
    }

    # Create new output directory
    os.makedirs(output_dir)

    # 1. Write predictions.jsonl
    predictions_path = os.path.join(output_dir, "predictions.jsonl")
    with open(predictions_path, "w", encoding="utf-8") as f:
        for c in cases:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    # 2. Write metrics.json
    metrics_path = os.path.join(output_dir, "metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2, ensure_ascii=False)

    # 3. Write Vietnamese REPORT.md
    report_path = os.path.join(output_dir, "REPORT.md")
    report_text = build_vietnamese_report(metrics_payload, superseded_notice=superseded_notice)
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_text)

    return metrics_payload


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Standalone stdlib offline evaluator for AI1 pilot dataset."
    )
    parser.add_argument(
        "--pairs",
        required=True,
        help="Path to export/pairs.jsonl",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to NEW output directory (must not exist)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Optional local model path or safetensors file",
    )
    parser.add_argument(
        "--model-name",
        default=None,
        help="Model name (required if --model is provided, defaults to 'bm25' otherwise)",
    )
    parser.add_argument(
        "--k1",
        type=float,
        default=1.5,
        help="BM25 k1 parameter (default: 1.5)",
    )
    parser.add_argument(
        "--b",
        type=float,
        default=0.75,
        help="BM25 b parameter (default: 0.75)",
    )
    parser.add_argument(
        "--superseded-notice",
        default=None,
        help="Optional notice text to include when replacing a previous evaluation report",
    )

    args = parser.parse_args()

    try:
        run_evaluation_pipeline(
            pairs_path=args.pairs,
            output_dir=args.output,
            model_path=args.model,
            model_name=args.model_name,
            k1=args.k1,
            b=args.b,
            superseded_notice=args.superseded_notice,
        )
        print(f"Evaluation completed successfully. Results exported to: {args.output}")
    except Exception as exc:
        print(f"Error during evaluation: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
