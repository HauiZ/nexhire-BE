"""Explain reviewed partial support without inventing candidate ranking scores.

JD priorities are supplied explicitly before reviewing CV evidence. This module
checks composition and provenance, not the truth of semantic interpretations.
"""

from dataclasses import dataclass

from app.experimental.evidence_assessment import (
    AssessmentContext, EvidenceReview, assess_evidence,
)
from app.experimental.shadow_capabilities import CapabilityPlan
from app.experimental.shadow_requirement_matcher import ShadowMatch


@dataclass(frozen=True)
class RequirementPriorities:
    plan: CapabilityPlan
    group_priorities: tuple[str, ...]
    jd_rationale: str
    origin: str
    prepared_before_cv_review: bool

    def __post_init__(self):
        if (len(self.group_priorities) != len(self.plan.all_of)
                or any(p not in {"core", "supplementary", "preferred", "unknown"}
                       for p in self.group_priorities)
                or self.origin not in {"assistant_jd_review", "hr_jd_review"}
                or not isinstance(self.jd_rationale, str)
                or len(self.jd_rationale.strip()) < 35
                or self.prepared_before_cv_review is not True):
            raise ValueError("Explicit JD-only priorities for every AND/OR group required")


def assess_hr_consideration(retrieval: ShadowMatch, context: AssessmentContext,
                            priorities: RequirementPriorities,
                            review: EvidenceReview | None = None) -> dict:
    plan = priorities.plan
    if (plan.requirement_id != retrieval.requirement.id
            or plan.requirement_text != retrieval.requirement.text
            or (review is not None and review.plan != plan)):
        raise ValueError("Priorities and evidence review must bind the same exact plan")
    assessment = assess_evidence(retrieval, context, review)
    status = assessment["assessment_status"]
    composition = assessment["composition"]
    # Pending/ambiguous interpretations cannot masquerade as missing skills.
    resolved = status in {"REVIEWED_EVIDENCE_COVERED", "REVIEWED_EVIDENCE_PARTIAL",
                          "NOT_ESTABLISHED_IN_RETRIEVED_EVIDENCE"}
    covered = set(composition["covered_groups"]) if resolved else set()
    groups = [{"group_index": i, "alternatives": list(alternatives),
               "importance": priorities.group_priorities[i],
               "support": ("reviewed_covered" if i in covered else "not_established")
                   if resolved else "unresolved"}
              for i, alternatives in enumerate(plan.all_of)]
    attention = []
    for importance, code in (("core", "CORE_SUPPORT_TO_CLARIFY"),
                             ("supplementary", "SUPPLEMENTARY_SUPPORT_TO_CLARIFY"),
                             ("preferred", "PREFERRED_SUPPORT_TO_CLARIFY")):
        if any(g["importance"] == importance and g["support"] != "reviewed_covered"
               for g in groups):
            attention.append(code)
    if any(g["importance"] == "unknown" for g in groups):
        attention.append("JD_IMPORTANCE_TO_CLARIFY")
    if not resolved:
        attention.append("EVIDENCE_REVIEW_TO_COMPLETE")
    if status == "REVIEWED_EVIDENCE_COVERED":
        disposition = "REVIEWED_REQUIREMENT_SUPPORTED"
    elif status == "REVIEWED_EVIDENCE_PARTIAL":
        disposition = "PARTIAL_SUPPORT_WORTH_HR_CONSIDERATION"
    elif status == "NOT_ESTABLISHED_IN_RETRIEVED_EVIDENCE":
        disposition = "CHECK_SOURCE_CV_OR_CLARIFY"
    else:
        disposition = "PENDING_REVIEW"
    return {"schema": "nexhire-hr-consideration-shadow-v1", "assessment": assessment,
            "disposition": disposition, "component_groups": groups,
            "jd_priority_origin": priorities.origin, "jd_rationale": priorities.jd_rationale,
            "jd_only_provenance_independently_verified": False,
            "attention_codes": attention,
            "ranking_score": None, "ranking_position": None,
            "ranking_action": "DEFER_TO_VALIDATED_RANKER_AND_HR",
            "full_candidate_fit_established": False,
            "eligibility_assessed": False, "candidate_rejected": False,
            "candidate_skill_absence_inferred": False,
            "production_changed": False, "is_training_label": False}
