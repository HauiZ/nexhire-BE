"""Versioned model-independent evidence contract; support labels are separate."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.jd_plan import JobRequirementPlan


RetrievalStatus = Literal['NO_EVIDENCE', 'SCORER_UNAVAILABLE', 'REVIEW_REQUIRED',
    'CANDIDATE_EVIDENCE', 'INSUFFICIENT_SIGNAL']


class EvidenceModel(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True, allow_inf_nan=False)


class Ai1Hit(EvidenceModel):
    evidenceId: str = Field(min_length=1)
    source: str = Field(min_length=1)
    text: str = Field(min_length=1)
    similarityScore: float = Field(ge=0, le=100)
    reasonCodes: tuple[str, ...] = ()
    scoreMeaning: Literal['COSINE_RETRIEVAL_SIMILARITY_NOT_SUPPORT_PROBABILITY'] = 'COSINE_RETRIEVAL_SIMILARITY_NOT_SUPPORT_PROBABILITY'


class Ai1Component(EvidenceModel):
    componentId: str
    text: str
    importance: str
    retrievalStatus: RetrievalStatus
    evidence: tuple[Ai1Hit, ...] = ()
    reasonCodes: tuple[str, ...] = ()
    supportStatus: None = None
    verifiedSupport: Literal[False] = False


class Ai1Requirement(EvidenceModel):
    requirementId: str
    text: str
    retrievalStatus: RetrievalStatus
    evidence: tuple[Ai1Hit, ...] = ()
    reasonCodes: tuple[str, ...] = ()
    components: tuple[Ai1Component, ...] | None = None
    allOf: tuple[tuple[str, ...], ...] | None = None
    jointContextRequired: bool | None = None
    supportStatus: None = None
    verifiedSupport: Literal[False] = False


class Ai1Assessment(EvidenceModel):
    schemaVersion: Literal['ai1-evidence-v1'] = 'ai1-evidence-v1'
    status: Literal['READY', 'DISABLED', 'UNAVAILABLE']
    backend: Literal['disabled', 'local_m1']
    reason: str
    jobId: str
    candidateId: str
    candidateCvId: str | None = None
    jobSnapshotSha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    candidateSnapshotSha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    modelVersion: str | None = None
    weightsSha256: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    manifestSha256: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    planStatus: Literal['UNPREPARED', 'DRAFT', 'HR_CONFIRMED', 'ASSISTANT_REVIEWED', 'STALE', 'UNAVAILABLE', 'INVALID']
    fixedPlan: JobRequirementPlan | None = None
    requirements: tuple[Ai1Requirement, ...] = ()
    truncatedTexts: int = Field(default=0, ge=0)
    candidateSupportVerified: Literal[False] = False
    automaticallyReject: Literal[False] = False
    isTrainingLabel: Literal[False] = False
    verifierUsed: Literal[False] = False

    @model_validator(mode='after')
    def validate_envelope(self):
        if self.status == 'READY' and (not self.modelVersion or not self.weightsSha256 or not self.manifestSha256):
            raise ValueError('Ready evidence requires explicit model provenance')
        if self.status != 'READY' and (self.requirements or self.fixedPlan):
            raise ValueError('Unavailable/disabled inference must not carry evidence or a plan')
        return self
