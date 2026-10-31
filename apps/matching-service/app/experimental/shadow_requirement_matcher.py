"""Opt-in experimental retrieval, never verified entailment or hiring fit."""

from dataclasses import dataclass
from html.parser import HTMLParser
import math
import re
from typing import Protocol

from app.matching.normalizer import normalize_semantic_text
from app.matching.requirement_matcher import Evidence, RequirementMatcher
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot

SHADOW_POLICY_VERSION = "requirement-retrieval-shadow-v1"


class PairScorer(Protocol):
    @property
    def model_version(self) -> str: ...

    def score_text_pair(self, left: str, right: str) -> float | None: ...


@dataclass(frozen=True)
class ShadowPolicy:
    semantic_model_version: str
    model_weights_sha256: str
    pair_reference_threshold: float
    threshold_fit_split: str = "train"
    top_k: int = 3

    def __post_init__(self):
        threshold = self.pair_reference_threshold
        if (not self.semantic_model_version or not re.fullmatch(r"[0-9a-f]{64}", self.model_weights_sha256)
                or isinstance(threshold, bool) or not isinstance(threshold, (int, float))
                or not math.isfinite(threshold) or not 0 <= threshold <= 100
                or self.threshold_fit_split != "train" or type(self.top_k) is not int or self.top_k < 1):
            raise ValueError("Explicit verified model, train-only pair reference and positive top-k required")


@dataclass(frozen=True)
class AtomicRequirement:
    id: str
    text: str
    source: str = "requirements"


@dataclass(frozen=True)
class EvidenceHit:
    id: str
    text: str
    source: str
    comparison_score: float
    above_pair_reference: bool
    reason_codes: tuple[str, ...] = ()


@dataclass(frozen=True)
class ShadowMatch:
    requirement: AtomicRequirement
    status: str
    hits: tuple[EvidenceHit, ...]
    ranked_evidence_ids: tuple[str, ...]
    reason_codes: tuple[str, ...]
    policy_version: str = SHADOW_POLICY_VERSION
    automatically_supported: bool = False
    candidate_rejected: bool = False
    requires_manual_review: bool = True


class _RequirementBlocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden_depth += 1
        if tag in {"br", "li", "p", "div", "ul", "ol"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden_depth = max(0, self.hidden_depth - 1)
        if tag in {"li", "p", "div", "ul", "ol"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden_depth:
            self.parts.append(data)


def requirement_blocks(text: str) -> list[str]:
    from app.schemas.jd_plan import source_blocks
    return source_blocks(text)


def explicit_negation_cue(requirement: str, passage: str) -> bool:
    """Narrow warning for explicit short-skill negation, not an entailment parser."""
    requirement, passage = normalize_semantic_text(requirement), normalize_semantic_text(passage)
    if len(requirement) > 60 or not 1 <= len(requirement.split()) <= 3:
        return False
    prefix = (r"(?:\bno (?:prior |professional )?experience (?:with|in)|"
              r"\bnot (?:proficient|experienced) (?:with|in)|"
              r"kh\u00f4ng c\u00f3 kinh nghi\u1ec7m (?:v\u1edbi|v\u1ec1)|"
              r"ch\u01b0a t\u1eebng d\u00f9ng)\s+")
    return bool(re.search(prefix + re.escape(requirement) + r"(?![\w+#])", passage))


class ShadowRequirementMatcher:
    def __init__(self, scorer: PairScorer, policy: ShadowPolicy):
        if scorer.model_version != policy.semantic_model_version or scorer.model_version in {
            "lexical-fallback", "semantic-disabled"
        }:
            raise ValueError("Shadow semantic model must match the explicit policy")
        self.scorer = scorer
        self.policy = policy

    def build_requirements(self, job: JobMatchingSnapshot) -> list[AtomicRequirement]:
        result = [AtomicRequirement(f"skills/{i}", text.strip(), "skill")
                  for i, text in enumerate(job.skills) if text.strip()]
        result.extend(AtomicRequirement(f"requirements/{i}", text) for i, text in
                      enumerate(requirement_blocks(job.requirements)))
        # A fallback is unreviewed prose, never an inferred set of professional criteria.
        if not result:
            result = [AtomicRequirement(f"description/{i}", text, "unreviewed_description")
                      for i, text in enumerate(requirement_blocks(job.description))]
        return result

    def build_evidence(self, candidate: CandidateMatchingSnapshot) -> list[Evidence]:
        return RequirementMatcher(self.scorer)._build_evidence(candidate)

    def match(self, requirement: AtomicRequirement, evidence: list[Evidence]) -> ShadowMatch:
        if not requirement.id or not normalize_semantic_text(requirement.text):
            raise ValueError("A stable requirement ID and original text are required")
        ids = [e.id for e in evidence]
        if any(not identifier for identifier in ids) or len(ids) != len(set(ids)):
            raise ValueError("Evidence IDs must be unique and nonempty")
        reasons = ["RETRIEVAL_IS_NOT_ENTAILMENT", "PAIR_THRESHOLD_NOT_RETRIEVAL_CALIBRATED"]
        if requirement.source == "unreviewed_description":
            reasons.append("UNREVIEWED_DESCRIPTION_FALLBACK")
        if not evidence:
            return ShadowMatch(requirement, "NO_EVIDENCE", (), (), tuple(reasons))
        hits = []
        missing = False
        for item in evidence:
            text = item.original_text or item.text
            if not normalize_semantic_text(text):
                missing = True
                continue
            # No exact/substring shortcut, source multiplier, score bin or text aliasing.
            signal = self.scorer.score_text_pair(requirement.text, text)
            if self.scorer.model_version != self.policy.semantic_model_version:
                raise ValueError("Semantic backend changed or silently fell back during shadow scoring")
            if signal is None:
                missing = True
                continue
            if isinstance(signal, bool) or not isinstance(signal, (int, float)) or not math.isfinite(signal) or not 0 <= signal <= 100:
                raise ValueError("Semantic scorer must provide a finite 0..100 cosine-derived score")
            codes = ("EXPLICIT_NEGATION_CUE",) if explicit_negation_cue(requirement.text, text) else ()
            hits.append(EvidenceHit(item.id, text, item.source, float(signal),
                                    round(signal, 2) >= self.policy.pair_reference_threshold, codes))
        if missing:
            reasons.append("INCOMPLETE_SEMANTIC_SCORING")
        hits.sort(key=lambda hit: (-hit.comparison_score, hit.id))
        if not hits:
            status = "SCORER_UNAVAILABLE"
        elif missing or hits[0].reason_codes or requirement.source == "unreviewed_description":
            status = "REVIEW_REQUIRED"
        else:
            status = "CANDIDATE_EVIDENCE" if hits[0].above_pair_reference else "INSUFFICIENT_SIGNAL"
        return ShadowMatch(requirement, status, tuple(hits[:self.policy.top_k]),
                           tuple(hit.id for hit in hits), tuple(reasons))

    def score(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> list[ShadowMatch]:
        evidence = self.build_evidence(candidate)
        return [self.match(requirement, evidence) for requirement in self.build_requirements(job)]
