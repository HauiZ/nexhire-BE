#!/usr/bin/env python3
"""Unit tests for AI1 train mining runner."""

import csv
import json
import math
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.mine_ai1_train import (
    classify_comparison,
    export_corrected_review_from_scored,
    form_comparisons,
    load_train_records,
    normalize_semantic_text,
)


class TestMineAi1Train(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="test-ai1-mine-"))

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_normalize_semantic_text(self):
        self.assertEqual(normalize_semantic_text("  Java   Backend\n\tAPIs "), "java backend apis")
        self.assertEqual(normalize_semantic_text(None), "")

    def test_load_train_records_train_only(self):
        jsonl_path = self.tmp_dir / "test_semantic.jsonl"
        records = [
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Req 1", "evidence_id": "e1", "evidence": "Ev 1", "label": 1, "negative_type": None},
            {"record_id": "r2", "split": "validation", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Req 1", "evidence_id": "e2", "evidence": "Ev 2", "label": 0, "negative_type": "hard"},
            {"record_id": "r3", "split": "test", "job_id": "j2", "requirement_id": "req2@en", "requirement": "Req 2", "evidence_id": "e3", "evidence": "Ev 3", "label": 1, "negative_type": None},
            {"record_id": "r4", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Req 1", "evidence_id": "e4", "evidence": "Ev 4", "label": 0, "negative_type": "hard"},
        ]
        with open(jsonl_path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        loaded = load_train_records(jsonl_path)
        self.assertEqual(len(loaded), 2)
        self.assertEqual({r["record_id"] for r in loaded}, {"r1", "r4"})

    def test_load_train_records_duplicate_rejected(self):
        jsonl_path = self.tmp_dir / "dup.jsonl"
        records = [
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Req 1", "evidence": "Ev 1", "label": 1},
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Req 1", "evidence": "Ev 1 dup", "label": 1},
        ]
        with open(jsonl_path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        with self.assertRaises(ValueError) as ctx:
            load_train_records(jsonl_path)
        self.assertIn("Duplicate record_id", str(ctx.exception))

    def test_load_train_records_conflicting_label_rejected(self):
        jsonl_path = self.tmp_dir / "conflict.jsonl"
        records = [
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Req 1", "evidence": "Ev 1", "label": 1},
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Req 1", "evidence": "Ev 1", "label": 0},
        ]
        with open(jsonl_path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        with self.assertRaises(ValueError) as ctx:
            load_train_records(jsonl_path)
        self.assertIn("Conflicting labels", str(ctx.exception))

    def test_form_comparisons(self):
        train_records = [
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Java", "evidence_id": "e1", "evidence": "Java Spring", "label": 1, "negative_type": None},
            {"record_id": "r2", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Java", "evidence_id": "e2", "evidence": "Python Django", "label": 0, "negative_type": "hard"},
            {"record_id": "r3", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Java", "evidence_id": "e3", "evidence": "Node JS", "label": 0, "negative_type": "random"},
            {"record_id": "r4", "split": "train", "job_id": "j2", "requirement_id": "req2@en", "requirement": "AWS", "evidence_id": "e4", "evidence": "AWS ECS", "label": 1, "negative_type": None},
        ]
        scores = {
            "r1": 0.85,
            "r2": 0.88,  # Inversion! (neg > pos)
            "r3": 0.77,  # Margin violation! (pos - neg = 0.08 < 0.1)
            "r4": 0.90,  # No negative for j2
        }
        comps = form_comparisons(train_records, scores)
        self.assertEqual(len(comps), 2)

        c_inv = next(c for c in comps if c["neg_record_id"] == "r2")
        self.assertEqual(c_inv["status"], "INVERSION_ERROR")
        self.assertAlmostEqual(c_inv["score_diff"], 0.03, places=4)
        self.assertEqual(c_inv["split"], "train")
        self.assertEqual(c_inv["pos_label"], 1)
        self.assertEqual(c_inv["neg_label"], 0)
        self.assertEqual(c_inv["positive_evidence"], "Java Spring")
        self.assertEqual(c_inv["negative_evidence"], "Python Django")

        c_margin = next(c for c in comps if c["neg_record_id"] == "r3")
        self.assertEqual(c_margin["status"], "MARGIN_VIOLATION")
        self.assertAlmostEqual(c_margin["score_diff"], -0.08, places=4)

    def test_form_comparisons_exact_requirement_grouping(self):
        # Two records share job_id and requirement_id, but have different requirement texts
        train_records = [
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Requirement Version A", "evidence": "Ev A pos", "label": 1},
            {"record_id": "r2", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Requirement Version B", "evidence": "Ev B neg", "label": 0},
        ]
        scores = {"r1": 0.8, "r2": 0.6}
        comps = form_comparisons(train_records, scores)
        # Because requirements differ, they should NOT form a comparison pair
        self.assertEqual(len(comps), 0)

    def test_form_comparisons_csv_actual_text(self):
        train_records = [
            {"record_id": "p1", "split": "train", "job_id": "j10", "requirement_id": "r1@vi", "requirement": "Có kinh nghiệm Go", "evidence": "3 năm Golang backend", "label": 1},
            {"record_id": "n1", "split": "train", "job_id": "j10", "requirement_id": "r1@vi", "requirement": "Có kinh nghiệm Go", "evidence": "Chỉ biết PHP Laravel", "label": 0, "negative_type": "hard"},
        ]
        scores = {"p1": 0.70, "n1": 0.75}
        comps = form_comparisons(train_records, scores)
        self.assertEqual(len(comps), 1)
        c = comps[0]

        # Verify positive_evidence and negative_evidence are populated
        self.assertEqual(c["positive_evidence"], "3 năm Golang backend")
        self.assertEqual(c["negative_evidence"], "Chỉ biết PHP Laravel")

        # Verify CSV export contains actual non-empty text
        csv_path = self.tmp_dir / "test_review.csv"
        csv_fields = [
            "comparison_id",
            "job_id",
            "language",
            "status",
            "score_diff",
            "neg_score",
            "pos_score",
            "neg_type",
            "pos_evidence_source",
            "neg_evidence_source",
            "requirement",
            "positive_evidence",
            "negative_evidence",
            "review_decision",
        ]
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=csv_fields)
            writer.writeheader()
            writer.writerow({k: c.get(k) for k in csv_fields})

        with open(csv_path, "r", encoding="utf-8") as f:
            reader = list(csv.DictReader(f))
        self.assertEqual(len(reader), 1)
        self.assertEqual(reader[0]["positive_evidence"], "3 năm Golang backend")
        self.assertEqual(reader[0]["negative_evidence"], "Chỉ biết PHP Laravel")
        self.assertNotEqual(reader[0]["positive_evidence"], "")
        self.assertNotEqual(reader[0]["negative_evidence"], "")

    def test_form_comparisons_missing_score_raises(self):
        train_records = [
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Java", "evidence": "Java Spring", "label": 1},
            {"record_id": "r2", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Java", "evidence": "Python", "label": 0},
        ]
        # r2 missing from scores
        scores = {"r1": 0.85}
        with self.assertRaises(ValueError) as ctx:
            form_comparisons(train_records, scores)
        self.assertIn("Missing score", str(ctx.exception))

    def test_form_comparisons_nonfinite_score_raises(self):
        train_records = [
            {"record_id": "r1", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Java", "evidence": "Java Spring", "label": 1},
            {"record_id": "r2", "split": "train", "job_id": "j1", "requirement_id": "req1@en", "requirement": "Java", "evidence": "Python", "label": 0},
        ]
        scores_nan = {"r1": float("nan"), "r2": 0.8}
        with self.assertRaises(ValueError) as ctx:
            form_comparisons(train_records, scores_nan)
        self.assertIn("nonfinite score", str(ctx.exception))

        scores_inf = {"r1": 0.8, "r2": float("inf")}
        with self.assertRaises(ValueError) as ctx:
            form_comparisons(train_records, scores_inf)
        self.assertIn("nonfinite score", str(ctx.exception))

    def test_classify_comparison(self):
        # Inversion
        status, is_err, is_margin = classify_comparison(0.70, 0.75, margin=0.1)
        self.assertEqual(status, "INVERSION_ERROR")
        self.assertTrue(is_err)
        self.assertTrue(is_margin)

        # Margin violation (pos is higher, but not by margin)
        status, is_err, is_margin = classify_comparison(0.75, 0.70, margin=0.1)
        self.assertEqual(status, "MARGIN_VIOLATION")
        self.assertFalse(is_err)
        self.assertTrue(is_margin)

        # Correct
        status, is_err, is_margin = classify_comparison(0.85, 0.70, margin=0.1)
        self.assertEqual(status, "CORRECT")
        self.assertFalse(is_err)
        self.assertFalse(is_margin)

    def test_bilingual_counts_and_language_grouping(self):
        train_records = [
            {"record_id": "en_pos", "split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "Python", "evidence": "Python dev", "label": 1},
            {"record_id": "en_neg", "split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "Python", "evidence": "Java dev", "label": 0},
            {"record_id": "vi_pos", "split": "train", "job_id": "j2", "requirement_id": "r1@vi", "requirement": "Lập trình Python", "evidence": "Kinh nghiệm Python", "label": 1},
            {"record_id": "vi_neg", "split": "train", "job_id": "j2", "requirement_id": "r1@vi", "requirement": "Lập trình Python", "evidence": "Kinh nghiệm Java", "label": 0},
        ]
        scores = {"en_pos": 0.8, "en_neg": 0.85, "vi_pos": 0.9, "vi_neg": 0.7}
        comps = form_comparisons(train_records, scores)
        self.assertEqual(len(comps), 2)
        lang_map = {c["requirement_id"]: c["language"] for c in comps}
        self.assertEqual(lang_map["r1@en"], "en")
        self.assertEqual(lang_map["r1@vi"], "vi")

    def test_export_corrected_review_from_scored(self):
        mock_scored_path = self.tmp_dir / "scored_input.jsonl"
        out_dir = self.tmp_dir / "corrected_out"

        mock_records = [
            {"record_id": "p1", "split": "train", "job_id": "j1", "requirement_id": "r1@vi", "requirement": "Docker", "evidence": "Docker expert", "label": 1, "negative_type": None, "m1_cosine_score": 0.65},
            {"record_id": "n1", "split": "train", "job_id": "j1", "requirement_id": "r1@vi", "requirement": "Docker", "evidence": "K8s only", "label": 0, "negative_type": "hard", "m1_cosine_score": 0.75},
            {"record_id": "p2", "split": "train", "job_id": "j2", "requirement_id": "r2@en", "requirement": "SQL", "evidence": "Postgres SQL", "label": 1, "negative_type": None, "m1_cosine_score": 0.80},
            {"record_id": "n2", "split": "train", "job_id": "j2", "requirement_id": "r2@en", "requirement": "SQL", "evidence": "MongoDB NoSQL", "label": 0, "negative_type": "random", "m1_cosine_score": 0.75},
        ]
        with open(mock_scored_path, "w", encoding="utf-8") as f:
            for r in mock_records:
                f.write(json.dumps(r) + "\n")

        export_corrected_review_from_scored(
            scored_path=mock_scored_path,
            output_dir=out_dir,
            margin=0.1,
            top_review=10,
        )

        self.assertTrue((out_dir / "summary.json").exists())
        self.assertTrue((out_dir / "REPORT.md").exists())
        self.assertTrue((out_dir / "review.csv").exists())
        self.assertTrue((out_dir / "review.jsonl").exists())
        self.assertTrue((out_dir / "all_comparisons.jsonl").exists())

        with open(out_dir / "summary.json", "r", encoding="utf-8") as f:
            summary = json.load(f)
        self.assertEqual(summary["total_comparisons"], 2)
        self.assertEqual(summary["inversion_errors_count"], 1)
        self.assertEqual(summary["margin_violations_count"], 2)
        self.assertEqual(summary["truncation_info"], "unknown_from_historical_run")
        self.assertEqual(summary["library_versions"], "unknown_from_historical_run")
        self.assertIn("top_review_composition", summary)

        # Check review.csv has populated positive_evidence and negative_evidence
        with open(out_dir / "review.csv", "r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["positive_evidence"], "Docker expert")
        self.assertEqual(rows[0]["negative_evidence"], "K8s only")


if __name__ == "__main__":
    unittest.main()
