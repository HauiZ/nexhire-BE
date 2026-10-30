"""Unit and regression tests for AI1 Kaggle experiment runner and bundle builder.

Lightweight, stdlib-only test suite covering:
1. Split & leakage detection (train/silver vs validation/test)
2. Invalid input handling & fail-closed label conflict on duplicate normalized evidence
3. Full silver invariant (full support positive vs lower negative)
4. Manifest tamper detection, safe path verification, archive safety
5. Metric correctness: known rankings, no-positive exclusion, deterministic ties
6. Fixed step schedules, deterministic mixture (25% silver slots), exposure tracking
7. Test exclusion from model selection & baseline eligibility
8. Paired job bootstrap confidence intervals
9. Notebook JSON structure and Python code compilation
10. CLI argument parsing and smoke execution
"""

import copy
import hashlib
import json
import math
import os
import random
import tempfile
import unittest
import zipfile
from pathlib import Path

# Runner and bundle builder modules will be imported
import sys

# Add repo/scripts to sys.path
WORKTREE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKTREE_ROOT / "scripts"))

from ai1_kaggle_experiment import (
    normalize_semantic_text,
    compute_sha256,
    build_restricted_candidate_pools,
    validate_no_leakage,
    validate_silver_records,
    compute_query_ranking_metrics,
    aggregate_metrics,
    paired_job_bootstrap,
    deterministic_batch_sampler,
    select_best_checkpoint,
    verify_manifest,
    run_experiment,
)
from build_ai1_kaggle_bundle import (
    MODEL_FILE_ALLOWLIST,
    safe_extract_model_archive,
    build_bundle,
    validate_raw_train_provenance,
)


class TestAi1TextNormalization(unittest.TestCase):
    def test_normalize_semantic_text(self):
        text = "  Kỹ   Năng   Python \n và Docker!  "
        normalized = normalize_semantic_text(text)
        self.assertEqual(normalized, "kỹ năng python và docker!")

    def test_normalize_empty_none(self):
        self.assertEqual(normalize_semantic_text(""), "")
        self.assertEqual(normalize_semantic_text(None), "")


class TestCandidatePoolsAndValidation(unittest.TestCase):
    def test_grouping_and_deduplication(self):
        rows = [
            {
                "split": "validation",
                "job_id": "job_1",
                "requirement_id": "req_1",
                "requirement": "Python senior",
                "candidate_id": "c1",
                "evidence_id": "e1",
                "evidence": "5 years Python Django",
                "label": 1,
            },
            {
                "split": "validation",
                "job_id": "job_1",
                "requirement_id": "req_1",
                "requirement": "Python senior",
                "candidate_id": "c2",
                "evidence_id": "e2",
                "evidence": "Junior Java developer",
                "label": 0,
            },
            {
                # Duplicate identical normalized evidence with SAME label -> should dedup
                "split": "validation",
                "job_id": "job_1",
                "requirement_id": "req_1",
                "requirement": "Python senior",
                "candidate_id": "c3",
                "evidence_id": "e3",
                "evidence": "5  years   Python Django",
                "label": 1,
            },
        ]
        pools = build_restricted_candidate_pools(rows, split="validation")
        self.assertEqual(len(pools), 1)
        q_pool = pools[0]
        self.assertEqual(q_pool["job_id"], "job_1")
        self.assertEqual(len(q_pool["candidates"]), 2)  # deduped from 3 to 2
        pos_candidates = [c for c in q_pool["candidates"] if c["label"] == 1]
        self.assertEqual(len(pos_candidates), 1)

    def test_duplicate_evidence_label_conflict_fails_closed(self):
        rows = [
            {
                "split": "validation",
                "job_id": "job_1",
                "requirement_id": "req_1",
                "requirement": "Python senior",
                "candidate_id": "c1",
                "evidence": "5 years Python Django",
                "label": 1,
            },
            {
                # Same evidence with conflicting label
                "split": "validation",
                "job_id": "job_1",
                "requirement_id": "req_1",
                "requirement": "Python senior",
                "candidate_id": "c2",
                "evidence": "5 years python django",
                "label": 0,
            },
        ]
        with self.assertRaises(ValueError) as ctx:
            build_restricted_candidate_pools(rows, split="validation")
        self.assertIn("Conflicting labels", str(ctx.exception))


