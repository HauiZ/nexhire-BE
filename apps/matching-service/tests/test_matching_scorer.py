import os
import unittest
from datetime import date
from unittest.mock import patch

os.environ.setdefault("MATCHING_SERVICE_DB_NAME", "nexhire_matching_test")
os.environ.setdefault("MATCHING_SERVICE_DB_USER", "nexhire")
os.environ.setdefault("MATCHING_SERVICE_DB_PASS", "nexhire")
os.environ.setdefault("MATCHING_ENABLE_SEMANTIC_SCORING", "false")

from app.config import get_settings
from app.matching.scorer import MatchingScorer
from app.matching.semantic import SemanticScorer
from app.schemas.snapshots import (
    CandidateEducationSnapshot,
    CandidateExperienceSnapshot,
    CandidateMatchingSnapshot,
    CandidateSkillSnapshot,
    JobMatchingSnapshot,
)


def job_snapshot(**overrides):
    data = {
        "id": "job-1",
        "title": "Backend NestJS Developer",
        "description": "Build backend APIs with NestJS, PostgreSQL, and Redis.",
        "requirements": "Node.js, TypeScript, PostgreSQL, Redis",
        "skills": ["Node.js", "TypeScript", "PostgreSQL", "Redis"],
        "workingType": "REMOTE",
        "experienceLevel": "JUNIOR",
        "location": "Ho Chi Minh",
    }
    data.update(overrides)
    return JobMatchingSnapshot(**data)


def candidate_snapshot(**overrides):
    data = {
        "candidateId": "candidate-1",
        "summary": "Backend developer building Node.js APIs with PostgreSQL and Redis.",
        "location": "Ho Chi Minh",
        "skills": [
            CandidateSkillSnapshot(name="Node.js"),
            CandidateSkillSnapshot(name="TypeScript"),
            CandidateSkillSnapshot(name="PostgreSQL"),
            CandidateSkillSnapshot(name="Redis"),
        ],
        "experiences": [
            CandidateExperienceSnapshot(
                title="Backend Developer",
                startYear=date.today().year - 2,
                startMonth=1,
                isCurrent=True,
            )
        ],
        "educations": [
            CandidateEducationSnapshot(degree="Bachelor", fieldOfStudy="Software Engineering")
        ],
    }
    data.update(overrides)
    return CandidateMatchingSnapshot(**data)


