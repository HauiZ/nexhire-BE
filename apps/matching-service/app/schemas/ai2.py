"""Versioned canonical input, feature vector, and provenance schemas for AI2 ranking."""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.matching.normalizer import PREPROCESSING_VERSION
from app.schemas.ai1 import Ai1Assessment
from app.schemas.jd_plan import digest, snapshot_digest
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


AI2_FEATURE_SCHEMA_VERSION = "ai2-features-v1"
AI2_FEATURE_EXTRACTOR_VERSION = "ai2-extractor-v1"
AI2_PREPROCESSING_VERSION = PREPROCESSING_VERSION

AI2_FORBIDDEN_FEATURE_NAMES = frozenset({
    "job_id",
    "candidate_id",
    "candidate_user_id",
    "candidate_cv_id",
    "application_id",
    "candidate_index",
    "candidate_order",
    "scenario_tag",
    "cv_word_count",
    "cv_char_count",
    "cv_length",
    "school_prestige",
    "university_rank",
    "age",
    "gender",
    "accent",
    "voice_norm",
    "relevance",
    "label",
    "annotator_rationale",
})


class Ai2Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class Ai2RequirementSpec(Ai2Model):
    requirementId: str = Field(min_length=1)
    text: str = Field(min_length=1)
    importance: Literal["required", "preferred", "unknown"] = "unknown"
    source: Literal["skills", "requirements", "description", "plan", "source_record"]


class Ai2CanonicalInput(Ai2Model):
    job: JobMatchingSnapshot
    candidate: CandidateMatchingSnapshot
    jobSnapshotSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    candidateSnapshotSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    scoreReferenceDate: date
    requirements: tuple[Ai2RequirementSpec, ...] = ()
    ai1Assessment: Ai1Assessment | None = None

    @model_validator(mode="after")
    def validate_bindings(self):
        if snapshot_digest(self.job) != self.jobSnapshotSha256:
            raise ValueError("Job snapshot digest mismatch in Ai2CanonicalInput")
        if digest(self.candidate.model_dump(mode="json")) != self.candidateSnapshotSha256:
            raise ValueError("Candidate snapshot digest mismatch in Ai2CanonicalInput")
        if self.ai1Assessment is not None:
            if (
                self.ai1Assessment.jobId != self.job.id
                or self.ai1Assessment.candidateId != self.candidate.candidateId
                or self.ai1Assessment.jobSnapshotSha256 != self.jobSnapshotSha256
                or self.ai1Assessment.candidateSnapshotSha256 != self.candidateSnapshotSha256
            ):
                raise ValueError("AI1 assessment snapshot or identity binding mismatch")
        return self


class Ai2FeatureProvenance(Ai2Model):
    name: str
    group: Literal[
        "ai1_semantic",
        "skills",
        "experience",
        "projects",
        "education",
        "certifications",
        "work_conditions",
        "data_quality",
    ]
    dtype: Literal["float", "int", "bool"]
    nullable: bool
    minValue: float | None = None
    maxValue: float | None = None
    missingnessSemantics: str
    sourceInputs: tuple[str, ...]


