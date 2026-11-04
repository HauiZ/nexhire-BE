import json
import asyncio
from hashlib import sha256
from datetime import date
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
from uuid import uuid4

from pydantic import ValidationError

from app.config import get_settings
from app.matching.ranking import (
    FEATURE_NAMES, LogisticArtifact, LogisticRanker, RankingFeatures, WeightedRanker, load_ranker,
)
from app.matching.scorer import MatchingScorer
from app.matching.service import MatchingService
from app.models.matching import MatchResultStatus
from app.matching.semantic import SemanticScorer, build_candidate_text
from app.matching.normalizer import normalize_semantic_text
from app.schemas.snapshots import CandidateExperienceSnapshot, CandidateMatchingSnapshot
from ml.datasets import validate_dataset
from test_matching_scorer import candidate_snapshot, job_snapshot


def features(**overrides):
    return RankingFeatures(**(dict.fromkeys(FEATURE_NAMES, 50) | overrides))


def artifact(**overrides):
    return {
        "algorithm": "logistic_regression", "model_version": "logistic-test-v1",
        "feature_schema_version": "candidate-job-v2", "feature_names": list(FEATURE_NAMES),
        "preprocessing_version": "matching-text-v2", "feature_extractor_version": "heuristic-features-v2",
        "coefficients": [0] * 8, "intercept": 0, "dataset_version": "test-v1",
        "semantic_model_version": "semantic-disabled",
    } | overrides


def dataset_records(kind):
    records = []
    for split in ("train", "validation", "test"):
        for index in range(2):
            record = {
                "record_id": f"{split}-{index}", "dataset_version": "test-v1", "split": split,
                "job_id": f"job-{split}", "candidate_id": f"candidate-{split}-{index}",
                "label_source": "expert", "annotator_id": "annotator-test",
                "dataset_schema_version": "matching-dataset-v2", "preprocessing_version": "matching-text-v2",
                "candidate_snapshot_hash": sha256(f"candidate-{split}-{index}".encode()).hexdigest(),
                "job_snapshot_hash": sha256(f"job-{split}".encode()).hexdigest(), "data_origin": "PARSED_CV",
            }
            if kind == "semantic":
                record.update(
                    requirement_id=f"requirement-{split}", requirement=f"requirement text {split}",
                    evidence_id=f"evidence-{split}-{index}", evidence=f"evidence text {split} {index}",
                    evidence_source="project", label=index, negative_type="hard" if index == 0 else None,
                )
            else:
                record.update(
                    feature_schema_version="candidate-job-v2", semantic_model_version="semantic-disabled",
                    feature_extractor_version="heuristic-features-v2", score_reference_date="2026-10-08",
                    features=features().model_dump(), relevance=index * 3,
                )
            records.append(record)
    return records


