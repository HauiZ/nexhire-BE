"""Unit tests for B01/B04/B05 label validation and agreement analysis."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from analyze_label_agreement import analyze_agreement, quadratic_weighted_kappa
from validate_labels import validate_label_file


BASE = Path(__file__).resolve().parent


class TestAi2PilotLabelValidation(unittest.TestCase):
    def _sample_record(self, job, cand, rel=3, needs_hr=False):
        sec = cand["sections"][2]  # experience section
        quote = sec["text"].splitlines()[1][:40]
        return {
            "job_id": job["job_id"],
            "candidate_id": cand["candidate_id"],
            "relevance": rel,
            "rationale": "Ứng viên có kinh nghiệm liên quan trực tiếp đến các yêu cầu bắt buộc của JD.",
            "evidence": [
                {
                    "requirement_id": req["requirement_id"],
                    "section_id": sec["section_id"],
                    "quote": quote,
                    "assessment": "supported",
                }
                for req in job["requirements"]
                if req["importance"] == "required"
            ],
            "missing_information": [],
            "needs_human_review": needs_hr,
            "review_reasons": ["Ambiguous summary tenure"] if needs_hr else [],
        }

    def test_valid_label_subset_passes_and_invalid_quote_or_bool_relevance_fails(self):
        it_data = json.loads((BASE / "sources/it.json").read_text(encoding="utf-8"))
        job = it_data["jobs"][0]
        records = [self._sample_record(job, c) for c in job["candidates"]]
        payload = {
            "schema_version": "ai2-pilot-label-v1",
            "role": "initial",
            "review_model_requested": "cx/gpt-6.1-sol",
            "label_type": "silver",
            "records": records,
        }
        with TemporaryDirectory() as tmp:
            p = Path(tmp) / "labels.json"
            p.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            # Completeness check must fail when only 8/160 pairs exist
            self.assertTrue(any("missing 152 expected pairs" in e["issue"] for e in validate_label_file(p)["errors"]))
            # Partial fixture passes when require_complete=False
            res = validate_label_file(p, require_complete=False)
            self.assertEqual(res["errors"], [])

            # Non-substring quote must fail
            bad = json.loads(json.dumps(payload))
            bad["records"][0]["evidence"][0]["quote"] = "FABRICATED QUOTE NOT IN SECTION"
            p.write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")
            self.assertTrue(any("exact substring" in e["issue"] for e in validate_label_file(p, require_complete=False)["errors"]))

            # Boolean relevance must fail
            bad2 = json.loads(json.dumps(payload))
            bad2["records"][0]["relevance"] = True
            p.write_text(json.dumps(bad2, ensure_ascii=False), encoding="utf-8")
            self.assertTrue(any("strict int" in e["issue"] for e in validate_label_file(p, require_complete=False)["errors"]))

            # AI1 score leakage in rationale must fail
            bad3 = json.loads(json.dumps(payload))
            bad3["records"][0]["rationale"] = "AI1 score đạt 90 điểm nên xếp mức 3 cho hồ sơ này."
            p.write_text(json.dumps(bad3, ensure_ascii=False), encoding="utf-8")
            self.assertTrue(any("leakage" in e["issue"] for e in validate_label_file(p, require_complete=False)["errors"]))

    def test_agreement_metrics_and_queue_builder(self):
        self.assertEqual(quadratic_weighted_kappa([0, 1, 2, 3], [0, 1, 2, 3]), 1.0)
        it_data = json.loads((BASE / "sources/it.json").read_text(encoding="utf-8"))
        job = it_data["jobs"][0]
        init_recs = [self._sample_record(job, c, rel=i % 4) for i, c in enumerate(job["candidates"])]
        blind_recs = [self._sample_record(job, c, rel=i % 4) for i, c in enumerate(job["candidates"])]
        blind_recs[0]["relevance"] = 2  # disagree vs 0
        init_recs[1]["needs_human_review"] = True
        init_recs[1]["review_reasons"] = ["HR-SOURCE-008 ambiguity"]

        report = analyze_agreement(
            {"records": init_recs},
            {"records": blind_recs},
            {job["job_id"]: job},
            sample_rate_agreements=2,
        )
        self.assertEqual(report["total_common_pairs"], 8)
        self.assertEqual(report["disagreement_count"], 1)
        self.assertEqual(report["flagged_ambiguity_count"], 1)
        self.assertEqual(report["agreement_audit_sample_count"], 2)


if __name__ == "__main__":
    unittest.main()