class TestSilverInvariantAndLeakage(unittest.TestCase):
    def test_full_silver_invariant_valid(self):
        valid_records = [
            {
                "comparison_id": "cmp_01",
                "split": "train",
                "job_id": "job_01",
                "requirement": "English communication",
                "positive_evidence": "Daily scrum in English with client",
                "negative_evidence": "Basic English",
                "proposed_support": {"positive": "full", "negative": "partial"},
                "inclusion_in_silver_experiment": True,
            },
            {
                "comparison_id": "cmp_02",
                "split": "train",
                "job_id": "job_02",
                "requirement": "Kubernetes orchestration",
                "positive_evidence": "Deployed microservices on EKS",
                "negative_evidence": "Docker compose on local PC only",
                "proposed_support": {"positive": "full", "negative": "insufficient"},
                "inclusion_in_silver_experiment": True,
            },
        ]
        # Should pass without error
        validated = validate_silver_records(valid_records)
        self.assertEqual(len(validated), 2)

    def test_silver_invariant_rejects_non_full_positive(self):
        invalid_records = [
            {
                "comparison_id": "cmp_bad_pos",
                "split": "train",
                "job_id": "job_01",
                "requirement": "Req",
                "positive_evidence": "Evi pos",
                "negative_evidence": "Evi neg",
                "proposed_support": {"positive": "partial", "negative": "insufficient"},
                "inclusion_in_silver_experiment": True,
            }
        ]
        with self.assertRaises(ValueError) as ctx:
            validate_silver_records(invalid_records)
        self.assertIn("positive support must be 'full'", str(ctx.exception))

    def test_silver_invariant_rejects_non_train_split(self):
        invalid_records = [
            {
                "comparison_id": "cmp_bad_split",
                "split": "test",  # must be train only!
                "job_id": "job_01",
                "requirement": "Req",
                "positive_evidence": "Evi pos",
                "negative_evidence": "Evi neg",
                "proposed_support": {"positive": "full", "negative": "partial"},
                "inclusion_in_silver_experiment": True,
            }
        ]
        with self.assertRaises(ValueError) as ctx:
            validate_silver_records(invalid_records)
        self.assertIn("train split only", str(ctx.exception))

    def test_split_leakage_detection(self):
        train_pairs = [
            {"job_id": "job_train", "requirement": "Req A", "evidence": "Evi A"},
        ]
        silver_pairs = [
            {"job_id": "job_silver", "requirement": "Req B", "evidence": "Evi B"},
        ]
        # Clean val/test
        val_rows = [
            {"split": "validation", "job_id": "job_val", "requirement": "Req C", "evidence": "Evi C", "label": 1},
        ]
        test_rows = [
            {"split": "test", "job_id": "job_test", "requirement": "Req D", "evidence": "Evi D", "label": 1},
        ]
        # No leak should pass
        validate_no_leakage(train_pairs, silver_pairs, val_rows, test_rows)

        # Introduce job_id leak in silver -> val
        leaking_silver = [
            {"job_id": "job_val", "requirement": "Req Silver", "evidence": "Evi Silver"},
        ]
        with self.assertRaises(ValueError) as ctx:
            validate_no_leakage(train_pairs, leaking_silver, val_rows, test_rows)
        self.assertIn("Job ID leakage", str(ctx.exception))

        # Introduce exact pair leak in silver -> test
        leaking_pair_silver = [
            {"job_id": "job_other", "requirement": "req d", "evidence": "evi d"},
        ]
        with self.assertRaises(ValueError) as ctx:
            validate_no_leakage(train_pairs, leaking_pair_silver, val_rows, test_rows)
        self.assertIn("Pair leakage", str(ctx.exception))


