from datetime import date
from app.matching.normalizer import normalize_skill, normalize_text
from app.matching.requirement_matcher import RequirementMatcher
from app.matching.semantic import SemanticScorer
from app.schemas.match_result import MatchExplanation, MatchScores
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


DEFAULT_WEIGHTS = {
    "skill": 0.30,
    "experience": 0.20,
    "project": 0.10,
    "education": 0.1,
    "location": 0.05,
    "level": 0.05,
    "semantic": 0.20,
}

NO_PROJECT_WEIGHTS = {
    "skill": 0.30,
    "experience": 0.25,
    "project": 0.0,
    "education": 0.1,
    "location": 0.075,
    "level": 0.075,
    "semantic": 0.20,
}

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
    def __init__(self) -> None:
        self.semantic_scorer = SemanticScorer()
        self.requirement_matcher = RequirementMatcher(self.semantic_scorer)

    @property
    def model_version(self) -> str:
        return f"hybrid-v1+{self.semantic_scorer.model_version}"

    def score(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> MatchScores:
        skill_score, matched_skills, missing_skills = self._score_requirements(job, candidate)
        project_score = self._score_projects(job, candidate)
        experience_score = self._score_experience(job, candidate, project_score)
        education_score = self._score_education(candidate)
        location_score = self._score_location(job, candidate)
        level_score = self._score_level(job, candidate)
        semantic_score = self.semantic_scorer.score(job, candidate)
        effective_semantic_score = semantic_score if semantic_score is not None else skill_score
        weights = DEFAULT_WEIGHTS if candidate.projects else NO_PROJECT_WEIGHTS

        total = (
            weights["skill"] * skill_score
            + weights["experience"] * experience_score
            + weights["project"] * project_score
            + weights["education"] * education_score
            + weights["location"] * location_score
            + weights["level"] * level_score
            + weights["semantic"] * effective_semantic_score
        )
        total = round(max(0, min(100, total)), 2)
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
    ) -> float:
        required_years = LEVEL_YEARS.get(job.experienceLevel.upper(), 1)
        if required_years <= 0:
            return 100
        candidate_years = self._estimate_years(candidate)
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
        job_text = normalize_text(
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
            project_text = normalize_text(
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

    def _estimate_years(self, candidate: CandidateMatchingSnapshot) -> float:
        total_months = 0
        today = date.today()
        for exp in candidate.experiences:
            if not exp.startYear:
                continue
            start_month = exp.startMonth or 1
            end_year = today.year if exp.isCurrent or not exp.endYear else exp.endYear
            end_month = today.month if exp.isCurrent or not exp.endMonth else exp.endMonth
            total_months += max(0, (end_year - exp.startYear) * 12 + end_month - start_month)
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

    def _score_level(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> float:
        required_years = LEVEL_YEARS.get(job.experienceLevel.upper(), 1)
        candidate_years = self._estimate_years(candidate)
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
