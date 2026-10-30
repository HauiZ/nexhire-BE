#!/usr/bin/env python3
"""Unit tests for AI1 raw mining candidate preparation."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.prepare_ai1_raw_mining import (
    assign_deterministic_split,
    build_raw_mining_preparation,
    extract_candidate_records,
    group_and_split_raw_jobs,
    load_baseline_splits,
    normalize_description,
)


class TestPrepareAi1RawMining(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="test-ai1-prep-"))

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_normalize_description(self):
        self.assertEqual(normalize_description("  Senior   Java   Developer\n "), "senior java developer")
        self.assertEqual(normalize_description(None), "")
        self.assertEqual(normalize_description(""), "")

    def test_load_baseline_splits(self):
        sem_path = self.tmp_dir / "baseline.jsonl"
        lines = [
            {"job_id": "j1", "split": "train"},
            {"job_id": "j2", "split": "validation"},
            {"job_id": "j3", "split": "test"},
        ]
        with open(sem_path, "w", encoding="utf-8") as f:
            for l in lines:
                f.write(json.dumps(l) + "\n")

        splits, total = load_baseline_splits(sem_path)
        self.assertEqual(total, 3)
        self.assertEqual(splits["j1"], "train")
        self.assertEqual(splits["j2"], "validation")
        self.assertEqual(splits["j3"], "test")

    def test_load_baseline_splits_conflict_rejected(self):
        sem_path = self.tmp_dir / "conflict.jsonl"
        lines = [
            {"job_id": "j1", "split": "train"},
            {"job_id": "j1", "split": "validation"},
        ]
        with open(sem_path, "w", encoding="utf-8") as f:
            for l in lines:
                f.write(json.dumps(l) + "\n")

        with self.assertRaises(ValueError) as ctx:
            load_baseline_splits(sem_path)
        self.assertIn("Conflicting splits", str(ctx.exception))

    def test_group_and_split_preserve_baseline_and_duplicate_grouping(self):
        raw_jobs = [
            {"job_id": "j_val_anchor", "description": "Backend Engineer Go Python"},
            {"job_id": "j_val_dup", "description": "  Backend   Engineer   Go   Python  "},  # exact duplicate of val anchor
            {"job_id": "j_new", "description": "Frontend React TypeScript Engineer"},
        ]
        baseline_splits = {"j_val_anchor": "validation"}

        resolved_splits, desc_groups, stats = group_and_split_raw_jobs(
            raw_jobs, baseline_splits, seed=42
        )

        # Both j_val_anchor and j_val_dup must inherit validation
        self.assertEqual(resolved_splits["j_val_anchor"], "validation")
        self.assertEqual(resolved_splits["j_val_dup"], "validation")
        self.assertIn(resolved_splits["j_new"], ("train", "validation", "test"))
        self.assertEqual(len(desc_groups), 2)
        self.assertEqual(stats["exact_duplicate_groups_count"], 1)

    def test_group_and_split_conflicting_baseline_in_group_rejected(self):
        raw_jobs = [
            {"job_id": "j1", "description": "Identical description"},
            {"job_id": "j2", "description": "Identical description"},
        ]
        # j1 is train, j2 is test
        baseline_splits = {"j1": "train", "j2": "test"}

        with self.assertRaises(ValueError) as ctx:
            group_and_split_raw_jobs(raw_jobs, baseline_splits)
        self.assertIn("Conflicting baseline splits", str(ctx.exception))

    def test_extract_candidate_records_honest_null_source_and_unreviewed(self):
        mock_job = {
            "job_id": "1001",
            "title": "Data Engineer",
            "description": "Build pipelines",
            "description_sha256": "desc_sha_test",
            "generator_model": "test-llm-v1",
            "prompt_sha256": "prompt_sha_test",
            "generated_at": "2026-10-29T10:00:00Z",
            "response": {
                "extracted_jd_requirements": ["Experience with Spark"],
                "generated_cvs": [
                    {
                        "candidate_label": 3,
                        "features_for_ai2": {},
                        "requirement_evidence_pairs_for_ai1": [
                            {
                                "requirement": "Experience with Spark",
                                "cv_evidence": "Built PySpark streaming jobs",
                                "is_semantic_match": 1,
                                # Note: evidence_source is absent
                            }
                        ],
                    }
                ],
            },
        }

        recs = extract_candidate_records(mock_job, split="train")
        self.assertEqual(len(recs), 1)
        r = recs[0]

        # Verify honest metadata and unreviewed silver markers
        self.assertEqual(r["job_id"], "1001")
        self.assertEqual(r["split"], "train")
        self.assertEqual(r["raw_candidate_label"], 3)
        self.assertEqual(r["raw_is_semantic_match"], 1)
        self.assertEqual(r["original_label"], 1)
        self.assertIsNone(r["evidence_source"])
        self.assertEqual(r["review_status"], "unreviewed_silver")
        self.assertFalse(r["approved_for_training"])
        self.assertEqual(r["training_gate_status"], "BLOCKED_PENDING_HUMAN_REVIEW")
        self.assertIn("MUST NOT be used for training", r["disclaimer"])

    def test_build_raw_mining_preparation_end_to_end(self):
        raw_path = self.tmp_dir / "raw.json"
        sem_path = self.tmp_dir / "semantic.jsonl"
        out_dir = self.tmp_dir / "output_prep"

        raw_data = [
            {
                "job_id": "job_heldout",
                "title": "Val Engineer",
                "description": "Val description",
                "response": {
                    "extracted_jd_requirements": ["Req 1"],
                    "generated_cvs": [
                        {
                            "candidate_label": 1,
                            "requirement_evidence_pairs_for_ai1": [
                                {"requirement": "Req 1", "cv_evidence": "Val Ev", "is_semantic_match": 0}
                            ],
                        }
                    ],
                },
            },
            {
                "job_id": "job_train",
                "title": "Train Engineer",
                "description": "Train description",
                "response": {
                    "extracted_jd_requirements": ["Req 2"],
                    "generated_cvs": [
                        {
                            "candidate_label": 2,
                            "requirement_evidence_pairs_for_ai1": [
                                {"requirement": "Req 2", "cv_evidence": "Train Ev", "is_semantic_match": 1}
                            ],
                        }
                    ],
                },
            },
        ]
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(raw_data, f)

        # Baseline anchors job_heldout to validation
        with open(sem_path, "w", encoding="utf-8") as f:
            f.write(json.dumps({"job_id": "job_heldout", "split": "validation"}) + "\n")

        manifest = build_raw_mining_preparation(
            raw_path=raw_path,
            semantic_path=sem_path,
            output_dir=out_dir,
            seed=42,
            train_ratio=1.0,  # Force unanchored job_train to train
            val_ratio=0.0,
        )

        self.assertTrue((out_dir / "candidates.jsonl").exists())
        self.assertTrue((out_dir / "heldout_candidates.jsonl").exists())
        self.assertTrue((out_dir / "manifest.json").exists())
        self.assertTrue((out_dir / "REVIEW_INSTRUCTIONS.md").exists())

        # Check candidates.jsonl only contains train
        with open(out_dir / "candidates.jsonl", "r", encoding="utf-8") as f:
            cand_lines = [json.loads(l) for l in f]
        self.assertEqual(len(cand_lines), 1)
        self.assertEqual(cand_lines[0]["job_id"], "job_train")
        self.assertEqual(cand_lines[0]["split"], "train")

        # Check heldout_candidates.jsonl contains validation
        with open(out_dir / "heldout_candidates.jsonl", "r", encoding="utf-8") as f:
            held_lines = [json.loads(l) for l in f]
        self.assertEqual(len(held_lines), 1)
        self.assertEqual(held_lines[0]["job_id"], "job_heldout")
        self.assertEqual(held_lines[0]["split"], "validation")

        # Check manifest training gate and limitation
        self.assertFalse(manifest["training_gate"]["approved_for_training"])
        self.assertEqual(manifest["training_gate"]["status"], "BLOCKED_PENDING_HUMAN_REVIEW")
        self.assertIn("Near duplicate detection against baseline cannot complete", manifest["near_duplicate_detection_limitation"])
        self.assertEqual(manifest["split_summary"]["train_candidates"], 1)
        self.assertEqual(manifest["split_summary"]["heldout_candidates_total"], 1)

        # Check review instructions in Vietnamese
        with open(out_dir / "REVIEW_INSTRUCTIONS.md", "r", encoding="utf-8") as f:
            instructions = f.read()
        self.assertIn("HƯỚNG DẪN RÀ SOÁT DỮ LIỆU", instructions)
        self.assertIn("BLOCKED_PENDING_HUMAN_REVIEW", instructions)


if __name__ == "__main__":
    unittest.main()
