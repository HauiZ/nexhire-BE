from pydantic import BaseModel, Field
from typing import Any


class MatchExplanation(BaseModel):
    matchedSkills: list[str] = []
    missingSkills: list[str] = []
    strongSignals: list[str] = []
    weakSignals: list[str] = []
    recommendation: str


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
