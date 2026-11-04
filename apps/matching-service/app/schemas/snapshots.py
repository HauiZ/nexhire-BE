from typing import Literal
from pydantic import BaseModel, Field, field_validator


class JobMatchingSnapshot(BaseModel):
    id: str
    title: str
    description: str
    requirements: str
    skills: list[str]
    benefits: str | None = None
    workingType: str
    experienceLevel: str
    location: str
    salaryMin: int | None = None
    salaryMax: int | None = None


class CandidateSkillSnapshot(BaseModel):
    id: str | None = None
    name: str
    level: str | None = None
    yearsOfExperience: float | None = None


class CandidateExperienceSnapshot(BaseModel):
    id: str | None = None
    description: str | None = None
    title: str | None = None
    company: str | None = None
    startYear: int | None = None
    startMonth: int | None = Field(default=None, ge=1, le=12)
    endYear: int | None = None
    endMonth: int | None = Field(default=None, ge=1, le=12)
    isCurrent: bool | None = None


class CandidateEducationSnapshot(BaseModel):
    id: str | None = None
    description: str | None = None
    degree: str | None = None
    school: str | None = None
    fieldOfStudy: str | None = None


class CandidateProjectSnapshot(BaseModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    technologies: list[str] = []


class CandidateCertificationSnapshot(BaseModel):
    id: str | None = None
    name: str
    issuer: str | None = None
    description: str | None = None
    issuedYear: int | None = None


class CandidateMatchingSnapshot(BaseModel):
    snapshotSchemaVersion: Literal["candidate-matching-v1", "candidate-matching-v2"] = "candidate-matching-v1"
    dataOrigin: Literal["PROFILE", "PARSED_CV"] = "PROFILE"
    candidateId: str
    candidateUserId: str | None = None
    candidateCvId: str | None = None
    fullName: str | None = None
    headline: str | None = None
    summary: str | None = None
    location: str | None = None
    skills: list[CandidateSkillSnapshot] = []
    experiences: list[CandidateExperienceSnapshot] = []
    educations: list[CandidateEducationSnapshot] = []
    certifications: list[CandidateCertificationSnapshot] = []
    projects: list[CandidateProjectSnapshot] = []

    @field_validator("certifications", mode="before")
    @classmethod
    def normalize_certifications(cls, value):
        return [{"name": item} if isinstance(item, str) else item for item in (value or [])]

    @field_validator("projects", mode="before")
    @classmethod
    def normalize_projects(cls, value):
        if not value:
            return []
        return [
            {"name": item}
            if isinstance(item, str)
            else item
            for item in value
        ]
