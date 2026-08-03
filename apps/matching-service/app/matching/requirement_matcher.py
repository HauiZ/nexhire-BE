import re
from dataclasses import dataclass

from app.matching.normalizer import normalize_skill, normalize_text
from app.matching.semantic import SemanticScorer
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


SOURCE_WEIGHTS = {
    "skill": 1.0,
    "certification": 0.95,
    "experience": 0.85,
    "project": 0.8,
    "education": 0.65,
    "profile": 0.6,
}


@dataclass
class RequirementMatch:
    requirement: str
    evidence: str | None
    source: str | None
    score: float

    @property
    def matched(self) -> bool:
        return self.score >= 0.65

    @property
    def label(self) -> str:
        if not self.evidence or self.requirement == self.evidence:
            return self.requirement
        return f"{self.requirement} ~ {self.evidence} ({self.source})"


@dataclass
class RequirementScore:
    score: float
    matched: list[str]
    missing: list[str]
    matches: list[RequirementMatch]


@dataclass
class Evidence:
    text: str
    source: str


class RequirementMatcher:
    def __init__(self, semantic_scorer: SemanticScorer) -> None:
        self.semantic_scorer = semantic_scorer

    def score(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> RequirementScore:
        requirements = self._build_requirements(job)
        if not requirements:
            return RequirementScore(score=70, matched=[], missing=[], matches=[])

        evidence = self._build_evidence(candidate)
        matches = [self._best_match(requirement, evidence) for requirement in requirements]
        return RequirementScore(
            score=(sum(match.score for match in matches) / len(matches)) * 100,
            matched=[match.label for match in matches if match.matched],
            missing=[match.requirement for match in matches if not match.matched],
            matches=matches,
        )

    def _build_requirements(self, job: JobMatchingSnapshot) -> list[str]:
        requirements: list[str] = []
        for skill in job.skills:
            self._append_unique(requirements, normalize_skill(skill))

        for phrase in self._split_requirement_text(job.requirements):
            self._append_unique(requirements, normalize_skill(phrase))

        return requirements[:12]

    def _build_evidence(self, candidate: CandidateMatchingSnapshot) -> list[Evidence]:
        evidence: list[Evidence] = []
        for skill in candidate.skills:
            self._append_evidence(evidence, skill.name, "skill")
        for certification in candidate.certifications:
            self._append_evidence(evidence, certification, "certification")
        for experience in candidate.experiences:
            self._append_evidence(
                evidence,
                " ".join(part for part in [experience.title, experience.company] if part),
                "experience",
            )
        for project in candidate.projects:
            self._append_evidence(evidence, project, "project")
        for education in candidate.educations:
            self._append_evidence(
                evidence,
                " ".join(part for part in [education.degree, education.fieldOfStudy, education.school] if part),
                "education",
            )
        self._append_evidence(evidence, candidate.headline, "profile")
        self._append_evidence(evidence, candidate.summary, "profile")
        return evidence

    def _best_match(self, requirement: str, evidence_items: list[Evidence]) -> RequirementMatch:
        if not evidence_items:
            return RequirementMatch(requirement=requirement, evidence=None, source=None, score=0)

        best = RequirementMatch(requirement=requirement, evidence=None, source=None, score=0)
        for evidence in evidence_items:
            raw_score = self._compare(requirement, evidence.text)
            weighted_score = raw_score * SOURCE_WEIGHTS.get(evidence.source, 0.6)
            if weighted_score > best.score:
                best = RequirementMatch(
                    requirement=requirement,
                    evidence=evidence.text,
                    source=evidence.source,
                    score=weighted_score,
                )
        return best

    def _compare(self, requirement: str, evidence: str) -> float:
        if requirement == evidence:
            return 1
        if requirement in evidence or evidence in requirement:
            return 0.9
        semantic_score = self.semantic_scorer.score_text_pair(requirement, evidence)
        if semantic_score is None:
            semantic_score = self._token_overlap_score(requirement, evidence)
        return self._semantic_weight(semantic_score)

    def _semantic_weight(self, semantic_score: float) -> float:
        if semantic_score >= 88:
            return 0.9
        if semantic_score >= 78:
            return 0.8
        if semantic_score >= 68:
            return 0.6
        return 0

    def _split_requirement_text(self, text: str | None) -> list[str]:
        if not text:
            return []
        raw_chunks = re.split(r"\s*(?:[,;|]|\band\b|\bor\b|\n)\s*", text, flags=re.IGNORECASE)
        chunks = [normalize_text(chunk) for chunk in raw_chunks]
        return [chunk for chunk in chunks if 1 <= len(chunk.split()) <= 18]

    def _token_overlap_score(self, left: str, right: str) -> float:
        left_terms = set(left.split())
        right_terms = set(right.split())
        if not left_terms or not right_terms:
            return 0
        return (len(left_terms & right_terms) / max(len(left_terms), len(right_terms))) * 100

    def _append_unique(self, items: list[str], value: str) -> None:
        if value and value not in items:
            items.append(value)

    def _append_evidence(self, items: list[Evidence], value: str | None, source: str) -> None:
        normalized = normalize_text(value)
        if normalized:
            items.append(Evidence(text=normalized, source=source))
