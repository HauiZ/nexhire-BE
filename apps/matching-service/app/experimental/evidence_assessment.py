"""Bind explicit source review to retrieval; never infer support from a score."""

from dataclasses import asdict, dataclass
import hashlib
import json
import re
from typing import Literal

from app.experimental.shadow_capabilities import CapabilityClaim, CapabilityPlan
from app.experimental.shadow_pipeline import compose_retrieval_review
from app.experimental.shadow_requirement_matcher import ShadowMatch


@dataclass(frozen=True)
class AssessmentContext:
    job_id: str
    candidate_id: str
    model_version: str
    weights_sha256: str

    def __post_init__(self):
        if (any(not isinstance(v, str) or not v.strip()
                for v in (self.job_id, self.candidate_id, self.model_version))
                or not isinstance(self.weights_sha256, str)
                or not re.fullmatch(r"[0-9a-f]{64}", self.weights_sha256)):
            raise ValueError("Explicit job/candidate/model identity and weights hash required")


@dataclass(frozen=True)
class EvidenceReview:
    retrieval_sha256: str
    reviewer_id: str
    origin: Literal["assistant_review", "hr_review"]
    plan: CapabilityPlan
    claims: tuple[CapabilityClaim, ...]


def retrieval_binding(retrieval: ShadowMatch, context: AssessmentContext) -> str:
    # Bind order, quotes, scores, requirement text and model identity together.
    value = {"context": asdict(context), "retrieval": asdict(retrieval)}
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    allow_nan=False).encode("utf-8")).hexdigest()


def assess_evidence(retrieval: ShadowMatch, context: AssessmentContext,
                    review: EvidenceReview | None = None) -> dict:
    binding = retrieval_binding(retrieval, context)
    common = {"schema": "nexhire-evidence-assessment-shadow-v1",
        "context": asdict(context), "retrieval_sha256": binding,
        "requirement": asdict(retrieval.requirement),
        "retrieval_status": retrieval.status, "retrieved_evidence": [asdict(h) for h in retrieval.hits],
        "scope": "retrieved_evidence_only", "automatically_supported": False,
        "candidate_rejected": False, "requires_hr_review": True,
        "is_training_label": False, "independent_gold": False,
        "review_identity_authenticated": False, "semantic_accuracy_verified": False,
        "candidate_skill_absence_inferred": False, "production_changed": False}
    if review is None:
        return {**common, "assessment_status": "PENDING_REVIEW", "review_origin": None,
            "reviewer_id": None, "composition": None, "unresolved_component_groups": None,
            "next_action": "REVIEW_RETRIEVED_EVIDENCE" if retrieval.hits else "CHECK_SOURCE_CV",
            "reason_codes": ["NO_REVIEWED_RELATIONS", "COSINE_IS_NOT_SUPPORT"]}
    if review.retrieval_sha256 != binding:
        raise ValueError("Stale review: retrieval, source identity or model changed")
    if (review.origin not in {"assistant_review", "hr_review"}
            or not review.reviewer_id.strip() or review.plan.reviewed_by != review.reviewer_id):
        raise ValueError("Explicit reviewer origin/identity matching the plan required")
    result = compose_retrieval_review(retrieval, review.plan, list(review.claims))
    status = {"REVIEWED_COMPONENTS_COVERED": "REVIEWED_EVIDENCE_COVERED",
        "PARTIAL_REVIEWED_COVERAGE": "REVIEWED_EVIDENCE_PARTIAL",
        "NOT_ESTABLISHED": "NOT_ESTABLISHED_IN_RETRIEVED_EVIDENCE",
        "REVIEW_REQUIRED": "REVIEW_UNRESOLVED"}[result.composition.status]
    return {**common, "assessment_status": status, "review_origin": review.origin,
        "reviewer_id": review.reviewer_id, "composition": asdict(result.composition),
        "unresolved_component_groups": result.unresolved_component_groups,
        "next_action": "REVIEW_APPLICATION_CONTEXT" if status == "REVIEWED_EVIDENCE_COVERED"
            else "CHECK_SOURCE_CV_OR_CLARIFY",
        "reason_codes": list(result.composition.reason_codes)}
