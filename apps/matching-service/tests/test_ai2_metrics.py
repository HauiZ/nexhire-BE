"""Hand-calculated synthetic tests only; no dataset or model imports."""

import copy
import json
import math
import unittest

from ml.ai2 import evaluate_ranking


def pool(job, labels):
    return [dict(job_id=job, candidate_id=f"c{i}", relevance=label, score=10.0 - i)
            for i, label in enumerate(labels)]


class RankingMetricsTests(unittest.TestCase):
    def test_hand_calculated_graded_metrics(self):
        result = evaluate_ranking(pool("a", [0, 3, 2]))
        metrics = result["per_job"]["a"]["metrics"]
        self.assertEqual(metrics["precision@1"], 0)
        self.assertEqual(metrics["precision@2"], 1 / 2)
        self.assertEqual(metrics["precision@3"], 2 / 3)
        self.assertEqual(metrics["recall@1"], 0)
        self.assertEqual(metrics["recall@2"], 1 / 2)
        self.assertEqual(metrics["recall@3"], 1)
        self.assertEqual(metrics["mrr"], 1 / 2)
        self.assertEqual(metrics["ndcg@1"], 0)
        self.assertAlmostEqual(metrics["ndcg@2"], (7 / math.log2(3)) / (7 + 3 / math.log2(3)))
        self.assertAlmostEqual(metrics["ndcg@3"], (7 / math.log2(3) + 3 / 2) / (7 + 3 / math.log2(3)))

    def test_zero_relevant_and_all_zero_have_distinct_denominators(self):
        result = evaluate_ranking(pool("relevant", [0, 3, 2]) +
                                  pool("low", [1, 0, 0]) + pool("zero", [0, 0, 0]))
        self.assertEqual(result["job_count"], 3)
        self.assertEqual(result["zero_relevant_job_count"], 2)
        self.assertEqual(result["all_zero_job_count"], 1)
        aggregate = result["aggregate"]
        self.assertEqual(aggregate["precision@3"], {"value": 2 / 9, "denominator": 3, "excluded": 0})
        self.assertEqual(aggregate["recall@3"], {"value": 1, "denominator": 1, "excluded": 2})
        self.assertEqual(aggregate["mrr"], {"value": 1 / 2, "denominator": 1, "excluded": 2})
        self.assertEqual(aggregate["ndcg@1"], {"value": 1 / 2, "denominator": 2, "excluded": 1})
        self.assertIsNone(result["per_job"]["low"]["metrics"]["recall@1"])
        self.assertEqual(result["per_job"]["low"]["metrics"]["ndcg@3"], 1)
        self.assertIsNone(result["per_job"]["zero"]["metrics"]["ndcg@3"])

    def test_all_undefined_aggregate_is_none(self):
        result = evaluate_ranking(pool("zero", [0, 0, 0]))
        for name in ("mrr", "recall@1", "ndcg@3"):
            self.assertEqual(result["aggregate"][name], {"value": None, "denominator": 0, "excluded": 1})
        self.assertEqual(result["aggregate"]["precision@3"]["value"], 0)

    def test_macro_not_candidate_micro_average(self):
        result = evaluate_ranking(pool("small", [3]) + pool("large", [0, 0, 0, 2]), ks=(1,))
        self.assertEqual(result["aggregate"]["precision@1"]["value"], 1 / 2)
        self.assertEqual(result["aggregate"]["mrr"]["value"], (1 + 1 / 4) / 2)
        self.assertEqual(result["aggregate"]["recall@1"]["value"], 1 / 2)

    def test_ties_use_candidate_id_and_ignore_input_order(self):
        records = [dict(job_id="j", candidate_id="b", relevance=3, score=1.0),
                   dict(job_id="j", candidate_id="a", relevance=0, score=1.0),
                   dict(job_id="j", candidate_id="c", relevance=2, score=1.0)]
        result = evaluate_ranking(records)
        self.assertEqual(result, evaluate_ranking(reversed(records)))
        self.assertEqual(result["per_job"]["j"]["ranking"], ["a", "b", "c"])
        self.assertEqual(result["aggregate"]["mrr"]["value"], 1 / 2)

    def test_string_ids_tie_lexically_and_cross_job_candidates_allowed(self):
        records = [dict(job_id=job, candidate_id=candidate, relevance=2, score=-1.0)
                   for job in ("2", "1") for candidate in ("2", "10")]
        result = evaluate_ranking(records, ks=(2, 1))
        self.assertEqual(list(result["per_job"]), ["1", "2"])
        self.assertEqual(result["per_job"]["1"]["ranking"], ["10", "2"])
        self.assertEqual(result["ks"], (1, 2))

    def test_json_roundtrip_preserves_job_keys_and_metrics(self):
        result = evaluate_ranking(pool("1", [3, 2, 0]) + pool("01", [0, 0, 0]))
        restored = json.loads(json.dumps(result, allow_nan=False))
        self.assertEqual(len(restored["per_job"]), result["job_count"])
        self.assertEqual(restored["per_job"], result["per_job"])
        self.assertEqual(restored["aggregate"], result["aggregate"])
        self.assertEqual(restored, dict(result, ks=list(result["ks"])))

    def test_integer_job_and_candidate_ids_rejected(self):
        for field in ("job_id", "candidate_id"):
            for value in (0, 1, -1):
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, "nonempty strings"):
                    evaluate_ranking([dict(pool("1", [2])[0], **{field: value})], ks=(1,))
        with self.assertRaisesRegex(ValueError, "nonempty strings"):
            evaluate_ranking(pool("1", [2]) + pool(1, [2]), ks=(1,))

    def test_duplicates_rejected_even_if_identical(self):
        record = pool("a", [2])[0]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            evaluate_ranking([record, record], ks=(1,))

    def test_pool_limit_applies_to_every_job(self):
        records = pool("a", [2, 1, 0, 0])
        with self.assertRaisesRegex(ValueError, "exceeds candidate pool"):
            evaluate_ranking(records, ks=(10,))
        with self.assertRaisesRegex(ValueError, "exceeds candidate pool"):
            evaluate_ranking(records + pool("b", [1]), ks=(2,))
        self.assertEqual(evaluate_ranking(records, ks=(4,))["aggregate"]["recall@4"]["value"], 1)

    def test_invalid_ks(self):
        for ks in ((), (0,), (-1,), (1.0,), (True,), (1, 1), None, "1", (float("nan"),)):
            with self.subTest(ks=ks), self.assertRaises(ValueError):
                evaluate_ranking(pool("a", [2, 1, 0]), ks=ks)

    def test_invalid_scores(self):
        for score in (float("nan"), float("inf"), float("-inf"), True, False, "1", None, complex(1)):
            with self.subTest(score=score), self.assertRaises(ValueError):
                evaluate_ranking([dict(pool("a", [2])[0], score=score)], ks=(1,))

    def test_invalid_relevance(self):
        for relevance in (-1, 4, 2.0, True, False, None, "2"):
            with self.subTest(relevance=relevance), self.assertRaises(ValueError):
                evaluate_ranking([dict(pool("a", [2])[0], relevance=relevance)], ks=(1,))

    def test_missing_fields_empty_inputs_and_bad_rows(self):
        for records in ([], iter(()), None, [None], [1], "abc"):
            with self.subTest(records=records), self.assertRaises(ValueError):
                evaluate_ranking(records, ks=(1,))
        for field in ("job_id", "candidate_id", "relevance", "score"):
            row = pool("a", [2])[0]
            del row[field]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "missing field"):
                evaluate_ranking([row], ks=(1,))

    def test_invalid_ids(self):
        for field in ("job_id", "candidate_id"):
            for value in (None, "", "  ", True, False, 1.5, [], {}):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    evaluate_ranking([dict(pool("a", [2])[0], **{field: value})], ks=(1,))

    def test_cutoff_validation_and_custom_threshold(self):
        for cutoff in (-1, 4, 2.0, True, None):
            with self.subTest(cutoff=cutoff), self.assertRaises(ValueError):
                evaluate_ranking(pool("a", [2, 1, 0]), relevant_cutoff=cutoff)
        result = evaluate_ranking(pool("a", [1, 0, 3]), relevant_cutoff=3)
        self.assertEqual(result["aggregate"]["mrr"]["value"], 1 / 3)
        self.assertEqual(result["aggregate"]["recall@2"]["value"], 0)
        zero_cutoff = evaluate_ranking(pool("a", [0, 0, 0]), relevant_cutoff=0)
        self.assertEqual(zero_cutoff["zero_relevant_job_count"], 0)
        self.assertEqual(zero_cutoff["aggregate"]["recall@1"]["value"], 1 / 3)
        self.assertIsNone(zero_cutoff["aggregate"]["ndcg@1"]["value"])

    def test_generator_input_and_no_input_mutation(self):
        records = pool("a", [3, 2, 0])
        snapshot = copy.deepcopy(records)
        result = evaluate_ranking((row for row in records), ks=(k for k in (3, 1)))
        self.assertEqual(records, snapshot)
        self.assertEqual(result["aggregate"]["ndcg@3"]["value"], 1)
        result["per_job"]["a"]["ranking"].clear()
        self.assertEqual(records, snapshot)


if __name__ == "__main__":
    unittest.main()
