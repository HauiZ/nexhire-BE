import re
from dataclasses import dataclass

from app.matching.normalizer import normalize_semantic_text, normalize_skill, normalize_text
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
class Requirement:
    text: str
    source: str
    weight: float
    original_text: str = ""
    id: str = ""


@dataclass
class RequirementMatch:
    requirement: str
    requirement_source: str
    requirement_weight: float
    evidence: str | None
    source: str | None
    score: float
    requirement_id: str = ""
    original_requirement: str = ""
    evidence_id: str | None = None
    original_evidence: str | None = None
    comparison_score: float | None = None
    comparison_method: str | None = None

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
    original_text: str = ""
    id: str = ""


class RequirementMatcher:
    def __init__(self, semantic_scorer: SemanticScorer) -> None:
        self.semantic_scorer = semantic_scorer

    def score(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> RequirementScore:
        requirements = self._build_requirements(job)
        if not requirements:
            return RequirementScore(score=70, matched=[], missing=[], matches=[])

        evidence = self._build_evidence(candidate)
        matches = [self._best_match(requirement, evidence) for requirement in requirements]
        weight_total = sum(requirement.weight for requirement in requirements)
        return RequirementScore(
            score=(sum(match.score * match.requirement_weight for match in matches) / weight_total) * 100,
            matched=[match.label for match in matches if match.matched],
            missing=[match.requirement for match in matches if not match.matched],
            matches=matches,
        )

    def _build_requirements(self, job: JobMatchingSnapshot) -> list[Requirement]:
        requirements: list[Requirement] = []
        for index, skill in enumerate(job.skills):
            self._append_requirement(requirements, skill, "skill", 1.0, f"skills/{index}")

        for index, phrase in enumerate(self._split_requirement_text(job.requirements)):
            self._append_requirement(requirements, phrase, "requirements", 0.9, f"requirements/{index}")

        for index, phrase in enumerate(self._split_requirement_text(job.description)):
            self._append_requirement(requirements, phrase, "description", 0.25, f"description/{index}")

        return requirements

    def _build_evidence(self, candidate: CandidateMatchingSnapshot) -> list[Evidence]:
        evidence: list[Evidence] = []
        for index, skill in enumerate(candidate.skills):
            self._append_evidence(evidence, skill.name, "skill", skill.id or f"skills/{index}")
        for index, certification in enumerate(candidate.certifications):
            self._append_evidence(evidence, " ".join(part for part in [certification.name, certification.issuer,
                                  certification.description] if part), "certification",
                                  certification.id or f"certifications/{index}")
        for index, experience in enumerate(candidate.experiences):
            self._append_evidence(
                evidence,
                " ".join(part for part in [experience.title, experience.company, experience.description] if part),
                "experience",
                experience.id or f"experiences/{index}",
            )
        for index, project in enumerate(candidate.projects):
            self._append_evidence(
                evidence,
                " ".join(
                    part
                    for part in [
                        project.name,
                        project.description,
                        " ".join(project.technologies),
                    ]
                    if part
                ),
                "project",
                project.id or f"projects/{index}",
            )
            for technology_index, technology in enumerate(project.technologies):
                self._append_evidence(evidence, technology, "project",
                                      f"{project.id or f'projects/{index}'}/technologies/{technology_index}")
        for index, education in enumerate(candidate.educations):
            self._append_evidence(
                evidence,
                " ".join(part for part in [education.degree, education.fieldOfStudy, education.school,
                                          education.description] if part),
                "education",
                education.id or f"educations/{index}",
            )
        self._append_evidence(evidence, candidate.headline, "profile", "profile/headline")
        self._append_evidence(evidence, candidate.summary, "profile", "profile/summary")
        return evidence

    def _best_match(self, requirement: Requirement, evidence_items: list[Evidence]) -> RequirementMatch:
        if not evidence_items:
            return RequirementMatch(
                requirement=requirement.text,
                requirement_source=requirement.source,
                requirement_weight=requirement.weight,
                evidence=None,
                source=None,
                score=0,
                requirement_id=requirement.id,
                original_requirement=requirement.original_text,
            )

        best = RequirementMatch(
            requirement=requirement.text,
            requirement_source=requirement.source,
            requirement_weight=requirement.weight,
            evidence=None,
            source=None,
            score=0,
            requirement_id=requirement.id,
            original_requirement=requirement.original_text,
        )
        for evidence in evidence_items:
            raw_score, comparison_score, method = self._compare_details(requirement, evidence)
            weighted_score = raw_score * SOURCE_WEIGHTS.get(evidence.source, 0.6)
            if weighted_score > best.score:
                best = RequirementMatch(
                    requirement=requirement.text,
                    requirement_source=requirement.source,
                    requirement_weight=requirement.weight,
                    evidence=evidence.text,
                    source=evidence.source,
                    score=weighted_score,
                    requirement_id=requirement.id,
                    original_requirement=requirement.original_text,
                    evidence_id=evidence.id,
                    original_evidence=evidence.original_text,
                    comparison_score=comparison_score,
                    comparison_method=method,
                )
        return best

    def _compare_details(self, requirement: Requirement, evidence: Evidence) -> tuple[float, float, str]:
        if requirement.text == evidence.text:
            return 1, 100, "EXACT"
        if requirement.text in evidence.text or evidence.text in requirement.text:
            return 0.9, 90, "CONTAINMENT"
        signal = self.semantic_scorer.score_text_pair(
            normalize_semantic_text(requirement.original_text or requirement.text),
            normalize_semantic_text(evidence.original_text or evidence.text),
        )
        method = "SEMANTIC"
        if signal is None:
            signal = self._token_overlap_score(requirement.text, evidence.text)
            method = "LEXICAL"
        elif self.semantic_scorer.model_version == "lexical-fallback":
            method = "LEXICAL"
        return self._semantic_weight(signal), signal, method

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
        clean_text = re.sub(r"<[^>]*>", " ", text)
        raw_chunks = re.split(r"[,;|\u2022\n]|[.!?](?:\s+|$)", clean_text)
        return [chunk.strip() for chunk in raw_chunks if chunk.strip()]

    def _token_overlap_score(self, left: str, right: str) -> float:
        left_terms = set(left.split())
        right_terms = set(right.split())
        if not left_terms or not right_terms:
            return 0
        return (len(left_terms & right_terms) / max(len(left_terms), len(right_terms))) * 100

    def _append_requirement(
        self,
        items: list[Requirement],
        value: str,
        source: str,
        weight: float,
        source_id: str = "",
    ) -> None:
        original_text = value.strip()
        value = normalize_skill(value) or normalize_semantic_text(value)
        if not value:
            return
        existing = next((item for item in items if item.text == value), None)
        if existing:
            existing.weight = max(existing.weight, weight)
            return
        items.append(Requirement(text=value, source=source, weight=weight, original_text=original_text, id=source_id))

    def _append_evidence(self, items: list[Evidence], value: str | None, source: str, source_id: str = "") -> None:
        normalized = normalize_skill(value or "") or normalize_semantic_text(value)
        if normalized:
            items.append(Evidence(text=normalized, source=source, original_text=(value or "").strip(), id=source_id))
