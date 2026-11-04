from pydantic import BaseModel, Field
from datetime import date
from typing import Any, Literal
from app.matching.ranking import RankingFeatures
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from app.schemas.ai1 import Ai1Assessment


class MatchingInputSnapshots(BaseModel):
    job: JobMatchingSnapshot
    candidate: CandidateMatchingSnapshot


class RequirementEvidence(BaseModel):
    requirementId: str
    requirement: str
    requirementSource: str
    evidence: str | None = None
    evidenceSource: str | None = None
    evidenceId: str | None = None
    comparisonScore: float | None = Field(default=None, ge=0, le=100)
    comparisonMethod: Literal["EXACT", "CONTAINMENT", "SEMANTIC", "LEXICAL"] | None = None
    score: float = Field(ge=0, le=100)
    status: Literal["MATCHED", "PARTIAL", "NOT_FOUND"]


class MatchExplanation(BaseModel):
    ai1Assessment: Ai1Assessment | None = None
    localHrFixtureAssessment: dict[str, Any] | None = None
    inputSnapshots: MatchingInputSnapshots | None = None
    requirementMatches: list[RequirementEvidence] = Field(default_factory=list)
    rankingFeatures: RankingFeatures | None = None
    featureSchemaVersion: str | None = None
    semanticModelVersion: str | None = None
    rankingModelVersion: str | None = None
    preprocessingVersion: str | None = None
    featureExtractorVersion: str | None = None
    scoreReferenceDate: date | None = None
    dataOrigin: Literal["PROFILE", "PARSED_CV"] | None = None
    candidateSnapshotHash: str | None = None
    jobSnapshotHash: str | None = None
    featureLimitations: list[str] = Field(default_factory=list)
    matchedSkills: list[str] = []
    missingSkills: list[str] = []
    strongSignals: list[str] = []
    weakSignals: list[str] = []
    recommendation: str
    decision: str = "REVIEW_MANUALLY"
    priority: str = "NORMAL"
    summary: str | None = None
    nextActions: list[str] = []
    riskFlags: list[str] = []


class MatchScores(BaseModel):
    totalScore: float = Field(ge=0, le=100)
    skillScore: float = Field(ge=0, le=100)
    experienceScore: float = Field(ge=0, le=100)
    educationScore: float = Field(ge=0, le=100)
    certificationScore: float = Field(ge=0, le=100)
    projectScore: float = Field(ge=0, le=100)
    preferenceScore: float = Field(ge=0, le=100)
    semanticScore: float = Field(ge=0, le=100)
    explanation: MatchExplanation


class CreateMatchRequestDto(BaseModel):
    applicationId: str
    jobId: str
    candidateId: str
    candidateUserId: str | None = None
    candidateCvId: str | None = None
    cvDocumentId: str | None = None
    requestedByUserId: str | None = None
    requestType: str | None = None
    parsedResume: dict[str, Any] | None = None
