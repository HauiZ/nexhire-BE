"""Unit tests for pre-registered AI2 ranking evaluation metrics (Plan E01)."""

import unittest

from ml.ai2_eval_metrics import (
    evaluate_ranking_predictions,
    ndcg_at_k,
    paired_jd_bootstrap_ci,
    precision_at_k,
    recall_at_k,
    reciprocal_rank,
)


class Ai2EvalMetricsTests(unittest.TestCase):
    def test_ndcg_precision_recall_and_mrr_exact_math(self):
        # Perfect descending ordering [3, 2, 1, 0] -> NDCG@3 = 1.0
        self.assertEqual(ndcg_at_k([3, 2, 1, 0], 3), 1.0)
        # Reversed ordering [0, 0, 3, 2] -> P@2 = 0.0, R@2 = 0.0, MRR = 1/3
        self.assertEqual(precision_at_k([0, 0, 3, 2], 2), 0.0)
        self.assertEqual(recall_at_k([0, 0, 3, 2], 2), 0.0)
        self.assertAlmostEqual(reciprocal_rank([0, 0, 3, 2]), 1.0 / 3.0)
        # All zero relevances -> None (excluded from denominator cleanly, never fabricated 0/1)
        self.assertIsNone(ndcg_at_k([0, 0, 0], 5))
        self.assertIsNone(recall_at_k([0, 0, 0], 5))
        self.assertIsNone(reciprocal_rank([0, 0, 0]))

    def test_deterministic_tie_breaking_independent_of_input_order(self):
        rows_forward = [
            {"job_id": "J1", "candidate_id": "C1", "relevance": 3, "score": 50.0, "domain": "it", "level": "mid"},
            {"job_id": "J1", "candidate_id": "C2", "relevance": 0, "score": 50.0, "domain": "it", "level": "mid"},
            {"job_id": "J1", "candidate_id": "C3", "relevance": 2, "score": 50.0, "domain": "it", "level": "mid"},
        ]
        rows_reversed = list(reversed(rows_forward))
        res_f = evaluate_ranking_predictions(rows_forward, ks=(3,))
        res_r = evaluate_ranking_predictions(rows_reversed, ks=(3,))
        self.assertEqual(res_f["macro"], res_r["macro"])
        self.assertEqual(res_f["tie_rate"], 1.0)

    def test_paired_jd_bootstrap_ci_and_zero_relevant_logging(self):
        cand_rows = [
            {"job_id": "J1", "candidate_id": "C1", "relevance": 3, "score": 90.0},
            {"job_id": "J1", "candidate_id": "C2", "relevance": 0, "score": 10.0},
            {"job_id": "J2", "candidate_id": "C1", "relevance": 2, "score": 80.0},
            {"job_id": "J2", "candidate_id": "C2", "relevance": 0, "score": 20.0},
            {"job_id": "J3", "candidate_id": "C1", "relevance": 0, "score": 50.0},
            {"job_id": "J3", "candidate_id": "C2", "relevance": 0, "score": 10.0},
        ]
        base_rows = [
            {"job_id": "J1", "candidate_id": "C1", "relevance": 3, "score": 10.0},
            {"job_id": "J1", "candidate_id": "C2", "relevance": 0, "score": 90.0},
            {"job_id": "J2", "candidate_id": "C1", "relevance": 2, "score": 20.0},
            {"job_id": "J2", "candidate_id": "C2", "relevance": 0, "score": 80.0},
            {"job_id": "J3", "candidate_id": "C1", "relevance": 0, "score": 50.0},
            {"job_id": "J3", "candidate_id": "C2", "relevance": 0, "score": 10.0},
        ]
        c_eval = evaluate_ranking_predictions(cand_rows, ks=(5,))
        b_eval = evaluate_ranking_predictions(base_rows, ks=(5,))
        self.assertEqual(c_eval["zero_relevant_jd_count"], 1)
        self.assertEqual(c_eval["zero_idcg_jd_count"], 1)
        self.assertEqual(c_eval["macro"]["ndcg@5"], 1.0)
        ci = paired_jd_bootstrap_ci(c_eval["per_job"], b_eval["per_job"], metric="ndcg@5", n_boot=500)
        self.assertEqual(ci["n_jds"], 2)
        self.assertGreater(ci["ci_low"], 0.0)


if __name__ == "__main__":
    unittest.main()
