"""HR-facing projection: evidence proposals, never baseline hiring recommendations."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ReviewModel(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)


class ReviewEvidence(ReviewModel):
    evidenceId: str
    source: str
    text: str
    similarityScore: float = Field(ge=0, le=100)
    reasonCodes: tuple[str, ...] = ()
    scoreMeaning: Literal['COSINE_RETRIEVAL_SIMILARITY_NOT_SUPPORT_PROBABILITY'] = 'COSINE_RETRIEVAL_SIMILARITY_NOT_SUPPORT_PROBABILITY'


class ReviewComponent(ReviewModel):
    componentId: str
    text: str
    importance: str
    modelSuggestion: Literal['matched', 'partial', 'not_established_in_provided_evidence'] | None
    retrievalStatus: str | None = None
    reasonCodes: tuple[str, ...] = ()
    verifiedSupport: Literal[False] = False
    evidence: tuple[ReviewEvidence, ...]


class ReviewRequirement(ReviewModel):
    requirementId: str
    text: str
    modelSuggestion: Literal['matched', 'partial', 'not_established_in_provided_evidence'] | None
    retrievalStatus: str | None = None
    reasonCodes: tuple[str, ...] = ()
    jointContextRequired: bool | None = None
    verifiedSupport: Literal[False] = False
    evidence: tuple[ReviewEvidence, ...]
    componentAnalysis: Literal['NOT_PERFORMED', 'FIXED_PLAN_UNVERIFIED_PROPOSALS', 'FIXED_PLAN_RETRIEVAL']
    allOf: tuple[tuple[str, ...], ...] | None = None
    components: tuple[ReviewComponent, ...] | None = None


class BaselineDiagnostics(ReviewModel):
    meaning: Literal['LEGACY_SCORING_NOT_HR_CONFIRMATION_OR_REQUIREMENT_SUPPORT_PERCENT'] = 'LEGACY_SCORING_NOT_HR_CONFIRMATION_OR_REQUIREMENT_SUPPORT_PERCENT'
    totalScore: float
    matchLevel: str
    decision: str | None
    recommendation: str | None
    modelVersion: str | None


class HrReviewSnapshot(ReviewModel):
    schemaVersion: Literal['hr-review-v1'] = 'hr-review-v1'
    resultId: str
    applicationId: str | None
    jobId: str
    candidateId: str
    candidateCvId: str | None = None
    executionStatus: str
    assessmentStatus: Literal['PENDING_REVIEW', 'NOT_PERFORMED', 'UNAVAILABLE']
    reason: str
    scope: Literal['RETRIEVED_EVIDENCE_ONLY'] = 'RETRIEVED_EVIDENCE_ONLY'
    decisionAuthority: Literal['HR'] = 'HR'
    candidateSupportVerified: Literal[False] = False
    automaticallyReject: Literal[False] = False
    isTrainingLabel: Literal[False] = False
    overallFitScore: None = None
    hiringDecision: None = None
    rankingPosition: None = None
    planStatus: str | None = None
    planContentSha256: str | None = None
    planStateScope: Literal['AT_MATCHING_TIME'] = 'AT_MATCHING_TIME'
    currentPlanRevalidated: Literal[False] = False
    jobSnapshotSha256: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    candidateSnapshotSha256: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    syntheticTestOnly: bool | None = None
    retrievalModelVersion: str | None = None
    verifierModelVersion: str | None = None
    assessmentSource: Literal['M1_RETRIEVAL', 'VERIFIER_DIAGNOSTIC'] | None = None
    retrievalWarnings: tuple[str, ...] = ()
    requirements: tuple[ReviewRequirement, ...] = ()
    baselineDiagnostics: None = None
