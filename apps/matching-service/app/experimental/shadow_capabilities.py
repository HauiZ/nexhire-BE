"""Experimental composition of reviewed claims, never cosine/keyword proof.

This checks logical composition, not semantic extraction. Relations and scope
are reviewed inputs; outputs are not independent evidence of model accuracy.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class CapabilityPlan:
    requirement_id: str
    requirement_text: str
    concepts: tuple[str, ...]
    all_of: tuple[tuple[str, ...], ...]
    joint_context_required: bool
    reviewed_by: str
    rationale: str
    interpretation_confirmed: bool

    def __post_init__(self):
        if (not self.requirement_id.strip() or not self.requirement_text.strip()
                or not self.reviewed_by.strip() or len(self.rationale.strip()) < 35
                or type(self.joint_context_required) is not bool
                or type(self.interpretation_confirmed) is not bool
                or not self.concepts or any(not c.strip() for c in self.concepts)
                or len(set(self.concepts)) != len(self.concepts) or not self.all_of):
            raise ValueError("Explicit reviewed requirement, unique concepts and composition rationale required")
        used = set()
        for group in self.all_of:
            if not group or len(group) != len(set(group)) or not set(group) <= set(self.concepts):
                raise ValueError("Each AND group needs one or more distinct declared OR alternatives")
            used.update(group)
        if used != set(self.concepts):
            raise ValueError("Every reviewed concept must belong to an explicit group")


@dataclass(frozen=True)
class CapabilityClaim:
    requirement_id: str
    concept: str
    evidence_id: str
    quote: str
    relation: str
    context_id: str | None


@dataclass(frozen=True)
class CapabilityResult:
    requirement_id: str
    status: str
    covered_groups: tuple[int, ...]
    unresolved_groups: tuple[int, ...]
    witness_evidence_ids: tuple[str, ...]
    partial_evidence_ids: tuple[str, ...]
    review_evidence_ids: tuple[str, ...]
    chosen_context: str | None
    reason_codes: tuple[str, ...]
    policy_version: str = "reviewed-capability-composition-shadow-v1"
    automatically_supported: bool = False
    candidate_rejected: bool = False
    requires_manual_review: bool = True


def check_capabilities(plan: CapabilityPlan, claims: list[CapabilityClaim], sections: dict[str, str]) -> CapabilityResult:
    relations = {"ENTAILS", "PARTIAL", "UNKNOWN", "CONTRADICTS"}
    seen = set()
    for claim in claims:
        if (claim.requirement_id != plan.requirement_id or claim.concept not in plan.concepts
                or claim.relation not in relations or claim.evidence_id not in sections
                or not claim.quote.strip() or claim.quote not in sections[claim.evidence_id]
                or (claim.context_id is not None and not claim.context_id.strip())):
            raise ValueError("Claim must bind this requirement/concept, original quote, evidence ID and reviewed relation")
        key = (claim.concept, claim.evidence_id, claim.quote, claim.relation, claim.context_id)
        if key in seen:
            raise ValueError("Duplicate reviewed claim; do not inflate evidence counts")
        seen.add(key)
    partial = tuple(sorted({c.evidence_id for c in claims if c.relation == "PARTIAL"}))
    unknown = [c for c in claims if c.relation in {"UNKNOWN", "CONTRADICTS"}]
    blocked = {c.concept for c in unknown}
    full = [c for c in claims if c.relation == "ENTAILS" and c.concept not in blocked]
    options = [[c for c in full if c.concept in group] for group in plan.all_of]
    covered = tuple(i for i, choices in enumerate(options) if choices)
    unresolved = tuple(i for i, choices in enumerate(options) if not choices)
    reasons = ["REVIEWED_RELATIONS_NOT_MODEL_PREDICTIONS", "ALL_CORE_GROUPS_REQUIRED",
               "ABSENCE_IS_NOT_REJECTION", "COMPOSITION_IS_NOT_EXTRACTION"]
    context = None
    witnesses = ()
    if len(covered) == len(plan.all_of):
        if plan.joint_context_required:
            contexts = [set(c.context_id for c in choices if c.context_id is not None) for choices in options]
            common = set.intersection(*contexts)
            if common:
                context = sorted(common)[0]
                options = [[c for c in choices if c.context_id == context] for choices in options]
            else:
                reasons.append("NO_REVIEWED_COMMON_CONTEXT")
        if not plan.joint_context_required or context is not None:
            chosen = [min(choices, key=lambda c: (c.evidence_id, c.concept, c.quote)) for choices in options]
            witnesses = tuple(sorted({c.evidence_id for c in chosen}))
    if unknown:
        reasons.append("UNKNOWN_OR_CONTRADICTORY_REVIEWED_CLAIMS")
    if not plan.interpretation_confirmed:
        status = "REVIEW_REQUIRED"
        witnesses = ()
        context = None
        reasons.append("REQUIREMENT_INTERPRETATION_UNRESOLVED")
    elif witnesses:
        status = "REVIEWED_COMPONENTS_COVERED"
    elif unknown:
        status = "REVIEW_REQUIRED"
    elif len(covered) == len(plan.all_of):
        status = "REVIEW_REQUIRED"
    elif covered or partial:
        status = "PARTIAL_REVIEWED_COVERAGE"
    else:
        status = "NOT_ESTABLISHED"
    if not witnesses:
        reasons.append("NO_COMPLETE_REVIEWED_WITNESS")
    return CapabilityResult(plan.requirement_id, status, covered, unresolved, witnesses, partial,
        tuple(sorted({c.evidence_id for c in unknown})), context, tuple(reasons))