class TestArchiveSafetyAndManifest(unittest.TestCase):
    def test_safe_extract_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            bad_zip = Path(tmpdir) / "bad_traversal.zip"
            with zipfile.ZipFile(bad_zip, "w") as zf:
                zf.writestr("../evil.txt", "malicious")

            extract_dest = Path(tmpdir) / "extracted"
            with self.assertRaises(ValueError) as ctx:
                safe_extract_model_archive(bad_zip, extract_dest)
            self.assertIn("traversal", str(ctx.exception).lower())

    def test_safe_extract_rejects_unallowlisted_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            bad_zip = Path(tmpdir) / "bad_file.zip"
            with zipfile.ZipFile(bad_zip, "w") as zf:
                zf.writestr("model.safetensors", "dummy weights")
                zf.writestr("unauthorized_file.txt", "unallowlisted content")

            extract_dest = Path(tmpdir) / "extracted"
            with self.assertRaises(ValueError) as ctx:
                safe_extract_model_archive(bad_zip, extract_dest)
            self.assertIn("allowlist", str(ctx.exception).lower())

            # Also verify executable script rejection
            script_zip = Path(tmpdir) / "script.zip"
            with zipfile.ZipFile(script_zip, "w") as zf:
                zf.writestr("script.py", "print('bad')")
            with self.assertRaises(ValueError) as ctx:
                safe_extract_model_archive(script_zip, extract_dest)
            self.assertIn("not allowed", str(ctx.exception).lower())

    def test_manifest_verification_and_tamper(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "bundle"
            bundle_dir.mkdir()
            f1 = bundle_dir / "data.jsonl"
            f1.write_text("hello world\n", encoding="utf-8")

            sha = hashlib.sha256(b"hello world\n").hexdigest()
            manifest = {
                "schema_version": "ai1-kaggle-bundle-v1",
                "artifacts": {
                    "data.jsonl": sha,
                },
            }
            manifest_file = bundle_dir / "manifest.json"
            manifest_file.write_text(json.dumps(manifest), encoding="utf-8")

            # Verification should pass
            verify_manifest(bundle_dir)

            # Tamper with file
            f1.write_text("tampered content\n", encoding="utf-8")
            with self.assertRaises(ValueError) as ctx:
                verify_manifest(bundle_dir)
            self.assertIn("SHA-256 mismatch", str(ctx.exception))

            # Extra unexpected file
            f1.write_text("hello world\n", encoding="utf-8")
            extra = bundle_dir / "unexpected.txt"
            extra.write_text("surprise", encoding="utf-8")
            with self.assertRaises(ValueError) as ctx:
                verify_manifest(bundle_dir)
            self.assertIn("Unexpected file", str(ctx.exception))


class TestMetricCalculations(unittest.TestCase):
    def test_known_ranking_metrics(self):
        # Case 1: Relevant at rank 1 out of 3
        # Candidate scores: c1 (label 1) -> 0.9, c2 (0) -> 0.4, c3 (0) -> 0.2
        ranked_candidates = [
            {"candidate_id": "c1", "label": 1, "score": 0.9},
            {"candidate_id": "c2", "label": 0, "score": 0.4},
            {"candidate_id": "c3", "label": 0, "score": 0.2},
        ]
        m = compute_query_ranking_metrics(ranked_candidates)
        self.assertEqual(m["mrr"], 1.0)
        self.assertEqual(m["hit1"], 1.0)
        self.assertEqual(m["hit3"], 1.0)
        self.assertEqual(m["recall1"], 1.0)
        self.assertEqual(m["recall3"], 1.0)

        # Case 2: Relevant at rank 2 out of 4
        # c2 (0) -> 0.8, c1 (1) -> 0.6, c3 (0) -> 0.3, c4 (0) -> 0.1
        ranked_candidates_2 = [
            {"candidate_id": "c2", "label": 0, "score": 0.8},
            {"candidate_id": "c1", "label": 1, "score": 0.6},
            {"candidate_id": "c3", "label": 0, "score": 0.3},
            {"candidate_id": "c4", "label": 0, "score": 0.1},
        ]
        m2 = compute_query_ranking_metrics(ranked_candidates_2)
        self.assertAlmostEqual(m2["mrr"], 0.5)
        self.assertEqual(m2["hit1"], 0.0)
        self.assertEqual(m2["hit3"], 1.0)
        self.assertEqual(m2["recall1"], 0.0)
        self.assertEqual(m2["recall3"], 1.0)

        # Case 3: 2 relevants: rank 1 and rank 3 out of 4
        # c1 (1) -> 0.9, c2 (0) -> 0.7, c3 (1) -> 0.5, c4 (0) -> 0.2
        ranked_candidates_3 = [
            {"candidate_id": "c1", "label": 1, "score": 0.9},
            {"candidate_id": "c2", "label": 0, "score": 0.7},
            {"candidate_id": "c3", "label": 1, "score": 0.5},
            {"candidate_id": "c4", "label": 0, "score": 0.2},
        ]
        m3 = compute_query_ranking_metrics(ranked_candidates_3)
        self.assertEqual(m3["mrr"], 1.0)  # first relevant is rank 1
        self.assertEqual(m3["hit1"], 1.0)
        self.assertEqual(m3["hit3"], 1.0)
        self.assertAlmostEqual(m3["recall1"], 0.5)  # 1 of 2
        self.assertAlmostEqual(m3["recall3"], 1.0)  # 2 of 2

    def test_no_positive_query_handling(self):
        # Query where all labels are 0
        ranked_candidates = [
            {"candidate_id": "c1", "label": 0, "score": 0.9},
            {"candidate_id": "c2", "label": 0, "score": 0.4},
        ]
        m = compute_query_ranking_metrics(ranked_candidates)
        self.assertFalse(m["has_positive"])
        self.assertIsNone(m["mrr"])
        self.assertIsNone(m["hit1"])
        self.assertIsNone(m["recall1"])

    def test_aggregate_metrics_with_no_positive_and_macro(self):
        # Job A has 2 queries: one with pos (MRR 1.0), one without pos
        # Job B has 1 query with pos (MRR 0.5)
        case_results = [
            {
                "job_id": "job_A",
                "metrics": {"has_positive": True, "mrr": 1.0, "hit1": 1.0, "hit3": 1.0, "recall1": 1.0, "recall3": 1.0, "pool_size": 3},
            },
            {
                "job_id": "job_A",
                "metrics": {"has_positive": False, "mrr": None, "hit1": None, "hit3": None, "recall1": None, "recall3": None, "pool_size": 2},
            },
            {
                "job_id": "job_B",
                "metrics": {"has_positive": True, "mrr": 0.5, "hit1": 0.0, "hit3": 1.0, "recall1": 0.0, "recall3": 1.0, "pool_size": 4},
            },
        ]
        agg = aggregate_metrics(case_results)
        # Total queries = 3, evaluated = 2, no_positive = 1
        self.assertEqual(agg["total_queries"], 3)
        self.assertEqual(agg["evaluated_queries"], 2)
        self.assertEqual(agg["no_positive_queries"], 1)

        # Micro MRR = (1.0 + 0.5) / 2 = 0.75
        self.assertAlmostEqual(agg["micro"]["mrr"], 0.75)
        # Macro job MRR: job_A = 1.0, job_B = 0.5 -> average = 0.75
        self.assertAlmostEqual(agg["macro_job"]["mrr"], 0.75)
        self.assertEqual(agg["macro_job"]["job_count"], 2)

    def test_aggregate_all_no_positive(self):
        case_results = [
            {"job_id": "j1", "metrics": {"has_positive": False, "mrr": None, "pool_size": 1}},
        ]
        agg = aggregate_metrics(case_results)
        self.assertIsNone(agg["micro"]["mrr"])
        self.assertIsNone(agg["macro_job"]["mrr"])
        self.assertEqual(agg["evaluated_queries"], 0)
        self.assertEqual(agg["no_positive_queries"], 1)

    def test_deterministic_tie_breaking_order(self):
        # Two candidates with identical score: tie broken deterministically by candidate_id
        candidates = [
            {"candidate_id": "c_beta", "evidence": "text b", "score": 0.85, "label": 0},
            {"candidate_id": "c_alpha", "evidence": "text a", "score": 0.85, "label": 1},
        ]
        # Sort descending score, then ascending candidate_id
        candidates.sort(key=lambda x: (-x["score"], x["candidate_id"]))
        # c_alpha comes first because 'c_alpha' < 'c_beta'
        self.assertEqual(candidates[0]["candidate_id"], "c_alpha")
        self.assertEqual(candidates[0]["label"], 1)
        m = compute_query_ranking_metrics(candidates)
        self.assertEqual(m["mrr"], 1.0)
        self.assertEqual(m["hit1"], 1.0)


class TestSchedulesAndMixture(unittest.TestCase):
    def test_deterministic_sampler_arm_c_mixture(self):
        old_pool = [{"id": f"old_{i}"} for i in range(100)]
        silver_pool = [{"id": f"silver_{i}"} for i in range(56)]

        steps = 155
        batch_size = 8
        silver_ratio = 0.25  # 2 silver, 6 old per batch
        seed = 42

        batches, exposure_stats = deterministic_batch_sampler(
            old_comparisons=old_pool,
            silver_comparisons=silver_pool,
            total_steps=steps,
            batch_size=batch_size,
            silver_ratio=silver_ratio,
            seed=seed,
        )

        self.assertEqual(len(batches), 155)
        for b in batches:
            self.assertEqual(len(b), 8)
            silver_items = [x for x in b if x["id"].startswith("silver_")]
            old_items = [x for x in b if x["id"].startswith("old_")]
            self.assertEqual(len(silver_items), 2)
            self.assertEqual(len(old_items), 6)

        # Total silver exposures = 155 * 2 = 310
        self.assertEqual(exposure_stats["silver"]["total_exposures"], 310)
        self.assertEqual(exposure_stats["old"]["total_exposures"], 155 * 6)
        # Unique silver items exposed <= 56
        self.assertGreater(exposure_stats["silver"]["unique_exposures"], 0)
        self.assertLessEqual(exposure_stats["silver"]["unique_exposures"], 56)

        # Rerunning with same seed produces IDENTICAL batches
        batches_2, _ = deterministic_batch_sampler(
            old_comparisons=old_pool,
            silver_comparisons=silver_pool,
            total_steps=steps,
            batch_size=batch_size,
            silver_ratio=silver_ratio,
            seed=seed,
        )
        self.assertEqual(batches, batches_2)


class TestSelectionRuleAndBootstrap(unittest.TestCase):
    def test_selection_rule_validation_only_baseline_eligible(self):
        # Baseline step 0 has higher validation MRR than step 50 and 155
        eval_history = [
            {"step": 0, "val_job_macro_mrr": 0.65},
            {"step": 50, "val_job_macro_mrr": 0.62},
            {"step": 155, "val_job_macro_mrr": 0.64},
        ]
        selected = select_best_checkpoint(eval_history)
        self.assertEqual(selected["step"], 0)
        self.assertEqual(selected["val_job_macro_mrr"], 0.65)

    def test_selection_rule_deterministic_tie_prefers_earlier(self):
        # Step 50 and step 155 tied
        eval_history = [
            {"step": 0, "val_job_macro_mrr": 0.60},
            {"step": 50, "val_job_macro_mrr": 0.65},
            {"step": 155, "val_job_macro_mrr": 0.65},
        ]
        selected = select_best_checkpoint(eval_history)
        self.assertEqual(selected["step"], 50)  # earlier preferred

    def test_paired_job_bootstrap_seeded(self):
        # 10 jobs, job-macro MRR scores for Arm C and Arm A
        jobs = [f"job_{i}" for i in range(10)]
        arm_c_scores = {j: 0.70 + (i * 0.01) for i, j in enumerate(jobs)}
        arm_a_scores = {j: 0.65 + (i * 0.01) for i, j in enumerate(jobs)}

        boot = paired_job_bootstrap(
            job_scores_primary=arm_c_scores,
            job_scores_baseline=arm_a_scores,
            n_resamples=200,
            seed=42,
        )
        self.assertAlmostEqual(boot["mean_delta"], 0.05, places=3)
        self.assertGreater(boot["ci_95_low"], 0.0)
        self.assertGreaterEqual(boot["ci_95_high"], boot["ci_95_low"])


class TestRawTrainProvenanceValidation(unittest.TestCase):
    def test_raw_train_validation_passes(self):
        silver_comps = [
            {
                "comparison_id": "c1",
                "pos_record_id": "pos_1",
                "neg_record_id": "neg_1",
                "positive_evidence": "Positive text",
                "negative_evidence": "Negative text",
            }
        ]
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as tf:
            tf.write(json.dumps({"candidate_pair_id": "pos_1", "split": "train", "evidence": "Positive text"}) + "\n")
            tf.write(json.dumps({"candidate_pair_id": "neg_1", "split": "train", "evidence": "Negative text"}) + "\n")
            raw_train_path = tf.name

        try:
            validate_raw_train_provenance(silver_comps, raw_train_path)
        finally:
            os.remove(raw_train_path)

    def test_raw_train_validation_fails_on_missing_id(self):
        silver_comps = [
            {
                "comparison_id": "c1",
                "pos_record_id": "pos_missing",
                "neg_record_id": "neg_1",
                "positive_evidence": "Positive text",
                "negative_evidence": "Negative text",
            }
        ]
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as tf:
            tf.write(json.dumps({"candidate_pair_id": "neg_1", "split": "train", "evidence": "Negative text"}) + "\n")
            raw_train_path = tf.name

        try:
            with self.assertRaises(ValueError) as ctx:
                validate_raw_train_provenance(silver_comps, raw_train_path)
            self.assertIn("not found in raw train source", str(ctx.exception))
        finally:
            os.remove(raw_train_path)

    def test_raw_train_validation_fails_on_split_mismatch(self):
        silver_comps = [
            {
                "comparison_id": "c1",
                "pos_record_id": "pos_1",
                "neg_record_id": "neg_1",
                "positive_evidence": "Positive text",
                "negative_evidence": "Negative text",
            }
        ]
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as tf:
            tf.write(json.dumps({"candidate_pair_id": "pos_1", "split": "test", "evidence": "Positive text"}) + "\n")
            tf.write(json.dumps({"candidate_pair_id": "neg_1", "split": "train", "evidence": "Negative text"}) + "\n")
            raw_train_path = tf.name

        try:
            with self.assertRaises(ValueError) as ctx:
                validate_raw_train_provenance(silver_comps, raw_train_path)
            self.assertIn("!= 'train'", str(ctx.exception))
        finally:
            os.remove(raw_train_path)


class TestBundleBuilderEndToEnd(unittest.TestCase):
    def test_build_bundle_and_refuse_overwrite(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            # Create synthetic input files
            sem_file = tmp / "semantic.jsonl"
            sem_data = [
                {"split": "train", "job_id": "j_train", "requirement_id": "r1@en", "requirement": "Req 1", "evidence": "Pos 1", "label": 1},
                {"split": "train", "job_id": "j_train", "requirement_id": "r1@en", "requirement": "Req 1", "evidence": "Neg 1", "label": 0},
                {"split": "validation", "job_id": "j_val", "requirement_id": "r2@en", "requirement": "Req 2", "evidence": "Val Pos", "label": 1},
                {"split": "test", "job_id": "j_test", "requirement_id": "r3@en", "requirement": "Req 3", "evidence": "Test Pos", "label": 1},
            ]
            with open(sem_file, "w", encoding="utf-8") as f:
                for row in sem_data:
                    f.write(json.dumps(row) + "\n")

            silver_dir = tmp / "silver"
            silver_dir.mkdir()
            sc_data = [
                {
                    "comparison_id": "sc_1",
                    "split": "train",
                    "job_id": "j_silver",
                    "requirement": "Req Silver",
                    "positive_evidence": "Silver Pos",
                    "negative_evidence": "Silver Neg",
                    "proposed_support": {"positive": "full", "negative": "partial"},
                }
            ]
            with open(silver_dir / "silver_comparisons.jsonl", "w", encoding="utf-8") as f:
                for row in sc_data:
                    f.write(json.dumps(row) + "\n")
            with open(silver_dir / "manifest.json", "w", encoding="utf-8") as f:
                json.dump({"counts": {"included": 1}}, f)

            model_dir = tmp / "model"
            model_dir.mkdir()
            (model_dir / "config.json").write_text('{"architectures": ["BertModel"]}', encoding="utf-8")
            (model_dir / "model.safetensors").write_text("weights", encoding="utf-8")

            out_bundle = tmp / "bundle_out"

            # 1. Build bundle successfully
            res = build_bundle(
                semantic_path=sem_file,
                silver_dir=silver_dir,
                output_dir=out_bundle,
                model_dir=model_dir,
                package_zip=True,
            )
            self.assertTrue(Path(res["bundle_dir"]).exists())
            self.assertTrue((out_bundle / "manifest.json").exists())
            self.assertTrue((out_bundle / "runner" / "ai1_kaggle_experiment.py").exists())
            self.assertTrue(Path(res["zip_path"]).exists())

            # Verify bundle manifest on disk
            verify_manifest(out_bundle)

            # 2. Refuses overwrite without force
            with self.assertRaises(FileExistsError):
                build_bundle(
                    semantic_path=sem_file,
                    silver_dir=silver_dir,
                    output_dir=out_bundle,
                    model_dir=model_dir,
                    force=False,
                )

            # 3. Overwrites with force=True
            build_bundle(
                semantic_path=sem_file,
                silver_dir=silver_dir,
                output_dir=out_bundle,
                model_dir=model_dir,
                force=True,
            )


class TestRunnerSmokeExecution(unittest.TestCase):
    def test_run_experiment_smoke(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            sem_file = tmp / "semantic.jsonl"
            sem_data = [
                {"split": "train", "job_id": "j_train", "requirement_id": "r1@en", "requirement": "Req 1", "evidence": "Train Pos", "label": 1},
                {"split": "train", "job_id": "j_train", "requirement_id": "r1@en", "requirement": "Req 1", "evidence": "Train Neg", "label": 0},
                {"split": "validation", "job_id": "j_val", "requirement_id": "r2@en", "requirement": "Req 2", "evidence": "Val Pos", "label": 1},
                {"split": "validation", "job_id": "j_val", "requirement_id": "r2@en", "requirement": "Req 2", "evidence": "Val Neg", "label": 0},
                {"split": "test", "job_id": "j_test", "requirement_id": "r3@vi", "requirement": "Yêu cầu 3", "evidence": "Bằng chứng đúng", "label": 1},
                {"split": "test", "job_id": "j_test", "requirement_id": "r3@vi", "requirement": "Yêu cầu 3", "evidence": "Bằng chứng sai", "label": 0},
            ]
            with open(sem_file, "w", encoding="utf-8") as f:
                for row in sem_data:
                    f.write(json.dumps(row) + "\n")

            silver_file = tmp / "silver_comparisons.jsonl"
            sc_data = [
                {
                    "comparison_id": "sc_1",
                    "split": "train",
                    "job_id": "j_silver",
                    "requirement": "Req Silver",
                    "positive_evidence": "Silver Pos",
                    "negative_evidence": "Silver Neg",
                    "proposed_support": {"positive": "full", "negative": "partial"},
                }
            ]
            with open(silver_file, "w", encoding="utf-8") as f:
                for row in sc_data:
                    f.write(json.dumps(row) + "\n")

            out_run = tmp / "experiment_out"
            res = run_experiment(
                semantic_path=sem_file,
                silver_path=silver_file,
                model_path=tmp,
                output_dir=out_run,
                total_steps=4,
                batch_size=4,
                seed=42,
                smoke=True,
                skip_manifest=True,
            )

            self.assertEqual(res["status"], "COMPLETED")
            self.assertIn("Arm_A", res["arms"])
            self.assertIn("Arm_B", res["arms"])
            self.assertIn("Arm_C", res["arms"])
            self.assertTrue((out_run / "experiment_results.json").exists())
            self.assertTrue((out_run / "test_predictions.jsonl").exists())


class TestNotebookJsonAndCompilation(unittest.TestCase):
    def test_notebook_json_and_code_cells_compile(self):
        nb_path = WORKTREE_ROOT / "notebooks" / "ai1_silver_v1_kaggle.ipynb"
        if not nb_path.exists():
            self.skipTest(f"Notebook {nb_path} does not exist yet")

        with open(nb_path, "r", encoding="utf-8") as f:
            nb = json.load(f)

        self.assertIn("cells", nb)
        self.assertIn("nbformat", nb)

        code_cells = [c for c in nb["cells"] if c.get("cell_type") == "code"]
        self.assertGreater(len(code_cells), 0)

        for idx, cell in enumerate(code_cells):
            src = "".join(cell.get("source", []))
            # Strip IPython magic or bash commands for syntax compilation check
            py_lines = []
            for line in src.splitlines():
                if line.strip().startswith("!") or line.strip().startswith("%"):
                    py_lines.append(f"# {line}")
                else:
                    py_lines.append(line)
            clean_code = "\n".join(py_lines)
            try:
                compile(clean_code, f"<cell_{idx}>", "exec")
            except SyntaxError as e:
                self.fail(f"Syntax error compiling notebook cell {idx}: {e}")


class TestNonSmokeRegressionAndTorchTraining(unittest.TestCase):
    def test_non_smoke_fails_closed_when_torch_unavailable(self):
        """Regression test: non-smoke MUST fail closed when torch is not available, never fall back to mock."""
        import unittest.mock as mock

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            sem_file = tmp / "semantic.jsonl"
            sem_data = [
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "R1", "evidence": "E1", "label": 1},
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "R1", "evidence": "E2", "label": 0},
                {"split": "validation", "job_id": "j2", "requirement_id": "r2@en", "requirement": "R2", "evidence": "E3", "label": 1},
                {"split": "test", "job_id": "j3", "requirement_id": "r3@en", "requirement": "R3", "evidence": "E4", "label": 1},
            ]
            with open(sem_file, "w", encoding="utf-8") as f:
                for row in sem_data:
                    f.write(json.dumps(row) + "\n")

            silver_file = tmp / "silver.jsonl"
            with open(silver_file, "w", encoding="utf-8") as f:
                f.write(json.dumps({
                    "comparison_id": "sc1", "split": "train", "job_id": "j_s",
                    "requirement": "Rs", "positive_evidence": "Ps", "negative_evidence": "Ns",
                    "proposed_support": {"positive": "full", "negative": "partial"}
                }) + "\n")

            out_dir = tmp / "out"

            # Mock torch as unavailable to verify fail-closed behavior without skipping
            with mock.patch.dict("sys.modules", {"torch": None}):
                with self.assertRaises(RuntimeError) as ctx:
                    run_experiment(
                        semantic_path=sem_file,
                        silver_path=silver_file,
                        model_path=tmp,
                        output_dir=out_dir,
                        total_steps=2,
                        batch_size=2,
                        smoke=False,
                        skip_manifest=True,
                    )
                self.assertIn("torch", str(ctx.exception).lower())

    def test_smoke_mode_prominently_marks_synthetic(self):
        """Regression test: smoke mode outputs MUST prominently display synthetic indicators."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            sem_file = tmp / "semantic.jsonl"
            sem_data = [
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "R1", "evidence": "E1", "label": 1},
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "R1", "evidence": "E2", "label": 0},
                {"split": "validation", "job_id": "j2", "requirement_id": "r2@en", "requirement": "R2", "evidence": "E3", "label": 1},
                {"split": "test", "job_id": "j3", "requirement_id": "r3@en", "requirement": "R3", "evidence": "E4", "label": 1},
            ]
            with open(sem_file, "w", encoding="utf-8") as f:
                for row in sem_data:
                    f.write(json.dumps(row) + "\n")

            silver_file = tmp / "silver.jsonl"
            with open(silver_file, "w", encoding="utf-8") as f:
                f.write(json.dumps({
                    "comparison_id": "sc1", "split": "train", "job_id": "j_s",
                    "requirement": "Rs", "positive_evidence": "Ps", "negative_evidence": "Ns",
                    "proposed_support": {"positive": "full", "negative": "partial"}
                }) + "\n")

            out_dir = tmp / "out"
            res = run_experiment(
                semantic_path=sem_file,
                silver_path=silver_file,
                model_path=tmp,
                output_dir=out_dir,
                total_steps=2,
                batch_size=2,
                smoke=True,
                skip_manifest=True,
            )
            self.assertTrue(res.get("smoke_synthetic"), "Output must set smoke_synthetic=True")
            self.assertEqual(res.get("execution_mode"), "SMOKE_SYNTHETIC")
            self.assertIn("SYNTHETIC", res.get("disclaimer", ""))

    def test_non_smoke_fails_without_model_or_torch(self):
        """Verify that calling run_experiment with smoke=False and a nonexistent model path raises an error and does NOT return synthetic results."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            sem_file = tmp / "semantic.jsonl"
            sem_data = [
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "R1", "evidence": "E1", "label": 1},
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "R1", "evidence": "E2", "label": 0},
                {"split": "validation", "job_id": "j2", "requirement_id": "r2@en", "requirement": "R2", "evidence": "E3", "label": 1},
                {"split": "test", "job_id": "j3", "requirement_id": "r3@en", "requirement": "R3", "evidence": "E4", "label": 1},
            ]
            with open(sem_file, "w", encoding="utf-8") as f:
                for row in sem_data:
                    f.write(json.dumps(row) + "\n")

            silver_file = tmp / "silver.jsonl"
            with open(silver_file, "w", encoding="utf-8") as f:
                f.write(json.dumps({
                    "comparison_id": "sc1", "split": "train", "job_id": "j_s",
                    "requirement": "Rs", "positive_evidence": "Ps", "negative_evidence": "Ns",
                    "proposed_support": {"positive": "full", "negative": "partial"}
                }) + "\n")

            out_dir = tmp / "out"
            nonexistent_model = tmp / "nonexistent_model_dir"

            # Must raise either RuntimeError (torch missing) or FileNotFoundError (nonexistent model path)
            with self.assertRaises((RuntimeError, FileNotFoundError, ValueError)) as ctx:
                run_experiment(
                    semantic_path=sem_file,
                    silver_path=silver_file,
                    model_path=nonexistent_model,
                    output_dir=out_dir,
                    total_steps=2,
                    batch_size=2,
                    smoke=False,
                    skip_manifest=True,
                )
            self.assertTrue(len(str(ctx.exception)) > 0)
            self.assertFalse((out_dir / "experiment_results.json").exists())

            # When torch is mocked, verify nonexistent model path specifically raises FileNotFoundError
            import unittest.mock as mock
            with mock.patch.dict("sys.modules", {"torch": mock.MagicMock(), "transformers": mock.MagicMock()}):
                with self.assertRaises(FileNotFoundError):
                    run_experiment(
                        semantic_path=sem_file,
                        silver_path=silver_file,
                        model_path=nonexistent_model,
                        output_dir=out_dir,
                        total_steps=2,
                        batch_size=2,
                        smoke=False,
                        skip_manifest=True,
                    )

    def test_validation_step0_selection(self):
        """Verify that if step 0 has higher or equal val MRR, step 0 is selected (preventing unnecessary regression)."""
        # Step 0 strictly higher than later steps
        eval_history_higher = [
            {"step": 0, "val_job_macro_mrr": 0.75, "checkpoint_path": None},
            {"step": 50, "val_job_macro_mrr": 0.70, "checkpoint_path": "/path/step_50"},
            {"step": 100, "val_job_macro_mrr": 0.72, "checkpoint_path": "/path/step_100"},
            {"step": 155, "val_job_macro_mrr": 0.68, "checkpoint_path": "/path/step_155"},
        ]
        selected_higher = select_best_checkpoint(eval_history_higher)
        self.assertEqual(selected_higher["step"], 0)
        self.assertEqual(selected_higher["val_job_macro_mrr"], 0.75)
        self.assertIsNone(selected_higher["checkpoint_path"])

        # Step 0 equal to later step (deterministic tie-breaking strictly prefers earlier step)
        eval_history_equal = [
            {"step": 0, "val_job_macro_mrr": 0.80, "checkpoint_path": None},
            {"step": 50, "val_job_macro_mrr": 0.80, "checkpoint_path": "/path/step_50"},
            {"step": 100, "val_job_macro_mrr": 0.79, "checkpoint_path": "/path/step_100"},
        ]
        selected_equal = select_best_checkpoint(eval_history_equal)
        self.assertEqual(selected_equal["step"], 0)
        self.assertEqual(selected_equal["val_job_macro_mrr"], 0.80)
        self.assertIsNone(selected_equal["checkpoint_path"])

    def test_train_step_torch_updates_weights(self):
        """Using a tiny torch.nn.Linear fixture, verify that train_step_torch actually causes non-zero gradient and weight changes on student parameters, while teacher remains unchanged."""
        try:
            import torch
            import torch.nn as nn
        except ImportError:
            self.skipTest("PyTorch not installed in test environment")

        from ai1_kaggle_experiment import train_step_torch

        class TinyModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.linear = nn.Linear(16, 8)

            def forward(self, x):
                return nn.functional.normalize(self.linear(x), p=2, dim=-1)

        torch.manual_seed(42)
        student = TinyModel()
        teacher = TinyModel()
        teacher.load_state_dict(student.state_dict())
        for p in teacher.parameters():
            p.requires_grad = False

        initial_student_weight = student.linear.weight.clone().detach()
        initial_teacher_weight = teacher.linear.weight.clone().detach()

        optimizer = torch.optim.AdamW(student.parameters(), lr=1e-2)

        q = torch.randn(2, 16)
        pos = torch.randn(2, 16)
        neg = torch.randn(2, 16)

        teacher_cache = {
            "q": teacher(q).detach(),
            "pos": teacher(pos).detach(),
            "neg": teacher(neg).detach(),
        }

        # Step 1: Student starts identical to teacher, takes optimizer step
        loss1, rank_loss1, ret_loss1 = train_step_torch(
            student=student,
            teacher_cache=teacher_cache,
            q_inputs=q,
            pos_inputs=pos,
            neg_inputs=neg,
            optimizer=optimizer,
            margin=0.1,
            retention_weight=1.0,
        )

        # 1. Non-zero gradients on student parameters
        self.assertIsNotNone(student.linear.weight.grad)
        self.assertGreater(student.linear.weight.grad.abs().sum().item(), 0.0)

        # 2. Student weights MUST change
        updated_student_weight = student.linear.weight.clone().detach()
        self.assertFalse(
            torch.equal(initial_student_weight, updated_student_weight),
            "Student weights must update after optimizer step!"
        )

        # 3. Teacher weights MUST remain identical (frozen)
        updated_teacher_weight = teacher.linear.weight.clone().detach()
        self.assertTrue(
            torch.equal(initial_teacher_weight, updated_teacher_weight),
            "Teacher weights must remain frozen!"
        )

        # Step 2: Now that student has diverged from teacher, retention loss MUST be strictly positive
        loss2, rank_loss2, ret_loss2 = train_step_torch(
            student=student,
            teacher_cache=teacher_cache,
            q_inputs=q,
            pos_inputs=pos,
            neg_inputs=neg,
            optimizer=optimizer,
            margin=0.1,
            retention_weight=1.0,
        )
        self.assertGreater(ret_loss2, 0.0, "Retention loss must be > 0 once student diverges from teacher!")
        self.assertGreater(loss2, 0.0)
        self.assertTrue(torch.equal(initial_teacher_weight, teacher.linear.weight.detach()))

    def test_torch_training_step_updates_weights_and_freezes_teacher(self):
        """Backwards-compatible alias for test_train_step_torch_updates_weights."""
        self.test_train_step_torch_updates_weights()

    def test_end_to_end_torch_non_smoke_tiny_model_two_steps(self):
        """Full end-to-end integration test with locally created tiny transformer and tokenizer.

        Zero external downloads; executes 2 real steps for Arms B and C;
        verifies student weight divergence, frozen teacher retention,
        saved checkpoint reloading and testing, and no mock fallback.
        """
        try:
            import torch
            from transformers import BertConfig, BertModel, BertTokenizerFast
            from tokenizers import Tokenizer
            from tokenizers.models import WordPiece
            from tokenizers.trainers import WordPieceTrainer
        except ImportError:
            self.skipTest("PyTorch / transformers not installed in test environment")

        from ai1_kaggle_experiment import run_experiment, TransformerTextModel

        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            model_dir = p / "model"
            model_dir.mkdir()

            # Create minimal local tokenizer offline
            tok = Tokenizer(WordPiece(unk_token="[UNK]"))
            trainer = WordPieceTrainer(vocab_size=100, special_tokens=["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"])
            tok.train_from_iterator(["req pos neg test java python docker k8s"], trainer=trainer)
            fast_tok = BertTokenizerFast(tokenizer_object=tok, unk_token="[UNK]", pad_token="[PAD]", cls_token="[CLS]", sep_token="[SEP]", mask_token="[MASK]")
            fast_tok.save_pretrained(model_dir)

            # Create minimal local BertModel with safetensors offline
            cfg = BertConfig(
                vocab_size=len(fast_tok),
                hidden_size=16,
                num_attention_heads=2,
                num_hidden_layers=1,
                intermediate_size=32,
                max_position_embeddings=64,
            )
            model = BertModel(cfg)
            model.save_pretrained(model_dir, safe_serialization=True)
            initial_word_weights = model.embeddings.word_embeddings.weight.clone().detach()

            # Create minimal dataset
            sem_file = p / "semantic.jsonl"
            sem_data = [
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "req python", "evidence": "pos python", "label": 1},
                {"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "req python", "evidence": "neg java", "label": 0},
                {"split": "validation", "job_id": "j2", "requirement_id": "r2@en", "requirement": "req docker", "evidence": "pos docker", "label": 1},
                {"split": "validation", "job_id": "j2", "requirement_id": "r2@en", "requirement": "req docker", "evidence": "neg k8s", "label": 0},
                {"split": "test", "job_id": "j3", "requirement_id": "r3@en", "requirement": "req test", "evidence": "pos test", "label": 1},
                {"split": "test", "job_id": "j3", "requirement_id": "r3@en", "requirement": "req test", "evidence": "neg none", "label": 0},
            ]
            with open(sem_file, "w", encoding="utf-8") as f:
                for r in sem_data:
                    f.write(json.dumps(r) + "\n")

            silver_file = p / "silver.jsonl"
            with open(silver_file, "w", encoding="utf-8") as f:
                f.write(json.dumps({
                    "comparison_id": "sc1", "split": "train", "job_id": "j_s",
                    "requirement": "req silver", "positive_evidence": "pos silver", "negative_evidence": "neg silver",
                    "proposed_support": {"positive": "full", "negative": "partial"}
                }) + "\n")

            out_dir = p / "out"
            res = run_experiment(
                semantic_path=sem_file,
                silver_path=silver_file,
                model_path=model_dir,
                output_dir=out_dir,
                total_steps=2,
                batch_size=2,
                seed=42,
                smoke=False,
                skip_manifest=True,
            )

            # Verification of execution mode and status
            self.assertEqual(res["status"], "COMPLETED")
            self.assertEqual(res["execution_mode"], "TORCH_REAL")
            self.assertFalse(res["smoke_synthetic"])

            # Verify checkpoint saving and reloading
            ckpt_b = out_dir / "checkpoints" / "Arm_B" / "step_2"
            self.assertTrue(ckpt_b.exists(), f"Arm B step 2 checkpoint must exist at {ckpt_b}")
            reloaded_b = TransformerTextModel.from_pretrained(ckpt_b, torch.device("cpu"))
            reloaded_b_weights = reloaded_b.model.embeddings.word_embeddings.weight.detach()
            self.assertFalse(
                torch.equal(initial_word_weights, reloaded_b_weights),
                "Student B weights must have updated after training steps!"
            )

            ckpt_c = out_dir / "checkpoints" / "Arm_C" / "step_2"
            self.assertTrue(ckpt_c.exists(), f"Arm C step 2 checkpoint must exist at {ckpt_c}")
            reloaded_c = TransformerTextModel.from_pretrained(ckpt_c, torch.device("cpu"))
            reloaded_c_weights = reloaded_c.model.embeddings.word_embeddings.weight.detach()
            self.assertFalse(
                torch.equal(initial_word_weights, reloaded_c_weights),
                "Student C weights must have updated after training steps!"
            )

            # Check that reloaded model produces valid L2 normalized vectors
            test_embs = reloaded_c.encode(["test text query"])
            self.assertEqual(len(test_embs), 1)
            norm = sum(x * x for x in test_embs[0]) ** 0.5
            self.assertAlmostEqual(norm, 1.0, places=4)

    def test_offline_safetensors_only_enforcement(self):
        """Verify that offline mode strictly enforces *.safetensors presence and rejects bin-only models."""
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            model_dir = p / "model"
            model_dir.mkdir()
            (model_dir / "config.json").write_text('{"vocab_size": 100}', encoding="utf-8")
            (model_dir / "pytorch_model.bin").write_text("dummy binary", encoding="utf-8")

            sem_file = p / "semantic.jsonl"
            sem_file.write_text(json.dumps({"split": "train", "job_id": "j1", "requirement_id": "r1@en", "requirement": "R", "evidence": "E", "label": 1}) + "\n")
            silver_file = p / "silver.jsonl"
            silver_file.write_text(json.dumps({"comparison_id": "sc1", "split": "train", "job_id": "j_s", "requirement": "R", "positive_evidence": "P", "negative_evidence": "N", "proposed_support": {"positive": "full", "negative": "partial"}}) + "\n")

            # Must raise FileNotFoundError for missing *.safetensors
            with self.assertRaises(FileNotFoundError) as ctx:
                run_experiment(
                    semantic_path=sem_file,
                    silver_path=silver_file,
                    model_path=model_dir,
                    output_dir=p / "out",
                    total_steps=2,
                    batch_size=2,
                    smoke=False,
                    skip_manifest=True,
                )
            self.assertIn("safetensors", str(ctx.exception).lower())


if __name__ == "__main__":
    unittest.main()
