"""Tests for standalone stdlib AI1 pilot evaluator."""

import json
import math
import os
import shutil
import sys
import tempfile
import unittest

# Ensure worktree root is on sys.path
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from scripts.evaluate_ai1_pilot import (
    BM25,
    compute_file_sha256,
    evaluate_dataset,
    evaluate_single_case,
    evaluate_cross_cv_diagnostic,
    run_evaluation_pipeline,
    tokenize,
)


class TestBM25(unittest.TestCase):
    """Unit tests for pure Python BM25."""

    def test_tokenize_unicode(self):
        text = "Kỹ sư AI/ML tại Hà Nội! 100% agentic_workflow."
        tokens = tokenize(text)
        self.assertIn("kỹ", tokens)
        self.assertIn("sư", tokens)
        self.assertIn("ai", tokens)
        self.assertIn("ml", tokens)
        self.assertIn("hà", tokens)
        self.assertIn("nội", tokens)
        self.assertIn("100", tokens)
        self.assertIn("agentic_workflow", tokens)

    def test_finite_scores(self):
        """Scores must remain finite on edge cases (empty strings, zero frequencies)."""
        corpus = [
            {"id": "doc1", "text": "Python machine learning developer"},
            {"id": "doc2", "text": ""},
            {"id": "doc3", "text": "   "},
        ]
        bm25 = BM25.from_documents(corpus, k1=1.5, b=0.75)

        queries = [
            "python",
            "nonexistent_token_xyz_123",
            "",
            "   ",
        ]
        for q in queries:
            scores = bm25.score_query(q)
            self.assertEqual(len(scores), len(corpus))
            for score in scores.values():
                self.assertTrue(math.isfinite(score), f"Score {score} is not finite for query '{q}'")
                self.assertGreaterEqual(score, 0.0)

    def test_empty_corpus_finite_scores(self):
        bm25 = BM25.from_documents([], k1=1.5, b=0.75)
        scores = bm25.score_query("python")
        self.assertEqual(scores, {})


