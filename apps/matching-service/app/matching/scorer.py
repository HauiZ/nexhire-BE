"""Offline legacy feature/scoring reproduction; never called by the runtime worker."""

from datetime import date, datetime, timezone
import json
from hashlib import sha256
from app.config import get_settings
from app.matching.ranking import FEATURE_EXTRACTOR_VERSION, FEATURE_SCHEMA_VERSION, LogisticRanker, Ranker, RankingFeatures, load_ranker
from app.matching.normalizer import PREPROCESSING_VERSION, normalize_semantic_text, normalize_skill, normalize_text
from app.matching.requirement_matcher import RequirementMatcher
from app.matching.semantic import SemanticScorer
from app.schemas.match_result import MatchExplanation, MatchScores, MatchingInputSnapshots, RequirementEvidence
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


LEVEL_YEARS = {
    "INTERN": 0,
    "FRESHER": 0,
    "JUNIOR": 1,
    "MIDDLE": 3,
    "SENIOR": 5,
    "LEAD": 7,
    "MANAGER": 7,
}

EDUCATION_LEVELS = {
    "high school": 1,
    "certificate": 1,
    "associate": 1,
    "bachelor": 2,
    "engineer": 2,
    "master": 3,
    "phd": 4,
    "doctor": 4,
}


class MatchingScorer:
    def __init__(self, *, semantic_scorer: SemanticScorer | None = None, ranker: Ranker | None = None) -> None:
        self.semantic_scorer = semantic_scorer if semantic_scorer is not None else SemanticScorer()
        self.requirement_matcher = RequirementMatcher(self.semantic_scorer)
        self.ranker = ranker if ranker is not None else load_ranker(get_settings().ranking_artifact_path)

    @property
    def model_version(self) -> str:
        version = f"{self.ranker.model_version}+{self.semantic_scorer.model_version}+{PREPROCESSING_VERSION}+{FEATURE_EXTRACTOR_VERSION}"
        return version if len(version) <= 80 else f"matching-v2:{sha256(version.encode()).hexdigest()}"

    def score(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot, *, reference_date: date | None = None) -> MatchScores:
        reference_date = reference_date or datetime.now(timezone.utc).date()
        requirements = self.requirement_matcher.score(job, candidate)
        skill_score, matched_skills, missing_skills = requirements.score, requirements.matched, requirements.missing
        project_score = self._score_projects(job, candidate)
        experience_score = self._score_experience(job, candidate, project_score, reference_date)
        education_score = self._score_education(candidate)
        location_score = self._score_location(job, candidate)
        level_score = self._score_level(job, candidate, reference_date)
        semantic_score = self.semantic_scorer.score(job, candidate)
        effective_semantic_score = semantic_score if semantic_score is not None else skill_score
        features = RankingFeatures(
            semantic_score=effective_semantic_score, skill_score=skill_score,
            experience_score=experience_score, project_score=project_score,
            education_score=education_score, certification_score=0,
            location_score=location_score, level_score=level_score,
        )
        if isinstance(self.ranker, LogisticRanker) and self.ranker.artifact.semantic_model_version != self.semantic_scorer.model_version:
            raise ValueError("Ranking artifact semantic model version differs from the active semantic scorer")
        total = self.ranker.score(features, has_projects=bool(candidate.projects))
        explanation = self._explain(
            total,
            matched_skills,
            missing_skills,
            skill_score,
            experience_score,
            project_score,
            education_score,
            location_score,
            effective_semantic_score,
        )
        explanation.requirementMatches = [
            RequirementEvidence(
                requirementId=match.requirement_id,
                requirement=match.original_requirement or match.requirement, requirementSource=match.requirement_source,
                evidence=match.original_evidence, evidenceSource=match.source, evidenceId=match.evidence_id,
                comparisonScore=match.comparison_score, comparisonMethod=match.comparison_method,
                score=round(match.score * 100, 2),
                status="MATCHED" if match.matched else "PARTIAL" if match.score > 0 else "NOT_FOUND",
            ) for match in requirements.matches
        ]
        explanation.rankingFeatures = features
        explanation.featureSchemaVersion = FEATURE_SCHEMA_VERSION
        explanation.semanticModelVersion = self.semantic_scorer.model_version
        explanation.rankingModelVersion = self.ranker.model_version
        explanation.preprocessingVersion = PREPROCESSING_VERSION
        explanation.featureExtractorVersion = FEATURE_EXTRACTOR_VERSION
        explanation.scoreReferenceDate = reference_date
        explanation.dataOrigin = candidate.dataOrigin
        explanation.candidateSnapshotHash = self._snapshot_hash(candidate)
        explanation.jobSnapshotHash = self._snapshot_hash(job)
        explanation.inputSnapshots = MatchingInputSnapshots(job=job, candidate=candidate)
        explanation.featureLimitations = ["CERTIFICATION_NOT_SCORED", "EDUCATION_NOT_JD_SPECIFIC", "EXPERIENCE_NOT_SKILL_SPECIFIC"]
        if semantic_score is None:
            explanation.featureLimitations.append("SEMANTIC_REPLACED_BY_REQUIREMENT_SCORE")
        return MatchScores(
            totalScore=total,
            skillScore=round(skill_score, 2),
            experienceScore=round(experience_score, 2),
            educationScore=round(education_score, 2),
            certificationScore=0,
            projectScore=round(project_score, 2),
            preferenceScore=round((location_score + level_score) / 2, 2),
            semanticScore=round(effective_semantic_score, 2),
            explanation=explanation,
        )

    @staticmethod
    def _snapshot_hash(snapshot) -> str:
        payload = json.dumps(snapshot.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return sha256(payload.encode("utf-8")).hexdigest()

    def _score_requirements(
        self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot
    ) -> tuple[float, list[str], list[str]]:
        result = self.requirement_matcher.score(job, candidate)
        return result.score, result.matched, result.missing

    def _score_skills(
        self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot
    ) -> tuple[float, list[str], list[str]]:
        required = [normalize_skill(skill) for skill in job.skills if normalize_skill(skill)]
        candidate_skills = [normalize_skill(skill.name) for skill in candidate.skills if normalize_skill(skill.name)]
        if not required:
            return 70, [], []

        matched = []
        missing = []
        score_units = []

        for skill in required:
            match_score, matched_label = self._best_skill_match(skill, candidate_skills)
            score_units.append(match_score)
            if match_score >= 0.65:
                matched.append(matched_label or skill)
            else:
                missing.append(skill)

        return (sum(score_units) / len(required)) * 100, matched, missing

    def _best_skill_match(self, required_skill: str, candidate_skills: list[str]) -> tuple[float, str | None]:
        if not candidate_skills:
            return 0, None
        if required_skill in candidate_skills:
            return 1, required_skill

        best_score = 0.0
        best_skill = None
        for candidate_skill in candidate_skills:
            semantic_score = self.semantic_scorer.score_text_pair(required_skill, candidate_skill)
            if semantic_score is None:
                semantic_score = self._token_overlap_score(required_skill, candidate_skill)
            weighted_score = self._semantic_skill_weight(semantic_score)
            if weighted_score > best_score:
                best_score = weighted_score
                best_skill = candidate_skill

        if best_score >= 0.65 and best_skill:
            return best_score, f"{required_skill} ~ {best_skill}"
        return best_score, None

    def _token_overlap_score(self, left: str, right: str) -> float:
        left_terms = set(left.split())
        right_terms = set(right.split())
        if not left_terms or not right_terms:
            return 0
        return (len(left_terms & right_terms) / max(len(left_terms), len(right_terms))) * 100

    def _semantic_skill_weight(self, semantic_score: float) -> float:
        if semantic_score >= 85:
            return 0.9
        if semantic_score >= 75:
            return 0.75
        if semantic_score >= 65:
            return 0.5
        return 0

    def _score_experience(
        self,
        job: JobMatchingSnapshot,
        candidate: CandidateMatchingSnapshot,
        project_score: float,
        reference_date: date | None = None,
    ) -> float:
        required_years = LEVEL_YEARS.get(job.experienceLevel.upper(), 1)
        if required_years <= 0:
            return 100
        candidate_years = self._estimate_years(candidate, reference_date)
        base_score = min(100, (candidate_years / required_years) * 100)
        level = job.experienceLevel.upper()
        if level in {"FRESHER", "JUNIOR"}:
            return max(base_score, min(70, project_score * 0.75))
        if level == "MIDDLE":
            return max(base_score, min(40, project_score * 0.45))
        if level in {"SENIOR", "LEAD", "MANAGER"}:
            return max(base_score, min(20, project_score * 0.25))
        return base_score

    def _score_projects(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> float:
        if not candidate.projects:
            return 0
        job_text = normalize_semantic_text(
            " ".join(
                part
                for part in [
                    job.title,
                    job.requirements,
                    job.description,
                    " ".join(job.skills),
                ]
                if part
            )
        )
        if not job_text:
            return 50

        best_score = 0.0
        for project in candidate.projects:
            project_text = normalize_semantic_text(
                " ".join(
                    part
                    for part in [
                        project.name,
                        project.description,
                        " ".join(project.technologies),
                    ]
                    if part
                )
            )
            if not project_text:
                continue
            score = self.semantic_scorer.score_text_pair(job_text, project_text)
            if score is None:
                score = self._token_overlap_score(job_text, project_text)
            best_score = max(best_score, score)
        return min(100, best_score)

    def _estimate_years(self, candidate: CandidateMatchingSnapshot, reference_date: date | None = None) -> float:
        intervals = []
        today = reference_date or datetime.now(timezone.utc).date()
        current_month = today.year * 12 + today.month - 1
        for exp in candidate.experiences:
            if not exp.startYear:
                continue
            start_month = exp.startMonth or 1
            if not exp.isCurrent and not exp.endYear:
                continue
            end_year = today.year if exp.isCurrent else exp.endYear
            end_month = today.month if exp.isCurrent else (exp.endMonth or 12)
            start = exp.startYear * 12 + start_month - 1
            end = min(current_month, end_year * 12 + end_month - 1)
            if end > start:
                intervals.append((start, end))
        # Merge half-open month intervals so overlapping jobs count only once.
        total_months = 0
        merged_end = -1
        for start, end in sorted(intervals):
            total_months += max(0, end - max(start, merged_end))
            merged_end = max(merged_end, end)
        return total_months / 12

    def _score_education(self, candidate: CandidateMatchingSnapshot) -> float:
        if not candidate.educations:
            return 50
        highest = 0
        for edu in candidate.educations:
            haystack = normalize_text(f"{edu.degree or ''} {edu.fieldOfStudy or ''}")
            for key, level in EDUCATION_LEVELS.items():
                if key in haystack:
                    highest = max(highest, level)
        return 100 if highest >= 2 else 60 if highest == 1 else 50

    def _score_location(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> float:
        working_type = job.workingType.upper()
        if "REMOTE" in working_type:
            return 100
        job_location = normalize_text(job.location)
        candidate_location = normalize_text(candidate.location)
        if not job_location or not candidate_location:
            return 60
        return 100 if job_location in candidate_location or candidate_location in job_location else 30

    def _score_level(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot, reference_date: date | None = None) -> float:
        required_years = LEVEL_YEARS.get(job.experienceLevel.upper(), 1)
        candidate_years = self._estimate_years(candidate, reference_date)
        if candidate_years >= required_years:
            return 100 if candidate_years <= required_years + 3 else 85
        return min(100, (candidate_years / max(1, required_years)) * 100)

    def _explain(
        self,
        total: float,
        matched_skills: list[str],
        missing_skills: list[str],
        skill_score: float,
        experience_score: float,
        project_score: float,
        education_score: float,
        location_score: float,
        semantic_score: float,
    ) -> MatchExplanation:
        strong = []
        weak = []
        if skill_score >= 70:
            strong.append("Candidate matches most required skills")
        elif missing_skills:
            weak.append("Candidate is missing several required skills")
        if experience_score >= 80:
            strong.append("Candidate experience fits the requested level")
        else:
            weak.append("Candidate experience is below the requested level")
        if project_score >= 70:
            strong.append("Candidate projects are relevant to the role")
        if education_score < 60:
            weak.append("Education signal is incomplete or below expectation")
        if location_score < 60:
            weak.append("Candidate location may not fit this working arrangement")
        if semantic_score >= 75:
            strong.append("Resume context is semantically close to the job description")
        elif semantic_score < 45:
            weak.append("Resume context has weak semantic overlap with the job description")
        recommendation = (
            "STRONG_FIT" if total >= 85 else "GOOD_FIT" if total >= 70 else "PARTIAL_FIT" if total >= 50 else "LOW_FIT"
        )
        decision, priority = self._decision(total, skill_score, experience_score, project_score, semantic_score)
        next_actions = self._next_actions(decision, missing_skills, skill_score, experience_score, semantic_score)
        risk_flags = self._risk_flags(missing_skills, skill_score, experience_score, education_score, semantic_score)
        return MatchExplanation(
            matchedSkills=matched_skills,
            missingSkills=missing_skills,
            strongSignals=strong,
            weakSignals=weak,
            recommendation=recommendation,
            decision=decision,
            priority=priority,
            summary=self._summary(recommendation, decision, missing_skills),
            nextActions=next_actions,
            riskFlags=risk_flags,
        )

    def _decision(
        self,
        total: float,
        skill_score: float,
        experience_score: float,
        project_score: float,
        semantic_score: float,
    ) -> tuple[str, str]:
        if total >= 85 and skill_score >= 70 and experience_score >= 70:
            return "SHORTLIST", "HIGH"
        if total >= 70 and semantic_score >= 60:
            return "REVIEW_MANUALLY", "HIGH"
        if total >= 50:
            return "KEEP_WARM", "NORMAL"
        if semantic_score >= 75 and project_score >= 55 and total >= 40:
            return "KEEP_WARM", "LOW"
        return "REJECT", "LOW"

    def _next_actions(
        self,
        decision: str,
        missing_skills: list[str],
        skill_score: float,
        experience_score: float,
        semantic_score: float,
    ) -> list[str]:
        if decision == "SHORTLIST":
            return ["Move candidate to screening or first interview"]
        if decision == "REVIEW_MANUALLY":
            actions = ["Review CV details before shortlisting"]
            if missing_skills:
                actions.append(f"Check whether missing skills are covered by related experience: {', '.join(missing_skills[:5])}")
            return actions
        if decision == "KEEP_WARM":
            actions = ["Keep candidate for future or less strict roles"]
            if skill_score < 60:
                actions.append("Validate core skills manually")
            if experience_score < 60:
                actions.append("Check whether experience level can be compensated by projects")
            if semantic_score < 50:
                actions.append("Compare CV summary with job requirements manually")
            return actions
        return ["Do not prioritize for this role unless recruiter has additional context"]

    def _risk_flags(
        self,
        missing_skills: list[str],
        skill_score: float,
        experience_score: float,
        education_score: float,
        semantic_score: float,
    ) -> list[str]:
        flags = []
        if len(missing_skills) >= 3:
            flags.append("MULTIPLE_REQUIRED_SKILLS_MISSING")
        if skill_score < 50:
            flags.append("LOW_SKILL_MATCH")
        if experience_score < 50:
            flags.append("LOW_EXPERIENCE_MATCH")
        if education_score < 60:
            flags.append("WEAK_EDUCATION_SIGNAL")
        if semantic_score < 45:
            flags.append("LOW_SEMANTIC_RELEVANCE")
        return flags

    def _summary(self, recommendation: str, decision: str, missing_skills: list[str]) -> str:
        if decision == "SHORTLIST":
            return "Candidate is a strong fit and should be prioritized for recruiter screening."
        if decision == "REVIEW_MANUALLY":
            return "Candidate looks promising, but recruiter should verify gaps before shortlisting."
        if decision == "KEEP_WARM":
            return "Candidate is a partial fit and may be better for future or adjacent roles."
        if missing_skills:
            return "Candidate is currently a weak fit because several important requirements are missing."
        return f"Candidate is currently classified as {recommendation.lower().replace('_', ' ')} for this role."