class ModelReadinessTest(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "MATCHING_ENABLE_SEMANTIC_SCORING": "false", "MATCHING_RANKING_ARTIFACT_PATH": "",
        })
        self.environment.start()
        get_settings.cache_clear()

    def tearDown(self):
        self.environment.stop()
        get_settings.cache_clear()

    def test_weighted_baseline_preserves_both_weight_sets(self):
        values = features(semantic_score=80, skill_score=90, experience_score=60,
                          education_score=70, project_score=40, location_score=30, level_score=20)
        self.assertEqual(WeightedRanker().score(values, has_projects=True), 68.5)
        self.assertEqual(WeightedRanker().score(values, has_projects=False), 68.75)

    def test_logistic_scaling_order_and_extreme_logits(self):
        ranker = LogisticRanker(LogisticArtifact.model_validate(artifact(coefficients=[2] + [0] * 7)))
        self.assertEqual(ranker.score(features(semantic_score=100), has_projects=False), 88.08)
        for intercept, expected in ((1000, 100), (-1000, 0)):
            ranker = LogisticRanker(LogisticArtifact.model_validate(artifact(intercept=intercept)))
            self.assertEqual(ranker.score(features(), has_projects=True), expected)

    def test_artifact_rejects_wrong_order_and_nonfinite_values(self):
        for override in (
            {"feature_names": list(reversed(FEATURE_NAMES))},
            {"coefficients": [1]}, {"intercept": float("nan")},
            {"feature_schema_version": "unknown"},
        ):
            with self.subTest(override=override), self.assertRaises(ValidationError):
                LogisticArtifact.model_validate(artifact(**override))

    def test_features_reject_unknown_and_invalid_values(self):
        for override in ({"skill_score": 101}, {"skill_score": float("inf")}, {"unknown": 3}):
            with self.subTest(override=override), self.assertRaises(ValidationError):
                features(**override)

    def test_configured_missing_artifact_does_not_silently_fallback(self):
        with TemporaryDirectory() as directory, self.assertRaises(FileNotFoundError):
            load_ranker(str(Path(directory) / "missing.json"))

    def test_explanation_has_feature_snapshot_and_requirement_evidence(self):
        score = MatchingScorer().score(job_snapshot(), candidate_snapshot())
        explanation = score.explanation
        self.assertEqual(explanation.featureSchemaVersion, "candidate-job-v2")
        self.assertEqual(explanation.rankingModelVersion, "weighted-baseline-v1")
        self.assertEqual(round(explanation.rankingFeatures.skill_score, 2), score.skillScore)
        self.assertTrue(any(match.status == "MATCHED" and match.evidenceSource == "skill"
                            for match in explanation.requirementMatches))
        self.assertIn("rankingFeatures", explanation.model_dump())

    def test_configured_artifact_changes_total_and_records_provenance(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "ranker.json"
            path.write_text(json.dumps(artifact(intercept=2)), encoding="utf-8")
            os.environ["MATCHING_RANKING_ARTIFACT_PATH"] = str(path)
            get_settings.cache_clear()
            scorer = MatchingScorer()
            score = scorer.score(job_snapshot(), candidate_snapshot())
            self.assertEqual(score.totalScore, 88.08)
            self.assertEqual(score.explanation.rankingModelVersion, "logistic-test-v1")
            self.assertTrue(scorer.model_version.startswith("logistic-test-v1+semantic-disabled"))

    def test_semantic_version_mismatch_fails_explicitly(self):
        scorer = MatchingScorer()
        scorer.ranker = LogisticRanker(LogisticArtifact.model_validate(artifact(semantic_model_version="other")))
        with self.assertRaisesRegex(ValueError, "semantic model version"):
            scorer.score(job_snapshot(), candidate_snapshot())

    def test_long_model_version_fits_database_column(self):
        scorer = MatchingScorer()
        scorer.ranker.model_version = "long-version-" * 20
        self.assertLessEqual(len(scorer.model_version), 80)
        self.assertTrue(scorer.model_version.startswith("matching-v2:"))
        scores = scorer.score(job_snapshot(), candidate_snapshot())
        self.assertEqual(scores.explanation.rankingModelVersion, "long-version-" * 20)

    def test_offline_features_are_not_exposed_by_runtime_projections(self):
        service = MatchingService()
        scores = MatchingScorer().score(job_snapshot(), candidate_snapshot())
        result = SimpleNamespace(id=uuid4(), request_id=uuid4(), job_id=uuid4(), candidate_id=uuid4(),
            candidate_cv_id=uuid4(), application_id=uuid4(), status=MatchResultStatus.SUCCEEDED,
            total_score=scores.totalScore, explanation=scores.explanation.model_dump(mode='json'),
            error_code=None, error_message=None, created_at=None)
        snapshot = service.map_result_snapshot(result)
        self.assertIsNone(snapshot['totalScore'])
        self.assertIsNone(snapshot['matchLevel'])
        self.assertEqual(snapshot['scoringStatus'], 'NOT_AVAILABLE')
        self.assertNotIn('rankingFeatures', snapshot['explanation'])
        self.assertNotIn('requirementMatches', snapshot['explanation'])
        self.assertNotIn('decision', snapshot['explanation'])
        self.assertEqual(snapshot['explanation']['inputSnapshots']['job']['id'], 'job-1')
        service.publisher.publish_matching_completed = AsyncMock()
        asyncio.run(service.publish_completed(result))
        payload = service.publisher.publish_matching_completed.call_args.args[0]
        self.assertNotIn('inputSnapshots', payload['explanation'])
        self.assertIn('candidateSnapshotHash', payload['explanation'])
        self.assertIsNone(payload['totalScore'])

    def validate_records(self, kind, records):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "dataset.jsonl"
            path.write_text("\n".join(json.dumps(record) for record in records), encoding="utf-8")
            return validate_dataset(path, kind)

    def test_valid_datasets(self):
        for kind in ("semantic", "ranking"):
            with self.subTest(kind=kind):
                self.assertEqual(len(self.validate_records(kind, dataset_records(kind))), 6)

    def test_dataset_rejects_cross_split_identity_and_text_leakage(self):
        for field in ("job_id", "candidate_id"):
            records = dataset_records("semantic")
            records[2][field] = records[0][field]
            if field == "job_id":
                records[2]["job_snapshot_hash"] = records[0]["job_snapshot_hash"]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "Cross-split leakage"):
                self.validate_records("semantic", records)
        records = dataset_records("semantic")
        records[2]["requirement"] = records[0]["requirement"]
        records[2]["evidence"] = records[0]["evidence"]
        with self.assertRaisesRegex(ValueError, "text pair"):
            self.validate_records("semantic", records)

    def test_shared_requirement_phrase_is_allowed_across_splits(self):
        records = dataset_records("semantic")
        for record in records:
            record["requirement"] = "Python"
        self.assertEqual(len(self.validate_records("semantic", records)), 6)

    def test_explicit_job_split_policy_and_draft_validation(self):
        records = dataset_records("ranking")[:4]
        records[2]["candidate_id"] = records[0]["candidate_id"]
        with TemporaryDirectory() as directory:
            path = Path(directory) / "draft.jsonl"
            path.write_text("\n".join(json.dumps(record) for record in records), encoding="utf-8")
            self.assertEqual(len(validate_dataset(path, "ranking", split_policy="job", require_all_splits=False)), 4)
            with self.assertRaisesRegex(ValueError, "candidate"):
                validate_dataset(path, "ranking", require_all_splits=False)

    def test_dataset_rejects_duplicate_pairs_and_missing_test(self):
        records = dataset_records("ranking")
        records[1]["candidate_id"] = records[0]["candidate_id"]
        with self.assertRaisesRegex(ValueError, "Duplicate training pair"):
            self.validate_records("ranking", records)
        with self.assertRaisesRegex(ValueError, "Missing test"):
            self.validate_records("ranking", dataset_records("ranking")[:4])

    def test_dataset_rejects_unusable_labels_and_mixed_semantic_versions(self):
        records = dataset_records("ranking")
        records[1]["relevance"] = records[0]["relevance"]
        with self.assertRaisesRegex(ValueError, "different relevance"):
            self.validate_records("ranking", records)
        records = dataset_records("ranking")
        records[1]["semantic_model_version"] = "another-model"
        with self.assertRaisesRegex(ValueError, "one semantic model version"):
            self.validate_records("ranking", records)
        records = dataset_records("semantic")
        records[0]["negative_type"] = None
        with self.assertRaisesRegex(ValueError, "Negative evidence"):
            self.validate_records("semantic", records)

    def test_dataset_rejects_boolean_labels_and_whitespace_ids(self):
        for field, value in (("label", True), ("record_id", "  ")):
            records = dataset_records("semantic")
            records[0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.validate_records("semantic", records)

    def test_legacy_certification_strings_still_normalize(self):
        candidate = candidate_snapshot(certifications=["AWS Certified"])
        self.assertEqual(candidate.certifications[0].name, "AWS Certified")

    def test_parsed_snapshot_preserves_description_and_structured_evidence(self):
        request = SimpleNamespace(candidate_id=uuid4(), candidate_user_id=None, candidate_cv_id=uuid4(), parsed_resume={
            "experiences": [{"position": "Developer", "description": "Built Spring Boot REST APIs"}],
            "certifications": [{"name": "AWS", "issuer": "Amazon", "description": "Cloud architecture"}],
            "projects": [{"name": "ATS", "description": "Recruitment APIs", "technologies": ["Java"]}],
        })
        snapshot = MatchingService()._candidate_from_parsed_resume(request)
        self.assertEqual(snapshot.dataOrigin, "PARSED_CV")
        self.assertEqual(snapshot.experiences[0].id, "experiences/0")
        self.assertEqual(snapshot.certifications[0].issuer, "Amazon")
        self.assertIn("Spring Boot", build_candidate_text(snapshot))
        self.assertEqual(snapshot.projects[0].technologies, ["Java"])

    def test_experience_intervals_merge_and_use_explicit_reference_date(self):
        candidate = candidate_snapshot(experiences=[
            CandidateExperienceSnapshot(startYear=2020, startMonth=1, endYear=2022, endMonth=1),
            CandidateExperienceSnapshot(startYear=2021, startMonth=1, isCurrent=True),
            CandidateExperienceSnapshot(startYear=2010),
            CandidateExperienceSnapshot(startYear=2030, isCurrent=True),
        ])
        self.assertEqual(MatchingScorer()._estimate_years(candidate, date(2023, 1, 1)), 3)

    def test_unicode_text_and_raw_explanation_preserved(self):
        text = "Kỹ năng giao tiếp"
        self.assertEqual(normalize_semantic_text(text), "kỹ năng giao tiếp")
        candidate = candidate_snapshot(skills=[{"name": text, "id": "skill-vi"}])
        score = MatchingScorer().score(job_snapshot(skills=[text], requirements="", description=""), candidate,
                                       reference_date=date(2026, 10, 8))
        match = score.explanation.requirementMatches[0]
        self.assertEqual(match.requirement, text)
        self.assertEqual(match.evidence, text)
        self.assertEqual(match.evidenceId, "skill-vi")
        self.assertEqual(match.comparisonMethod, "EXACT")
        self.assertEqual(score.explanation.scoreReferenceDate, date(2026, 10, 8))
        self.assertEqual(len(score.explanation.candidateSnapshotHash), 64)

    def test_encoder_receives_unicode_without_accent_folding(self):
        from unittest.mock import Mock
        os.environ["MATCHING_ENABLE_SEMANTIC_SCORING"] = "true"
        get_settings.cache_clear()
        semantic = SemanticScorer()
        semantic._model = Mock()
        semantic._model.encode.return_value = [[1.0, 0.0], [1.0, 0.0]]
        self.assertEqual(semantic.score_text_pair("Kỹ năng giao tiếp", " Giao tiếp  tốt "), 100)
        self.assertEqual(semantic._model.encode.call_args.args[0], ["kỹ năng giao tiếp", "giao tiếp tốt"])

    def test_frozen_snapshots_replay_at_the_same_reference_date(self):
        scorer = MatchingScorer()
        first = scorer.score(job_snapshot(), candidate_snapshot(), reference_date=date(2026, 10, 8))
        frozen = first.explanation.inputSnapshots
        second = scorer.score(frozen.job, frozen.candidate, reference_date=first.explanation.scoreReferenceDate)
        self.assertEqual(first.model_dump(mode="json"), second.model_dump(mode="json"))

    def test_dataset_rejects_changed_jd_under_one_job_id(self):
        records = dataset_records("ranking")
        records[1]["job_snapshot_hash"] = "c" * 64
        with self.assertRaisesRegex(ValueError, "frozen JD"):
            self.validate_records("ranking", records)

    def test_requirement_extraction_does_not_truncate_or_split_nodejs(self):
        scorer = MatchingScorer()
        job = job_snapshot(skills=[f"Skill {index}" for index in range(25)], requirements="Node.js; C#", description="")
        requirements = scorer.requirement_matcher._build_requirements(job)
        self.assertEqual(len(requirements), 27)
        self.assertTrue(any(item.original_text == "Node.js" for item in requirements))

    def test_ranking_v1_artifact_is_rejected(self):
        with self.assertRaises(ValidationError):
            LogisticArtifact.model_validate(artifact(feature_schema_version="candidate-job-v1"))


if __name__ == "__main__":
    unittest.main()
