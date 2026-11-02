import copy
import hashlib
import json
import unittest

from ml.ai2.snapshot_fields import snapshot_digest, walk_snapshot_fields


class SnapshotFieldsTests(unittest.TestCase):
    def walk(self, snapshot, kind):
        return walk_snapshot_fields(snapshot, kind, expected_sha256=snapshot_digest(snapshot))

    def test_digest_matches_scorer_serialization(self):
        snapshot = {"requirements": "Ưu tiên Python", "skills": []}
        payload = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        self.assertEqual(snapshot_digest(snapshot), hashlib.sha256(payload.encode("utf-8")).hexdigest())
        self.assertEqual(snapshot_digest(dict(reversed(list(snapshot.items())))), snapshot_digest(snapshot))

    def test_job_allowlist_preserves_original_text(self):
        snapshot = {"title": "Developer", "requirements": "  Python\nSQL  ",
                    "description": None, "skills": ["C++", "  "],
                    "location": "excluded", "relevance": 3, "target_scenario": "excluded"}
        before = copy.deepcopy(snapshot)
        fields = self.walk(snapshot, "job")
        self.assertEqual([(f.field_path, f.text) for f in fields],
                         [("title", "Developer"), ("requirements", "  Python\nSQL  "), ("skills[0]", "C++")])
        self.assertTrue(all(f.snapshot_sha256 == snapshot_digest(snapshot) for f in fields))
        self.assertEqual(snapshot, before)

    def test_candidate_record_attribution_and_exclusions(self):
        snapshot = {"fullName": "excluded", "summary": "Overview",
                    "experiences": [{"id": "e1", "title": "Analyst", "company": "excluded"}],
                    "educations": [{"degree": "Bachelor", "school": "excluded"}],
                    "projects": [{"id": "p1", "description": "Uses SQL", "technologies": ["SQL"]},
                                 {"description": "Uses Python", "technologies": ["Python"]}]}
        fields = self.walk(snapshot, "candidate")
        self.assertNotIn("excluded", [f.text for f in fields])
        sql = next(f for f in fields if f.field_path == "projects[0].technologies[0]")
        python = next(f for f in fields if f.field_path == "projects[1].technologies[0]")
        self.assertEqual((sql.record_kind, sql.record_index, sql.evidence_id), ("project", 0, "p1"))
        self.assertEqual((python.record_index, python.evidence_id), (1, None))

    def test_empty_fields_are_not_fabricated(self):
        self.assertEqual(self.walk({"summary": " \n", "headline": None}, "candidate"), ())
        self.assertEqual(self.walk({}, "job"), ())

    def test_hash_mismatch_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            walk_snapshot_fields({"title": "Job"}, "job", expected_sha256="0" * 64)

    def test_malformed_allowed_fields_rejected(self):
        cases = [("job", {"skills": "Python"}), ("job", {"requirements": 3}),
                 ("candidate", {"projects": ["project"]}),
                 ("candidate", {"projects": [{"id": 3}]}),
                 ("candidate", {"projects": [{"technologies": "SQL"}]}),
                 ("candidate", {"skills": [{"name": False}]})]
        for kind, snapshot in cases:
            with self.subTest(snapshot=snapshot), self.assertRaises(ValueError):
                self.walk(snapshot, kind)

    def test_invalid_kind_and_nonfinite_input_rejected(self):
        with self.assertRaises(ValueError):
            self.walk({}, "raw_document")
        with self.assertRaises(ValueError):
            snapshot_digest({"value": float("nan")})

    def test_json_roundtrip_produces_identical_fields(self):
        snapshot = {"summary": "Tiếng Việt", "skills": [{"id": "e2", "name": "C#"}]}
        online = json.loads(json.dumps(snapshot, ensure_ascii=False))
        self.assertEqual(self.walk(snapshot, "candidate"), self.walk(online, "candidate"))


if __name__ == "__main__":
    unittest.main()