class Ai2FeatureVector(Ai2Model):
    # Group 1: Frozen AI1 semantic evidence signals (explicit missingness; never error-as-zero)
    ai1_available: bool
    ai1_missing_indicator: float = Field(ge=0.0, le=1.0)
    ai1_status_code: int = Field(ge=0, le=3)
    ai1_mean_top1_similarity: float | None = Field(default=None, ge=0.0, le=100.0)
    ai1_min_top1_similarity: float | None = Field(default=None, ge=0.0, le=100.0)
    ai1_required_mean_top1_similarity: float | None = Field(default=None, ge=0.0, le=100.0)
    ai1_required_min_top1_similarity: float | None = Field(default=None, ge=0.0, le=100.0)
    ai1_preferred_mean_top1_similarity: float | None = Field(default=None, ge=0.0, le=100.0)
    ai1_coverage_ratio_above_ref: float | None = Field(default=None, ge=0.0, le=1.0)
    ai1_required_coverage_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    ai1_review_required_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    ai1_negation_cue_count: int | None = Field(default=None, ge=0)
    ai1_exact_keyword_match_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    ai1_truncated_texts_count: int | None = Field(default=None, ge=0)

    # Group 2: Deterministic skills and requirement-term overlap
    jd_skill_count: int = Field(ge=0)
    declared_skill_coverage_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    role_verified_skill_coverage_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    required_term_coverage_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    preferred_term_coverage_ratio: float | None = Field(default=None, ge=0.0, le=1.0)

    # Group 3: Task-linked relevant tenure with interval union & unknown-date accounting
    jd_min_years_required: float | None = Field(default=None, ge=0.0)
    total_verified_experience_months: int = Field(ge=0)
    relevant_experience_months: int = Field(ge=0)
    relevant_to_required_years_ratio: float | None = Field(default=None, ge=0.0)
    relevant_years_gap: float | None = None
    relevant_role_title_match_count: int = Field(ge=0)
    unknown_date_experience_count: int = Field(ge=0)
    unknown_current_status_count: int = Field(ge=0)
    has_relevant_experience_with_unknown_dates: bool

    # Group 4: Project evidence
    has_projects: bool
    relevant_project_count: int = Field(ge=0)
    project_skill_coverage_ratio: float | None = Field(default=None, ge=0.0, le=1.0)

    # Group 5: Explicit JD-scoped education checks (strictly zero school prestige)
    jd_education_required_level: int | None = Field(default=None, ge=0, le=5)
    jd_education_importance_code: int = Field(ge=0, le=2)
    candidate_max_education_level: int | None = Field(default=None, ge=0, le=5)
    meets_jd_education_level: bool | None = None
    education_field_match: bool | None = None

    # Group 6: Certifications
    jd_certification_requirement_present: bool
    jd_certification_matched_count: int = Field(ge=0)
    candidate_certification_count: int = Field(ge=0)

    # Group 7: Work conditions (location & working type)
    jd_is_remote: bool
    location_match: bool | None = None
    location_missing_indicator: float = Field(ge=0.0, le=1.0)

    # Group 8: Structural missingness & data quality flags
    missing_experiences_section: bool
    missing_skills_section: bool
    missing_education_section: bool
    has_any_unknown_dates: bool

    @model_validator(mode="after")
    def validate_ai1_missingness_consistency(self):
        if self.ai1_available:
            if self.ai1_status_code != 3 or self.ai1_missing_indicator != 0.0:
                raise ValueError("Available AI1 must carry status_code=3 and missing_indicator=0.0")
        else:
            if self.ai1_status_code == 3 or self.ai1_missing_indicator != 1.0:
                raise ValueError("Unavailable AI1 must carry status_code!=3 and missing_indicator=1.0")
            ai1_numeric_fields = (
                self.ai1_mean_top1_similarity,
                self.ai1_min_top1_similarity,
                self.ai1_required_mean_top1_similarity,
                self.ai1_required_min_top1_similarity,
                self.ai1_preferred_mean_top1_similarity,
                self.ai1_coverage_ratio_above_ref,
                self.ai1_required_coverage_ratio,
                self.ai1_review_required_ratio,
                self.ai1_negation_cue_count,
                self.ai1_exact_keyword_match_ratio,
                self.ai1_truncated_texts_count,
            )
            if any(v is not None for v in ai1_numeric_fields):
                raise ValueError("Unavailable/disabled AI1 must keep numeric similarity signals as None")
        return self

    def to_matrix_row(self, *, missing_value: Any = None) -> list[Any]:
        row: list[Any] = []
        for name in AI2_FEATURE_NAMES:
            val = getattr(self, name)
            if val is None:
                row.append(missing_value)
            elif isinstance(val, bool):
                row.append(1.0 if val else 0.0)
            else:
                row.append(float(val))
        return row


AI2_FEATURE_NAMES: tuple[str, ...] = tuple(Ai2FeatureVector.model_fields.keys())


class Ai2ExtractionDiagnostics(Ai2Model):
    """Non-feature audit trail explaining extracted terms, intervals, and missingness."""

    jdTargetSkills: tuple[str, ...] = ()
    matchedDeclaredSkills: tuple[str, ...] = ()
    matchedRoleVerifiedSkills: tuple[str, ...] = ()
    matchedProjectSkills: tuple[str, ...] = ()
    relevantExperienceIds: tuple[str, ...] = ()
    unknownDateExperienceIds: tuple[str, ...] = ()
    relevantProjectIds: tuple[str, ...] = ()
    jdEducationKeywords: tuple[str, ...] = ()
    jdCertificationKeywords: tuple[str, ...] = ()
    matchedCertifications: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()


class Ai2FeatureExtractionResult(Ai2Model):
    featureSchemaVersion: Literal["ai2-features-v1"] = AI2_FEATURE_SCHEMA_VERSION
    featureExtractorVersion: Literal["ai2-extractor-v1"] = AI2_FEATURE_EXTRACTOR_VERSION
    preprocessingVersion: Literal["matching-text-v2"] = AI2_PREPROCESSING_VERSION
    jobSnapshotSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    candidateSnapshotSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    scoreReferenceDate: date
    ai1Status: Literal["NOT_PROVIDED", "DISABLED", "UNAVAILABLE", "READY"]
    ai1ModelVersion: str | None = None
    features: Ai2FeatureVector
    diagnostics: Ai2ExtractionDiagnostics