class TestEvaluatorMetrics(unittest.TestCase):
    """Unit tests for within-CV ranking metrics and edge cases."""

    def test_perfect_ranking(self):
        """When positive candidate is ranked 1st, MRR=1.0, Hit@1=1.0, Recall@1=1.0."""
        # Candidates sorted by score: pos (rank 1), neg1 (rank 2), neg2 (rank 3), neg3 (rank 4)
        ranked_candidates = [
            {"evidence_id": "c1", "score": 10.0, "support_label": "full"},
            {"evidence_id": "c2", "score": 5.0, "support_label": "irrelevant"},
            {"evidence_id": "c3", "score": 2.0, "support_label": "irrelevant"},
            {"evidence_id": "c4", "score": 1.0, "support_label": "contradicted"},
        ]
        res = evaluate_single_case(ranked_candidates, target="full_support")
        self.assertTrue(res["has_positive"])
        self.assertAlmostEqual(res["mrr"], 1.0)
        self.assertAlmostEqual(res["hit1"], 1.0)
        self.assertAlmostEqual(res["hit3"], 1.0)
        self.assertAlmostEqual(res["recall1"], 1.0)
        self.assertAlmostEqual(res["recall3"], 1.0)
        self.assertAlmostEqual(res["recall5"], 1.0)
        self.assertAlmostEqual(res["recall10"], 1.0)

    def test_wrong_ranking(self):
        """When positive candidate is ranked last (rank 4 of 4), MRR=0.25, Hit@1=0, Hit@3=0, Recall@3=0, Recall@5=1.0."""
        ranked_candidates = [
            {"evidence_id": "c1", "score": 10.0, "support_label": "irrelevant"},
            {"evidence_id": "c2", "score": 8.0, "support_label": "contradicted"},
            {"evidence_id": "c3", "score": 6.0, "support_label": "irrelevant"},
            {"evidence_id": "c4", "score": 1.0, "support_label": "full"},
        ]
        res = evaluate_single_case(ranked_candidates, target="full_support")
        self.assertTrue(res["has_positive"])
        self.assertAlmostEqual(res["mrr"], 0.25)
        self.assertAlmostEqual(res["hit1"], 0.0)
        self.assertAlmostEqual(res["hit3"], 0.0)
        self.assertAlmostEqual(res["recall1"], 0.0)
        self.assertAlmostEqual(res["recall3"], 0.0)
        self.assertAlmostEqual(res["recall5"], 1.0)  # K=5 >= 4 candidates
        self.assertAlmostEqual(res["recall10"], 1.0)

    def test_multiple_positives(self):
        """When 2 positives exist at ranks 2 and 3 out of 4 candidates."""
        # Target: any_support (both full and partial are positives)
        ranked_candidates = [
            {"evidence_id": "c1", "score": 10.0, "support_label": "irrelevant"},
            {"evidence_id": "c2", "score": 8.0, "support_label": "full"},     # pos 1
            {"evidence_id": "c3", "score": 6.0, "support_label": "partial"},  # pos 2
            {"evidence_id": "c4", "score": 1.0, "support_label": "contradicted"},
        ]
        res = evaluate_single_case(ranked_candidates, target="any_support")
        self.assertTrue(res["has_positive"])
        # MRR based on first positive at rank 2
        self.assertAlmostEqual(res["mrr"], 0.5)
        self.assertAlmostEqual(res["hit1"], 0.0)
        self.assertAlmostEqual(res["hit3"], 1.0)
        # 0 of 2 positives in top 1 -> Recall@1 = 0.0
        self.assertAlmostEqual(res["recall1"], 0.0)
        # 2 of 2 positives in top 3 -> Recall@3 = 1.0
        self.assertAlmostEqual(res["recall3"], 1.0)

    def test_no_positives(self):
        """When candidate pool has no positives, has_positive is False and excluded from denominator."""
        ranked_candidates = [
            {"evidence_id": "c1", "score": 10.0, "support_label": "irrelevant"},
            {"evidence_id": "c2", "score": 8.0, "support_label": "contradicted"},
            {"evidence_id": "c3", "score": 6.0, "support_label": "insufficient"},
            {"evidence_id": "c4", "score": 1.0, "support_label": "irrelevant"},
        ]
        res_full = evaluate_single_case(ranked_candidates, target="full_support")
        self.assertFalse(res_full["has_positive"])
        self.assertIsNone(res_full["mrr"])
        self.assertIsNone(res_full["hit1"])
        self.assertIsNone(res_full["recall1"])

        res_any = evaluate_single_case(ranked_candidates, target="any_support")
        self.assertFalse(res_any["has_positive"])
        self.assertIsNone(res_any["mrr"])

    def test_ties_deterministic_and_pairwise_error(self):
        """Ties in score broken deterministically by evidence_id, and cross-CV count ties as errors."""
        # Within-CV: tied candidates sorted deterministically by evidence_id
        candidates = [
            {"evidence_id": "sec-b", "score": 5.0, "support_label": "irrelevant"},
            {"evidence_id": "sec-a", "score": 5.0, "support_label": "full"},
        ]
        # Cross-CV diagnostic: score_negative >= score_positive -> tie counts as error
        diag = evaluate_cross_cv_diagnostic([
            {
                "job_id": "j1",
                "requirement_index": 1,
                "query": "q1",
                "sections": [
                    {"cv_id": "cv1", "evidence_id": "sec-1", "text": "agent system", "support_label": "full"},
                    {"cv_id": "cv2", "evidence_id": "sec-2", "text": "agent system", "support_label": "contradicted"},
                ]
            }
        ])
        # Same text -> identical BM25 score -> negative >= positive -> 1 error out of 1 pair
        self.assertEqual(diag["total_pairs"], 1)
        self.assertEqual(diag["error_pairs"], 1)
        self.assertEqual(diag["tie_pairs"], 1)
        self.assertAlmostEqual(diag["pairwise_error_rate"], 1.0)

    def test_cross_cv_skips_same_cv_pairs(self):
        """Cross-CV diagnostic must skip same-CV pairs (pos.cv_id == neg.cv_id)."""
        diag = evaluate_cross_cv_diagnostic([
            {
                "job_id": "j1",
                "requirement_index": 1,
                "query": "python",
                "sections": [
                    # Same CV1 has full and irrelevant
                    {"cv_id": "cv1", "evidence_id": "s1", "text": "python", "support_label": "full"},
                    {"cv_id": "cv1", "evidence_id": "s2", "text": "cooking", "support_label": "irrelevant"},
                    # CV2 has contradicted
                    {"cv_id": "cv2", "evidence_id": "s3", "text": "cooking", "support_label": "contradicted"},
                ]
            }
        ])
        # Only cv1(s1) vs cv2(s3) should be compared (1 pair).
        # cv1(s1) vs cv1(s2) must NOT be compared.
        self.assertEqual(diag["total_pairs"], 1)

    def test_zero_denominator_metrics_are_null(self):
        """When 0 queries are evaluated, metrics must be None/null with denominator 0."""
        from scripts.evaluate_ai1_pilot import aggregate_target_metrics
        # No queries with positive
        cases = [
            {
                "job_id": "j1",
                "eval_full_support": {
                    "has_positive": False,
                    "mrr": None, "hit1": None, "hit3": None,
                    "recall1": None, "recall3": None, "recall5": None, "recall10": None
                }
            }
        ]
        res = aggregate_target_metrics(cases, "eval_full_support")
        self.assertEqual(res["evaluated_queries_count"], 0)
        self.assertEqual(res["no_positive_queries_count"], 1)
        self.assertEqual(res["micro"]["denominator"], 0)
        self.assertIsNone(res["micro"]["mrr"])
        self.assertIsNone(res["macro_job"]["mrr"])

    def test_cross_cv_zero_pairs_is_null(self):
        """When 0 cross-CV pairs exist, pairwise_error_rate must be None/null."""
        diag = evaluate_cross_cv_diagnostic([])
        self.assertEqual(diag["total_pairs"], 0)
        self.assertIsNone(diag["pairwise_error_rate"])
        self.assertIsNone(diag["tie_rate"])


