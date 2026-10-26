"""Compose explicit reviewed claims within a shadow retrieval window only.

No semantic extraction, model inference, provider call or runtime registration.
The caller must supply reviewed requirement components and cited relations.
"""

from dataclasses import dataclass, replace

from app.experimental.shadow_capabilities import CapabilityClaim, CapabilityPlan, CapabilityResult, check_capabilities
from app.experimental.shadow_requirement_matcher import ShadowMatch


@dataclass(frozen=True)
class ShadowCoverage:
    retrieval: ShadowMatch
    composition: CapabilityResult
    unresolved_component_groups: tuple[tuple[str, ...], ...]
    scope: str = "retrieved_evidence_only"
    explanation_origin: str = "reviewed_claim_composition_not_encoder_reasoning"
    automatically_supported: bool = False
    candidate_rejected: bool = False
    requires_manual_review: bool = True
    is_training_label: bool = False
    policy_version: str = "reviewed-retrieval-coverage-shadow-v1"


def compose_retrieval_review(retrieval: ShadowMatch, plan: CapabilityPlan,
                             claims: list[CapabilityClaim]) -> ShadowCoverage:
    if (plan.requirement_id != retrieval.requirement.id
            or plan.requirement_text != retrieval.requirement.text):
        raise ValueError("Review must bind the exact retrieved requirement ID and text")
    ids = tuple(h.id for h in retrieval.hits)
    if (len(set(ids)) != len(ids) or len(set(retrieval.ranked_evidence_ids)) != len(retrieval.ranked_evidence_ids)
            or ids != retrieval.ranked_evidence_ids[:len(ids)]):
        raise ValueError("Unique hits must preserve the actual retrieval window order")
    # A complete-CV/oracle annotation cannot silently rescue a retrieval miss.
    if any(c.evidence_id not in ids for c in claims):
        raise ValueError("Reviewed claims outside the retrieved window are prohibited")
    sections = {hit.id: hit.text for hit in retrieval.hits}
    result = check_capabilities(plan, claims, sections)
    if retrieval.status in {"REVIEW_REQUIRED", "SCORER_UNAVAILABLE", "NO_EVIDENCE"}:
        result = replace(result, status="REVIEW_REQUIRED", witness_evidence_ids=(), chosen_context=None,
            reason_codes=result.reason_codes + ("RETRIEVAL_REVIEW_REQUIRED",))
    unresolved = tuple(plan.all_of[i] for i in result.unresolved_groups)
    return ShadowCoverage(retrieval, result, unresolved)
