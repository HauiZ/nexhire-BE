"""Tests for offline AI1 dataset pilot builder."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

# Ensure repo root is on sys.path even when running under python3 -I
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

# Import builder functions from scripts.ai1_dataset_v2
try:
    from scripts.ai1_dataset_v2 import (
        ALLOWED_NEGATIVE_TYPES,
        ALLOWED_SOURCES,
        ALLOWED_SUPPORT_LABELS,
        build_ai1_dataset,
        compute_file_sha256,
        normalize_description,
    )
except ImportError:
    build_ai1_dataset = None


class TestAi1DatasetV2(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="ai1_dataset_test_")
        self.raw_path = os.path.join(self.test_dir, "raw.json")
        self.baseline_path = os.path.join(self.test_dir, "baseline.jsonl")
        self.curated_path = os.path.join(self.test_dir, "curated.jsonl")
        self.output_dir = os.path.join(self.test_dir, "output")

        # Tiny fixtures
        self.raw_data = [
            {
                "job_id": "job_alpha",
                "title": "Alpha Engineer",
                "description": "Software engineering with Python.\nClean code.",
                "response": {
                    "extracted_jd_requirements": [
                        "Must have 3 years Python",
                        "Experience with Docker",
                    ],
                    "generated_cvs": [],
                },
            },
            {
                "job_id": "job_beta",
                "title": "Beta Engineer",
                "description": "software engineering with python.   clean code. ",
                "response": {
                    "extracted_jd_requirements": ["Python expertise"],
                    "generated_cvs": [],
                },
            },
            {
                "job_id": "job_gamma",
                "title": "Gamma Specialist",
                "description": "Data analytics and dashboarding.",
                "response": {
                    "extracted_jd_requirements": ["SQL and BI"],
                    "generated_cvs": [],
                },
            },
            {
                "job_id": "job_heldout",
                "title": "Heldout Role",
                "description": "Security testing and penetration auditing.",
                "response": {
                    "extracted_jd_requirements": ["Pen testing"],
                    "generated_cvs": [],
                },
            },
        ]

        self.baseline_records = [
            {"job_id": "job_heldout", "split": "test"},
        ]

        self.curated_records = [
            {
                "job_id": "job_alpha",
                "requirement_index": 0,
                "requirement_original": "Must have 3 years Python",
                "query": "Must have 3 years Python",
                "query_note": "Core requirement",
                "cv_id": "cv_001",
                "sections": [
                    {
                        "evidence_id": "e_01",
                        "source": "experience",
                        "text": "4 years Python backend developer",
                        "support_label": "full",
                        "negative_type": None,
                    },
                    {
                        "evidence_id": "e_02",
                        "source": "skill",
                        "text": "Intermediate Python",
                        "support_label": "partial",
                        "negative_type": "partial_condition",
                    },
                ],
                "provenance": {
                    "kind": "assistant_synthetic",
                    "review_status": "pending_human_review",
                    "author": "annotator_1",
                },
            },
            {
                "job_id": "job_alpha",
                "requirement_index": 0,
                "requirement_original": "Must have 3 years Python",
                "query": "Must have 3 years Python",
                "query_note": "Core requirement",
                "cv_id": "cv_002",
                "sections": [
                    {
                        "evidence_id": "e_03",
                        "source": "experience",
                        "text": "No Python experience, only Java",
                        "support_label": "contradicted",
                        "negative_type": "technology_mismatch",
                    },
                    {
                        "evidence_id": "e_04",
                        "source": "education",
                        "text": "Degree in History",
                        "support_label": "irrelevant",
                        "negative_type": "unrelated",
                    },
                ],
                "provenance": {
                    "kind": "assistant_synthetic",
                    "review_status": "pending_human_review",
                    "author": "annotator_1",
                },
            },
        ]

        self._write_fixtures()

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def _write_fixtures(self):
        with open(self.raw_path, "w", encoding="utf-8") as f:
            json.dump(self.raw_data, f, ensure_ascii=False)

        with open(self.baseline_path, "w", encoding="utf-8") as f:
            for r in self.baseline_records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

        with open(self.curated_path, "w", encoding="utf-8") as f:
            for r in self.curated_records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    def test_imports_exist(self):
        """Verify module and core symbols exist."""
        self.assertIsNotNone(build_ai1_dataset, "build_ai1_dataset must be importable")

    def test_stable_output_and_splits(self):
        """Deterministic run produces stable splits, manifests, and artifact contents."""
        self.assertIsNotNone(build_ai1_dataset)
        manifest1 = build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
            seed=42,
        )

        out2_dir = os.path.join(self.test_dir, "output_repeat")
        manifest2 = build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=out2_dir,
            seed=42,
        )

        self.assertEqual(manifest1["seed"], 42)
        self.assertEqual(manifest1["counts"], manifest2["counts"])
        self.assertEqual(manifest1["split_info"], manifest2["split_info"])

        # Compare files
        for filename in ["documents.jsonl", "pairs.jsonl", "comparison_candidates.jsonl"]:
            p1 = os.path.join(self.output_dir, filename)
            p2 = os.path.join(out2_dir, filename)
            self.assertEqual(compute_file_sha256(p1), compute_file_sha256(p2))

    def test_exact_normalized_duplicates_share_split(self):
        """Exact normalized duplicate descriptions must receive identical splits."""
        self.assertIsNotNone(build_ai1_dataset)
        manifest = build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
            seed=42,
        )
        splits = manifest["split_info"]["job_splits"]
        # job_alpha and job_beta have same normalized description
        self.assertEqual(splits["job_alpha"], splits["job_beta"])

    def test_baseline_heldout_preserved_and_cannot_train(self):
        """Known baseline heldout sources must preserve their split and never be trained."""
        self.assertIsNotNone(build_ai1_dataset)
        manifest = build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
            seed=42,
        )
        splits = manifest["split_info"]["job_splits"]
        self.assertEqual(splits["job_heldout"], "test")

    def test_invalid_original_quote(self):
        """Curated record with requirement_original not matching raw must be rejected."""
        self.assertIsNotNone(build_ai1_dataset)
        self.curated_records[0]["requirement_original"] = "Wrong original quote text"
        self._write_fixtures()

        with self.assertRaises(ValueError) as ctx:
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )
        self.assertIn("original", str(ctx.exception).lower())

    def test_duplicate_ids(self):
        """Duplicate evidence IDs within a CV or sections must be rejected."""
        self.assertIsNotNone(build_ai1_dataset)
        # Duplicate evidence_id e_01 in same CV sections
        self.curated_records[0]["sections"].append(
            {
                "evidence_id": "e_01",
                "source": "skill",
                "text": "Conflicting duplicate evidence id",
                "support_label": "full",
                "negative_type": None,
            }
        )
        self._write_fixtures()

        with self.assertRaises(ValueError) as ctx:
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )
        self.assertIn("duplicate", str(ctx.exception).lower())

    def test_protected_output(self):
        """Existing output directory must be rejected."""
        self.assertIsNotNone(build_ai1_dataset)
        os.makedirs(self.output_dir, exist_ok=True)
        with open(os.path.join(self.output_dir, "existing.txt"), "w") as f:
            f.write("exists")

        with self.assertRaises(FileExistsError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_partial_exclusion_from_comparison_candidates(self):
        """Support label partial must be excluded from comparison candidates."""
        self.assertIsNotNone(build_ai1_dataset)
        build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
            seed=42,
        )

        candidates_file = os.path.join(self.output_dir, "comparison_candidates.jsonl")
        candidates = []
        with open(candidates_file, "r", encoding="utf-8") as f:
            for line in f:
                candidates.append(json.loads(line))

        self.assertEqual(len(candidates), 2)
        for cand in candidates:
            # Positive must be full, negative must be contradicted or irrelevant
            pos_label = cand["positive"]["support_label"]
            neg_label = cand["negative"]["support_label"]
            self.assertEqual(pos_label, "full")
            self.assertIn(neg_label, {"contradicted", "irrelevant"})
            self.assertNotEqual(pos_label, "partial")
            self.assertNotEqual(neg_label, "partial")
            # Must be across different CVs
            self.assertNotEqual(cand["positive"]["cv_id"], cand["negative"]["cv_id"])
            # Pending review and not approved for training
            self.assertEqual(cand["review_status"], "pending_human_review")
            self.assertFalse(cand["approved_for_training"])
            # Split included
            self.assertIn("split", cand)

    def test_unknown_job_or_index(self):
        """Unknown job_id or requirement_index out of bounds must be rejected."""
        self.assertIsNotNone(build_ai1_dataset)
        # Unknown job_id
        self.curated_records[0]["job_id"] = "non_existent_job"
        self._write_fixtures()
        with self.assertRaises((ValueError, KeyError)):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Restore job_id and test out of bounds index
        self.curated_records[0]["job_id"] = "job_alpha"
        self.curated_records[0]["requirement_index"] = 99
        self._write_fixtures()
        with self.assertRaises((ValueError, IndexError)):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_valid_source_and_label(self):
        """Invalid source, support label, or negative type must be rejected."""
        self.assertIsNotNone(build_ai1_dataset)
        # Invalid source
        self.curated_records[0]["sections"][0]["source"] = "invalid_source"
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Restore source, invalid support label
        self.curated_records[0]["sections"][0]["source"] = "experience"
        self.curated_records[0]["sections"][0]["support_label"] = "somewhat_supported"
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Restore support label, invalid negative type
        self.curated_records[0]["sections"][0]["support_label"] = "full"
        self.curated_records[0]["sections"][0]["negative_type"] = "invalid_neg_type"
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_baseline_conflicting_splits(self):
        """Reject baseline jobs that share exact normalized description but have conflicting splits."""
        self.assertIsNotNone(build_ai1_dataset)
        # job_alpha and job_beta share normalized description
        # If baseline anchors job_alpha as train and job_beta as test:
        self.baseline_records = [
            {"job_id": "job_alpha", "split": "train"},
            {"job_id": "job_beta", "split": "test"},
        ]
        self._write_fixtures()

        with self.assertRaises(ValueError) as ctx:
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )
        self.assertIn("conflict", str(ctx.exception).lower())

    def test_manifest_and_leakage_report_contents(self):
        """Manifest contains checksums, counts, seed, caveats, split info, and leakage report."""
        self.assertIsNotNone(build_ai1_dataset)
        manifest = build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
            seed=42,
        )

        self.assertIn("input_checksums", manifest)
        self.assertIn("raw", manifest["input_checksums"])
        self.assertIn("baseline", manifest["input_checksums"])
        self.assertIn("curated", manifest["input_checksums"])

        self.assertIn("counts", manifest)
        self.assertIn("split_info", manifest)
        self.assertIn("synthetic_silver_caveat", manifest)

        # Leakage report requirements
        self.assertIn("leakage_report", manifest)
        lr = manifest["leakage_report"]
        self.assertFalse(lr["mining_performed"])
        self.assertIn("no actual", lr["mining_report"].lower())
        self.assertIn("near duplicate", lr["near_duplicate_disclaimer"].lower())

    def test_cli_execution(self):
        """CLI invocation via python3 -I works end-to-end."""
        cli_out = os.path.join(self.test_dir, "cli_output")
        cmd = [
            sys.executable,
            "-I",
            "scripts/ai1_dataset_v2.py",
            "--raw",
            self.raw_path,
            "--baseline",
            self.baseline_path,
            "--curated",
            self.curated_path,
            "--output",
            cli_out,
            "--seed",
            "42",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"CLI failed:\nstdout={res.stdout}\nstderr={res.stderr}")

        # Check expected output files exist
        for fname in ["documents.jsonl", "pairs.jsonl", "comparison_candidates.jsonl", "manifest.json"]:
            fpath = os.path.join(cli_out, fname)
            self.assertTrue(os.path.exists(fpath), f"Missing {fname}")

        # Re-running with same output dir must fail (protected output)
        res_conflict = subprocess.run(cmd, capture_output=True, text=True)
        self.assertNotEqual(res_conflict.returncode, 0)

    def test_provenance_validation(self):
        """Invalid provenance kind, review_status, or missing author must be rejected."""
        self.assertIsNotNone(build_ai1_dataset)
        # Invalid kind
        self.curated_records[0]["provenance"]["kind"] = "human_gold"
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Restore kind, invalid review_status
        self.curated_records[0]["provenance"]["kind"] = "assistant_synthetic"
        self.curated_records[0]["provenance"]["review_status"] = "approved"
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Restore review_status, empty author
        self.curated_records[0]["provenance"]["review_status"] = "pending_human_review"
        self.curated_records[0]["provenance"]["author"] = ""
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_duplicate_evidence_id_different_content(self):
        """Same evidence_id for same CV across records with different text must be rejected."""
        self.assertIsNotNone(build_ai1_dataset)
        # Add another record with same job_id, cv_id, evidence_id e_01 but different text
        self.curated_records.append(
            {
                "job_id": "job_alpha",
                "requirement_index": 1,
                "requirement_original": "Experience with Docker",
                "query": "Experience with Docker",
                "query_note": "Secondary requirement",
                "cv_id": "cv_001",
                "sections": [
                    {
                        "evidence_id": "e_01",
                        "source": "experience",
                        "text": "Conflicting text for e_01 in Docker query",
                        "support_label": "full",
                        "negative_type": None,
                    }
                ],
                "provenance": {
                    "kind": "assistant_synthetic",
                    "review_status": "pending_human_review",
                    "author": "annotator_1",
                },
            }
        )
        self._write_fixtures()

        with self.assertRaises(ValueError) as ctx:
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )
        self.assertIn("conflicting", str(ctx.exception).lower())

    def test_insufficient_label_excluded_from_comparison(self):
        """Support label insufficient is excluded from comparison candidates."""
        self.assertIsNotNone(build_ai1_dataset)
        # Change contradicted to insufficient
        self.curated_records[1]["sections"][0]["support_label"] = "insufficient"
        self._write_fixtures()

        manifest = build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
            seed=42,
        )

        candidates_file = os.path.join(self.output_dir, "comparison_candidates.jsonl")
        candidates = []
        with open(candidates_file, "r", encoding="utf-8") as f:
            for line in f:
                candidates.append(json.loads(line))

        # Only e_04 (irrelevant) remains as negative; e_03 (insufficient) excluded
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["negative"]["evidence_id"], "e_04")

    def test_raw_missing_or_empty_job_id(self):
        """Reject raw jobs with missing or empty job_id."""
        self.raw_data[0]["job_id"] = "   "
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_raw_duplicate_job_id(self):
        """Reject raw dataset with duplicate job_ids."""
        self.raw_data[1]["job_id"] = self.raw_data[0]["job_id"]
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_raw_missing_or_empty_description(self):
        """Reject raw jobs with missing or empty description."""
        self.raw_data[0]["description"] = "\n \t"
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_baseline_missing_or_empty_job_id(self):
        """Reject baseline with missing or empty job_id."""
        self.baseline_records.append({"job_id": "", "split": "train"})
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_baseline_invalid_split(self):
        """Reject baseline with invalid split name."""
        self.baseline_records.append({"job_id": "job_custom", "split": "invalid_split"})
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_ratio_validation(self):
        """Reject non-finite or invalid split ratios."""
        for train_r, val_r in [
            (0.0, 0.1),
            (1.0, 0.1),
            (-0.1, 0.1),
            (0.8, -0.1),
            (0.8, 1.0),
            (0.8, 0.25),
            (float("nan"), 0.1),
            (0.8, float("inf")),
        ]:
            with self.assertRaises(ValueError):
                build_ai1_dataset(
                    raw_path=self.raw_path,
                    baseline_path=self.baseline_path,
                    curated_path=self.curated_path,
                    output_dir=self.output_dir,
                    train_ratio=train_r,
                    val_ratio=val_r,
                )

    def test_curated_malformed_types(self):
        """Reject curated records with malformed types."""
        # Non-string job_id
        self.curated_records[0]["job_id"] = 12345
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Boolean requirement_index
        self.curated_records[0]["job_id"] = "job_alpha"
        self.curated_records[0]["requirement_index"] = True
        self._write_fixtures()
        with self.assertRaises((ValueError, IndexError)):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Empty query
        self.curated_records[0]["requirement_index"] = 0
        self.curated_records[0]["query"] = "  "
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Empty cv_id
        self.curated_records[0]["query"] = "Must have 3 years Python"
        self.curated_records[0]["cv_id"] = " "
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        # Empty sections list
        self.curated_records[0]["cv_id"] = "cv_001"
        self.curated_records[0]["sections"] = []
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_curated_training_approval_rejected(self):
        """Reject curated records attempting to claim approved training."""
        self.curated_records[0]["approved_for_training"] = True
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

        self.curated_records[0]["approved_for_training"] = False
        self.curated_records[0]["sections"][0]["approved_for_training"] = True
        self._write_fixtures()
        with self.assertRaises(ValueError):
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )

    def test_documents_preserve_provenance(self):
        """Verify exported documents retain provenance."""
        build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
        )
        docs_file = os.path.join(self.output_dir, "documents.jsonl")
        with open(docs_file, "r", encoding="utf-8") as f:
            for line in f:
                doc = json.loads(line)
                self.assertIn("provenance", doc)
                self.assertEqual(doc["provenance"]["kind"], "assistant_synthetic")
                self.assertEqual(doc["provenance"]["review_status"], "pending_human_review")

    def test_duplicate_pair_id_rejected(self):
        """Reject duplicate pair identities across curated records."""
        # Add identical section twice to the same curated record under same query/req
        self.curated_records.append(dict(self.curated_records[0]))
        self._write_fixtures()
        with self.assertRaises(ValueError) as ctx:
            build_ai1_dataset(
                raw_path=self.raw_path,
                baseline_path=self.baseline_path,
                curated_path=self.curated_path,
                output_dir=self.output_dir,
            )
        self.assertIn("duplicate", str(ctx.exception).lower())

    def test_leakage_report_baseline_coverage_caveat(self):
        """Leakage report includes explicit baseline description coverage caveat and counts."""
        manifest = build_ai1_dataset(
            raw_path=self.raw_path,
            baseline_path=self.baseline_path,
            curated_path=self.curated_path,
            output_dir=self.output_dir,
        )
        lr = manifest["leakage_report"]
        self.assertIn("baseline_description_coverage_caveat", lr)
        self.assertIn("cannot be claimed", lr["baseline_description_coverage_caveat"].lower())
        self.assertIn("cross-dataset", lr["baseline_description_coverage_caveat"].lower())
        self.assertEqual(lr["baseline_total_jobs"], 1)
        self.assertEqual(lr["baseline_jobs_in_raw_with_description"], 1)
        self.assertEqual(lr["baseline_jobs_missing_from_raw"], 0)


if __name__ == "__main__":
    unittest.main()