class TestDatasetEvaluationPipeline(unittest.TestCase):
    """Integration and behavioral tests for data loading, candidate isolation, and outputs."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.pairs_path = os.path.join(self.temp_dir, "pairs.jsonl")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_candidate_isolation(self):
        """Sections from cv2 must never leak into cv1's candidate pool."""
        pairs_data = [
            # Job 1, Query 1, CV 1
            {"job_id": "j1", "requirement_index": 1, "query": "python developer", "cv_id": "cv1",
             "evidence_id": "s1", "text": "python senior engineer", "support_label": "full"},
            {"job_id": "j1", "requirement_index": 1, "query": "python developer", "cv_id": "cv1",
             "evidence_id": "s2", "text": "sales manager", "support_label": "irrelevant"},
            # Job 1, Query 1, CV 2 (different CV, same job/query)
            {"job_id": "j1", "requirement_index": 1, "query": "python developer", "cv_id": "cv2",
             "evidence_id": "s3", "text": "python junior engineer", "support_label": "partial"},
            {"job_id": "j1", "requirement_index": 1, "query": "python developer", "cv_id": "cv2",
             "evidence_id": "s4", "text": "cook", "support_label": "contradicted"},
        ]
        with open(self.pairs_path, "w", encoding="utf-8") as f:
            for p in pairs_data:
                f.write(json.dumps(p) + "\n")

        results = evaluate_dataset(self.pairs_path)
        eval_cases = results["cases"]
        self.assertEqual(len(eval_cases), 2)  # cv1 and cv2

        cv1_case = next(c for c in eval_cases if c["cv_id"] == "cv1")
        cv2_case = next(c for c in eval_cases if c["cv_id"] == "cv2")

        # Candidate isolation: pool of cv1 has only s1, s2
        cv1_pool_ids = {c["evidence_id"] for c in cv1_case["ranked_candidates"]}
        self.assertEqual(cv1_pool_ids, {"s1", "s2"})

        # Candidate isolation: pool of cv2 has only s3, s4
        cv2_pool_ids = {c["evidence_id"] for c in cv2_case["ranked_candidates"]}
        self.assertEqual(cv2_pool_ids, {"s3", "s4"})

    def test_duplicate_pairs(self):
        """Duplicate pairs in input are deduplicated without inflating pool size."""
        pairs_data = [
            {"job_id": "j1", "requirement_index": 1, "query": "python", "cv_id": "cv1",
             "evidence_id": "s1", "text": "python dev", "support_label": "full"},
            {"job_id": "j1", "requirement_index": 1, "query": "python", "cv_id": "cv1",
             "evidence_id": "s1", "text": "python dev", "support_label": "full"},  # duplicate
            {"job_id": "j1", "requirement_index": 1, "query": "python", "cv_id": "cv1",
             "evidence_id": "s2", "text": "accountant", "support_label": "irrelevant"},
        ]
        with open(self.pairs_path, "w", encoding="utf-8") as f:
            for p in pairs_data:
                f.write(json.dumps(p) + "\n")

        results = evaluate_dataset(self.pairs_path)
        eval_case = results["cases"][0]
        self.assertEqual(len(eval_case["ranked_candidates"]), 2)
        self.assertEqual(results["deduplicated_pairs_count"], 1)

    def test_duplicate_pairs_conflict_rejection(self):
        """Pairs with duplicate identity but conflicting support_label or text must be rejected."""
        # Conflicting label
        pairs_conflicting_label = [
            {"job_id": "j1", "requirement_index": 1, "query": "python", "cv_id": "cv1",
             "evidence_id": "s1", "text": "python dev", "support_label": "full"},
            {"job_id": "j1", "requirement_index": 1, "query": "python", "cv_id": "cv1",
             "evidence_id": "s1", "text": "python dev", "support_label": "partial"},  # conflict
        ]
        with open(self.pairs_path, "w", encoding="utf-8") as f:
            for p in pairs_conflicting_label:
                f.write(json.dumps(p) + "\n")

        with self.assertRaises(ValueError):
            evaluate_dataset(self.pairs_path)

        # Conflicting text
        pairs_conflicting_text = [
            {"job_id": "j1", "requirement_index": 1, "query": "python", "cv_id": "cv1",
             "evidence_id": "s1", "text": "python dev v1", "support_label": "full"},
            {"job_id": "j1", "requirement_index": 1, "query": "python", "cv_id": "cv1",
             "evidence_id": "s1", "text": "python dev v2", "support_label": "full"},  # conflict
        ]
        with open(self.pairs_path, "w", encoding="utf-8") as f:
            for p in pairs_conflicting_text:
                f.write(json.dumps(p) + "\n")

        with self.assertRaises(ValueError):
            evaluate_dataset(self.pairs_path)

    def test_output_exists_rejection(self):
        """Evaluator rejects execution if output directory already exists."""
        output_dir = os.path.join(self.temp_dir, "existing_output")
        os.makedirs(output_dir, exist_ok=True)

        with self.assertRaises(FileExistsError):
            run_evaluation_pipeline(pairs_path=self.pairs_path, output_dir=output_dir)

    def test_model_name_required_with_model_path(self):
        """If model path is provided, model-name is required."""
        output_dir = os.path.join(self.temp_dir, "new_output")
        with self.assertRaises(ValueError):
            run_evaluation_pipeline(
                pairs_path=self.pairs_path,
                output_dir=output_dir,
                model_path="/some/path",
                model_name=None,
            )

    def test_end_to_end_pipeline_and_artifacts(self):
        """Full pipeline generates predictions.jsonl, metrics.json, and REPORT.md."""
        pairs_data = [
            # Job 1, query 1, cv1 (4 sections)
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv1",
             "evidence_id": "s1", "text": "Golang microservices backend architect", "support_label": "full"},
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv1",
             "evidence_id": "s2", "text": "Docker and Kubernetes deployment", "support_label": "partial"},
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv1",
             "evidence_id": "s3", "text": "PHP frontend web designer", "support_label": "contradicted"},
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv1",
             "evidence_id": "s4", "text": "Catering manager", "support_label": "irrelevant"},
            # Job 1, query 1, cv2 (4 sections, no full support, test no-positives for full_support)
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv2",
             "evidence_id": "s5", "text": "Java backend engineer", "support_label": "partial"},
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv2",
             "evidence_id": "s6", "text": "Database admin", "support_label": "insufficient"},
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv2",
             "evidence_id": "s7", "text": "Node.js developer", "support_label": "irrelevant"},
            {"job_id": "j1", "requirement_index": 1, "query": "Golang microservices", "cv_id": "cv2",
             "evidence_id": "s8", "text": "Accountant", "support_label": "irrelevant"},
        ]
        with open(self.pairs_path, "w", encoding="utf-8") as f:
            for p in pairs_data:
                f.write(json.dumps(p) + "\n")

        output_dir = os.path.join(self.temp_dir, "eval_out")
        metrics = run_evaluation_pipeline(
            pairs_path=self.pairs_path,
            output_dir=output_dir,
            model_path=None,
            model_name="bm25",
        )

        # Output directory exists
        self.assertTrue(os.path.isdir(output_dir))
        pred_file = os.path.join(output_dir, "predictions.jsonl")
        metrics_file = os.path.join(output_dir, "metrics.json")
        report_file = os.path.join(output_dir, "REPORT.md")

        self.assertTrue(os.path.exists(pred_file))
        self.assertTrue(os.path.exists(metrics_file))
        self.assertTrue(os.path.exists(report_file))

        # Check metrics.json contents
        with open(metrics_file, "r", encoding="utf-8") as f:
            m = json.load(f)

        self.assertIn("full_support", m["diagnostic_targets"])
        self.assertIn("any_support", m["diagnostic_targets"])
        full_tgt = m["diagnostic_targets"]["full_support"]
        any_tgt = m["diagnostic_targets"]["any_support"]

        # Check no-positive query counts
        self.assertEqual(full_tgt["no_positive_queries_count"], 1)  # cv2 had no full
        self.assertEqual(full_tgt["evaluated_queries_count"], 1)    # only cv1 evaluated for full
        self.assertEqual(any_tgt["no_positive_queries_count"], 0)   # both cv1 and cv2 had partial/full
        self.assertEqual(any_tgt["evaluated_queries_count"], 2)

        # Check macro and micro metrics present
        for tgt in [full_tgt, any_tgt]:
            self.assertIn("micro", tgt)
            self.assertIn("macro_job", tgt)
            for m_key in ["mrr", "hit1", "hit3", "recall1", "recall3", "recall5", "recall10"]:
                self.assertIn(m_key, tgt["micro"])
                self.assertIn(m_key, tgt["macro_job"])

        # Check saturated K warning
        self.assertTrue(m["saturated_k_warning"]["is_saturated"])
        self.assertIn("Recall@10", m["saturated_k_warning"]["message"])

        # Check cross-CV diagnostic
        self.assertIn("cross_cv_diagnostic", m)
        cross_diag = m["cross_cv_diagnostic"]
        self.assertIn("pairwise_error_rate", cross_diag)
        self.assertIn("total_pairs", cross_diag)

        # Check metadata and hashes
        self.assertIn("input_sha256", m["metadata"])
        self.assertIn("evaluator_script_sha256", m["metadata"])
        self.assertEqual(m["metadata"]["model_name"], "bm25")

        # Check Vietnamese REPORT.md disclaimers
        with open(report_file, "r", encoding="utf-8") as f:
            report_text = f.read()

        # Must have explicit draft/development/non-independent/no improvement claim in Vietnamese
        self.assertIn("thử nghiệm", report_text.lower())
        self.assertIn("độc lập", report_text.lower())
        self.assertIn("cải thiện", report_text.lower())


if __name__ == "__main__":
    unittest.main()
