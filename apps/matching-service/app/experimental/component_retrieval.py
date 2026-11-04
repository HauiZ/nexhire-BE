"""Retrieve source-bound requirement fragments; never infer their entailment."""

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class RequirementFragment:
    id: str
    start: int
    end: int


def fragment_texts(requirement, fragments):
    if (not isinstance(requirement, str) or not requirement.strip()
            or not 2 <= len(fragments) <= 8
            or len({f.id for f in fragments}) != len(fragments)):
        raise ValueError("Original requirement and two to eight unique fragments required")
    texts = {}
    spans = set()
    for f in fragments:
        if (not isinstance(f.id, str) or not f.id.strip() or type(f.start) is not int
                or type(f.end) is not int or not 0 <= f.start < f.end <= len(requirement)
                or not requirement[f.start:f.end].strip() or (f.start, f.end) in spans):
            raise ValueError("Each fragment must identify a distinct nonempty exact source span")
        if any(f.start < end and start < f.end for start, end in spans):
            raise ValueError("Overlapping fragments can duplicate support and require review")
        spans.add((f.start, f.end))
        texts[f.id] = requirement[f.start:f.end]
    return texts


def retrieve_fragments(requirement, fragments, evidence, score_pair, *, budget=6):
    texts = fragment_texts(requirement, fragments)
    if type(budget) is not int or not len(fragments) <= budget <= 24:
        raise ValueError("Budget must permit one passage per fragment and be at most 24")
    if (len({s["evidence_id"] for s in evidence}) != len(evidence)
            or any(not s["evidence_id"].strip() or not s["text"].strip() for s in evidence)):
        raise ValueError("Unique nonempty source evidence IDs and text required")
    rankings = {}
    for fragment_id, text in texts.items():
        scored = []
        for section in evidence:
            score = score_pair(text, section["text"])
            if (isinstance(score, bool) or not isinstance(score, (float, int))
                    or not math.isfinite(score) or not -1.000001 <= score <= 1.000001):
                raise ValueError("Real finite cosine scores required, without lexical fallback")
            scored.append({"evidence_id": section["evidence_id"], "text": section["text"],
                "cosine": max(-1., min(1., score))})
        rankings[fragment_id] = sorted(scored, key=lambda s: (-s["cosine"], s["evidence_id"]))
    # Round-robin reserves retrieval attention for every fragment; no labels enter.
    selected = []
    for rank in range(len(evidence)):
        for fragment_id in texts:
            identifier = rankings[fragment_id][rank]["evidence_id"]
            if identifier not in selected and len(selected) < budget:
                selected.append(identifier)
    return {"schema": "nexhire-component-retrieval-experimental-v1",
        "requirement": requirement, "fragment_texts": texts,
        "fragment_rankings": rankings, "selected_evidence_ids": selected,
        "budget": budget, "decomposition_origin": "explicit_source_spans_not_automatic_parser",
        "fragment_relevance_is_not_entailment": True, "assessment_status": "PENDING_REVIEW",
        "candidate_rejected": False, "production_changed": False,
        "reason_codes": ["SOURCE_BOUND_FRAGMENTS", "JOINT_CONTEXT_AND_MODALITY_REQUIRE_REVIEW",
            "RETRIEVAL_IS_NOT_COMPONENT_COVERAGE", "ABSENCE_IS_NOT_SKILL_ABSENCE"]}
