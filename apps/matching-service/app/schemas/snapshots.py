from pydantic import BaseModel


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
    name: str
    level: str | None = None
    yearsOfExperience: float | None = None


class CandidateExperienceSnapshot(BaseModel):
    title: str | None = None
    company: str | None = None
    startYear: int | None = None
    startMonth: int | None = None
    endYear: int | None = None
    endMonth: int | None = None
    isCurrent: bool | None = None


class CandidateEducationSnapshot(BaseModel):
    degree: str | None = None
    school: str | None = None
    fieldOfStudy: str | None = None


class CandidateMatchingSnapshot(BaseModel):
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
    certifications: list[str] = []
    projects: list[str] = []
