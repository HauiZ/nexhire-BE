import enum
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MatchRequestType(str, enum.Enum):
    AUTO_APPLICATION = "AUTO_APPLICATION"
    RECRUITER_MANUAL = "RECRUITER_MANUAL"
    JOB_RESCAN = "JOB_RESCAN"
    CV_RESCAN = "CV_RESCAN"


class MatchRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class MatchProvider(str, enum.Enum):
    INTERNAL = "INTERNAL"
    SKIMA = "SKIMA"
    GEMINI = "GEMINI"


class MatchResultStatus(str, enum.Enum):
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class MatchRequest(Base):
    __tablename__ = "match_requests"
    __table_args__ = (
        Index("idx_match_requests_status_priority_created_at", "status", "priority", "created_at"),
        Index("idx_match_requests_application_id", "application_id"),
        Index("idx_match_requests_job_id", "job_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    candidate_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    candidate_cv_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    cv_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    parsed_resume: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    request_type: Mapped[MatchRequestType] = mapped_column(
        Enum(MatchRequestType, name="match_request_type"), nullable=False
    )
    status: Mapped[MatchRequestStatus] = mapped_column(
        Enum(MatchRequestStatus, name="match_request_status"),
        nullable=False,
        default=MatchRequestStatus.PENDING,
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class MatchResult(Base):
    __tablename__ = "match_results"
    __table_args__ = (
        Index("idx_match_results_job_id", "job_id"),
        Index("idx_match_results_candidate_id", "candidate_id"),
        Index("idx_match_results_candidate_cv_id", "candidate_cv_id"),
        Index("idx_match_results_application_id", "application_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    candidate_cv_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    application_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[MatchResultStatus] = mapped_column(
        Enum(MatchResultStatus, name="match_result_status"),
        nullable=False,
        default=MatchResultStatus.SUCCEEDED,
    )
    provider: Mapped[MatchProvider] = mapped_column(
        Enum(MatchProvider, name="match_provider"),
        nullable=False,
        default=MatchProvider.INTERNAL,
    )
    model_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    total_score: Mapped[float] = mapped_column(Float, nullable=False)
    skill_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    experience_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    education_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    certification_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    project_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    preference_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    semantic_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    explanation: Mapped[dict] = mapped_column(JSONB, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    matching_completed_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