class MatchingScorerTest(unittest.TestCase):
    def setUp(self):
        os.environ["MATCHING_ENABLE_SEMANTIC_SCORING"] = "false"
        get_settings.cache_clear()

    def test_strong_candidate_is_shortlisted(self):
        score = MatchingScorer().score(job_snapshot(), candidate_snapshot())

        self.assertGreaterEqual(score.totalScore, 85)
        self.assertEqual(score.explanation.recommendation, "STRONG_FIT")
        self.assertEqual(score.explanation.decision, "SHORTLIST")
        self.assertEqual(score.explanation.priority, "HIGH")
        self.assertEqual(score.explanation.riskFlags, [])

    def test_non_it_candidate_can_be_shortlisted(self):
        score = MatchingScorer().score(
            job_snapshot(
                title="Marketing Executive",
                description="Plan digital campaigns, manage content calendars, and optimize conversion.",
                requirements="Content marketing, campaign planning, social media, analytics",
                skills=["Content Marketing", "Campaign Planning", "Social Media", "Analytics"],
                experienceLevel="JUNIOR",
                workingType="HYBRID",
                location="Ho Chi Minh",
            ),
            candidate_snapshot(
                summary="Marketing executive with experience planning campaigns and managing social media content.",
                skills=[
                    CandidateSkillSnapshot(name="Content Marketing"),
                    CandidateSkillSnapshot(name="Campaign Planning"),
                    CandidateSkillSnapshot(name="Social Media"),
                    CandidateSkillSnapshot(name="Analytics"),
                ],
                experiences=[
                    CandidateExperienceSnapshot(
                        title="Marketing Executive",
                        startYear=date.today().year - 2,
                        startMonth=1,
                        isCurrent=True,
                    )
                ],
                educations=[
                    CandidateEducationSnapshot(degree="Bachelor", fieldOfStudy="Marketing")
                ],
            ),
        )

        self.assertGreaterEqual(score.totalScore, 85)
        self.assertEqual(score.explanation.decision, "SHORTLIST")
        self.assertEqual(score.explanation.priority, "HIGH")

    def test_semantic_skill_match_gives_partial_credit(self):
        os.environ["MATCHING_ENABLE_SEMANTIC_SCORING"] = "true"
        get_settings.cache_clear()

        scorer = MatchingScorer()
        with patch.object(scorer.semantic_scorer, "score", return_value=75), patch.object(
            scorer.semantic_scorer,
            "score_text_pair",
            side_effect=lambda left, right: 88 if left == "human resources" and right == "talent acquisition" else 0,
        ):
            score = scorer.score(
                job_snapshot(
                    title="HR Executive",
                    description="Manage employee lifecycle and recruitment operations.",
                    requirements="Human resources, employee relations, payroll",
                    skills=["Human Resources", "Employee Relations", "Payroll"],
                    experienceLevel="JUNIOR",
                ),
                candidate_snapshot(
                    summary="Talent acquisition specialist supporting hiring and people operations.",
                    skills=[
                        CandidateSkillSnapshot(name="Talent Acquisition"),
                        CandidateSkillSnapshot(name="Employee Relations"),
                    ],
                ),
            )

        self.assertGreater(score.skillScore, 50)
        self.assertIn("human resources ~ talent acquisition (skill)", score.explanation.matchedSkills)
        self.assertIn("payroll", score.explanation.missingSkills)

    def test_requirement_can_be_supported_by_certification_evidence(self):
        os.environ["MATCHING_ENABLE_SEMANTIC_SCORING"] = "true"
        get_settings.cache_clear()

        scorer = MatchingScorer()
        with patch.object(scorer.semantic_scorer, "score", return_value=78), patch.object(
            scorer.semantic_scorer,
            "score_text_pair",
            side_effect=lambda left, right: 90 if left == "english communication" and right == "toeic 900" else 0,
        ):
            score = scorer.score(
                job_snapshot(
                    title="Customer Success Executive",
                    description="Support enterprise customers and communicate clearly with regional stakeholders.",
                    requirements="English communication, customer support",
                    skills=[],
                    experienceLevel="JUNIOR",
                ),
                candidate_snapshot(
                    summary="Customer support profile for regional clients.",
                    skills=[CandidateSkillSnapshot(name="Customer Support")],
                    certifications=["TOEIC 900"],
                ),
            )

        self.assertIn("english communication ~ toeic 900 (certification)", score.explanation.matchedSkills)
        self.assertNotIn("english communication", score.explanation.missingSkills)

    def test_requirement_can_be_discovered_from_job_description(self):
        os.environ["MATCHING_ENABLE_SEMANTIC_SCORING"] = "true"
        get_settings.cache_clear()

        scorer = MatchingScorer()
        with patch.object(scorer.semantic_scorer, "score", return_value=78), patch.object(
            scorer.semantic_scorer,
            "score_text_pair",
            side_effect=lambda left, right: 90
            if left == "english communication is needed for client meetings" and right == "toeic 900"
            else 0,
        ):
            score = scorer.score(
                job_snapshot(
                    title="Account Executive",
                    description="Work with regional customers. English communication is needed for client meetings.",
                    requirements="",
                    skills=[],
                    experienceLevel="JUNIOR",
                ),
                candidate_snapshot(
                    summary="Account executive supporting regional customers.",
                    skills=[],
                    certifications=["TOEIC 900"],
                ),
            )

        self.assertIn(
            "english communication is needed for client meetings ~ toeic 900 (certification)",
            score.explanation.matchedSkills,
        )

    def test_long_requirement_can_be_supported_by_short_skill_evidence(self):
        os.environ["MATCHING_ENABLE_SEMANTIC_SCORING"] = "true"
        get_settings.cache_clear()

        scorer = MatchingScorer()
        long_requirement = "team communication listening feedback collaboration"
        with patch.object(scorer.semantic_scorer, "score", return_value=76), patch.object(
            scorer.semantic_scorer,
            "score_text_pair",
            side_effect=lambda left, right: 88 if left == long_requirement and right == "teamwork" else 0,
        ):
            score = scorer.score(
                job_snapshot(
                    title="Operations Coordinator",
                    description="Coordinate with internal teams.",
                    requirements="Team communication listening feedback collaboration",
                    skills=[],
                    experienceLevel="JUNIOR",
                ),
                candidate_snapshot(
                    summary="Operations coordinator supporting internal workflows.",
                    skills=[CandidateSkillSnapshot(name="Teamwork")],
                ),
            )

        self.assertIn(
            "team communication listening feedback collaboration ~ teamwork (skill)",
            score.explanation.matchedSkills,
        )
        self.assertNotIn(long_requirement, score.explanation.missingSkills)

    def test_weak_candidate_is_rejected_with_risk_flags(self):
        score = MatchingScorer().score(
            job_snapshot(experienceLevel="SENIOR", workingType="ONSITE", location="Ha Noi"),
            candidate_snapshot(
                summary="Customer support profile.",
                location="Da Nang",
                skills=[],
                experiences=[],
                educations=[],
            ),
        )

        self.assertLess(score.totalScore, 50)
        self.assertEqual(score.explanation.recommendation, "LOW_FIT")
        self.assertEqual(score.explanation.decision, "REJECT")
        self.assertIn("LOW_SKILL_MATCH", score.explanation.riskFlags)
        self.assertIn("LOW_EXPERIENCE_MATCH", score.explanation.riskFlags)

    def test_semantic_scorer_falls_back_to_lexical_overlap(self):
        os.environ["MATCHING_ENABLE_SEMANTIC_SCORING"] = "true"
        get_settings.cache_clear()

        scorer = SemanticScorer()
        with patch("app.matching.semantic.load_sentence_transformer", side_effect=RuntimeError("offline")):
            score = scorer.score(job_snapshot(), candidate_snapshot())

        self.assertIsNotNone(score)
        self.assertGreater(score, 0)
        self.assertEqual(scorer.model_version, "lexical-fallback")


if __name__ == "__main__":
    unittest.main()
