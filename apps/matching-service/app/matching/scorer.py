from datetime import date
from app.matching.normalizer import normalize_skill, normalize_text
from app.schemas.match_result import MatchExplanation, MatchScores
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


DEFAULT_WEIGHTS = {
    "skill": 0.45,
    "experience": 0.25,
    "education": 0.1,
    "location": 0.1,
    "level": 0.1,
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
    model_version = "heuristic-v1"

    def score(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> MatchScores:
        skill_score, matched_skills, missing_skills = self._score_skills(job, candidate)
        experience_score = self._score_experience(job, candidate)
        education_score = self._score_education(candidate)
        location_score = self._score_location(job, candidate)
        level_score = self._score_level(job, candidate)

        total = (
            DEFAULT_WEIGHTS["skill"] * skill_score
            + DEFAULT_WEIGHTS["experience"] * experience_score
            + DEFAULT_WEIGHTS["education"] * education_score
            + DEFAULT_WEIGHTS["location"] * location_score
            + DEFAULT_WEIGHTS["level"] * level_score
        )
        total = round(max(0, min(100, total)), 2)
        explanation = self._explain(
            total, matched_skills, missing_skills, skill_score, experience_score, education_score, location_score
        )
        return MatchScores(
            totalScore=total,
            skillScore=round(skill_score, 2),
            experienceScore=round(experience_score, 2),
            educationScore=round(education_score, 2),
            certificationScore=0,
            projectScore=0,
            preferenceScore=round((location_score + level_score) / 2, 2),
            semanticScore=round(skill_score, 2),
            explanation=explanation,
        )

    def _score_skills(
        self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot
    ) -> tuple[float, list[str], list[str]]:
        required = [normalize_skill(skill) for skill in job.skills if normalize_skill(skill)]
        candidate_skills = {normalize_skill(skill.name) for skill in candidate.skills if normalize_skill(skill.name)}
        if not required:
            return 70, [], []
        matched = [skill for skill in required if skill in candidate_skills]
        missing = [skill for skill in required if skill not in candidate_skills]
        return (len(matched) / len(required)) * 100, matched, missing

    def _score_experience(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> float:
        required_years = LEVEL_YEARS.get(job.experienceLevel.upper(), 1)
        if required_years <= 0:
            return 100
        candidate_years = self._estimate_years(candidate)
        return min(100, (candidate_years / required_years) * 100)

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
        education_score: float,
        location_score: float,
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
        if education_score < 60:
            weak.append("Education signal is incomplete or below expectation")
        if location_score < 60:
            weak.append("Candidate location may not fit this working arrangement")
        recommendation = (
            "STRONG_FIT" if total >= 85 else "GOOD_FIT" if total >= 70 else "PARTIAL_FIT" if total >= 50 else "LOW_FIT"
        )
        return MatchExplanation(
            matchedSkills=matched_skills,
            missingSkills=missing_skills,
            strongSignals=strong,
            weakSignals=weak,
            recommendation=recommendation,
        )
