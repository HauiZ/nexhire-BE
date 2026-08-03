import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.internal import InternalClient
from app.config import get_settings
from app.publishers.events import EventPublisher
from app.matching.scorer import MatchingScorer
from app.models.matching import (
    MatchProvider,
    MatchRequest,
    MatchRequestStatus,
    MatchRequestType,
    MatchResult,
    MatchResultStatus,
)
from app.schemas.match_result import CreateMatchRequestDto, MatchScores


def match_level(score: float) -> str:
    if score >= 85:
        return "EXCELLENT"
    if score >= 70:
        return "HIGH"
    if score >= 50:
        return "MEDIUM"
    return "LOW"


class MatchingService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = InternalClient()
        self.scorer = MatchingScorer()
        self.publisher = EventPublisher()

    async def enqueue_application_request(
        self,
        session: AsyncSession,
        dto: CreateMatchRequestDto,
        request_type: MatchRequestType = MatchRequestType.AUTO_APPLICATION,
        priority: int = 100,
    ) -> MatchRequest:
        existing = await session.scalar(
            select(MatchRequest)
            .where(MatchRequest.application_id == uuid.UUID(dto.applicationId))
            .where(MatchRequest.request_type == request_type)
            .where(MatchRequest.status.in_([MatchRequestStatus.PENDING, MatchRequestStatus.PROCESSING]))
            .limit(1)
        )
        if existing:
            return existing

        request = MatchRequest(
            application_id=uuid.UUID(dto.applicationId),
            job_id=uuid.UUID(dto.jobId),
            candidate_id=uuid.UUID(dto.candidateId),
            candidate_user_id=uuid.UUID(dto.candidateUserId) if dto.candidateUserId else None,
            candidate_cv_id=uuid.UUID(dto.candidateCvId) if dto.candidateCvId else None,
            cv_document_id=uuid.UUID(dto.cvDocumentId) if dto.cvDocumentId else None,
            parsed_resume=dto.parsedResume,
            requested_by_user_id=uuid.UUID(dto.requestedByUserId) if dto.requestedByUserId else None,
            request_type=request_type,
            status=MatchRequestStatus.PENDING,
            priority=priority,
        )
        session.add(request)
        await session.flush()
        return request

    async def claim_pending(self, session: AsyncSession, limit: int) -> list[MatchRequest]:
        rows = (
            await session.scalars(
                select(MatchRequest)
                .where(MatchRequest.status == MatchRequestStatus.PENDING)
                .order_by(MatchRequest.priority.asc(), MatchRequest.created_at.asc())
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).all()
        now = datetime.now(timezone.utc)
        for row in rows:
            row.status = MatchRequestStatus.PROCESSING
            row.started_at = now
            row.attempt_count += 1
        return list(rows)

    async def process(self, session: AsyncSession, request: MatchRequest) -> MatchResult:
        try:
            job = await self.client.get_job_matching_snapshot(str(request.job_id))
            candidate = (
                self._candidate_from_parsed_resume(request)
                if request.parsed_resume
                else await self.client.get_candidate_matching_snapshot(
                    str(request.candidate_id),
                    str(request.candidate_cv_id) if request.candidate_cv_id else None,
                )
            )
            scores = self.scorer.score(job, candidate)
            result = self._build_success_result(request, scores)
            session.add(result)
            request.status = MatchRequestStatus.SUCCEEDED
            request.finished_at = datetime.now(timezone.utc)
            request.last_error_code = None
            request.last_error_message = None
            await session.flush()
            return result
        except Exception as error:
            request.last_error_code = "MATCHING.PROCESS_FAILED"
            request.last_error_message = str(error)
            if request.attempt_count < self.settings.max_attempts:
                request.status = MatchRequestStatus.PENDING
                request.finished_at = None
                await session.flush()
                return self._build_failed_result(request, str(error))
            request.status = MatchRequestStatus.FAILED
            request.finished_at = datetime.now(timezone.utc)
            result = self._build_failed_result(request, str(error))
            session.add(result)
            await session.flush()
            return result

    async def find_unpublished_completed_results(
        self, session: AsyncSession, limit: int
    ) -> list[MatchResult]:
        rows = (
            await session.scalars(
                select(MatchResult)
                .where(MatchResult.matching_completed_published_at.is_(None))
                .order_by(MatchResult.created_at.asc())
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).all()
        return list(rows)

    async def mark_completed_published(self, session: AsyncSession, result_id: uuid.UUID) -> None:
        result = await session.get(MatchResult, result_id)
        if result:
            result.matching_completed_published_at = datetime.now(timezone.utc)
            await session.flush()

    async def get_latest_application_result(
        self, session: AsyncSession, application_id: str
    ) -> MatchResult | None:
        return await session.scalar(
            select(MatchResult)
            .where(MatchResult.application_id == uuid.UUID(application_id))
            .order_by(MatchResult.created_at.desc())
            .limit(1)
        )

    def map_result_snapshot(self, result: MatchResult) -> dict:
        return {
            "id": str(result.id),
            "matchRequestId": str(result.request_id) if result.request_id else None,
            "applicationId": str(result.application_id) if result.application_id else None,
            "jobId": str(result.job_id),
            "candidateId": str(result.candidate_id),
            "candidateCvId": str(result.candidate_cv_id) if result.candidate_cv_id else None,
            "status": result.status.value,
            "totalScore": result.total_score,
            "matchLevel": match_level(result.total_score),
            "explanation": result.explanation,
            "errorCode": result.error_code,
            "errorMessage": result.error_message,
            "createdAt": result.created_at.isoformat() if result.created_at else None,
        }

    def _candidate_from_parsed_resume(self, request: MatchRequest):
        from app.schemas.snapshots import (
            CandidateEducationSnapshot,
            CandidateExperienceSnapshot,
            CandidateMatchingSnapshot,
            CandidateSkillSnapshot,
        )

        parsed = request.parsed_resume or {}
        profile = parsed.get("profile") or {}
        return CandidateMatchingSnapshot(
            candidateId=str(request.candidate_id),
            candidateUserId=str(request.candidate_user_id) if request.candidate_user_id else None,
            candidateCvId=str(request.candidate_cv_id) if request.candidate_cv_id else None,
            fullName=profile.get("fullName"),
            headline=profile.get("headline"),
            summary=profile.get("summary"),
            location=profile.get("location"),
            skills=[
                CandidateSkillSnapshot(
                    name=skill.get("name", ""),
                    level=skill.get("level"),
                    yearsOfExperience=skill.get("yearsOfExperience"),
                )
                for skill in parsed.get("skills", [])
                if skill.get("name")
            ],
            experiences=[
                CandidateExperienceSnapshot(
                    title=experience.get("position"),
                    company=experience.get("companyName"),
                    startYear=experience.get("startYear"),
                    startMonth=experience.get("startMonth"),
                    endYear=experience.get("endYear"),
                    endMonth=experience.get("endMonth"),
                    isCurrent=experience.get("isCurrent"),
                )
                for experience in parsed.get("experiences", [])
            ],
            educations=[
                CandidateEducationSnapshot(
                    degree=education.get("degree"),
                    school=education.get("schoolName"),
                    fieldOfStudy=education.get("fieldOfStudy"),
                )
                for education in parsed.get("educations", [])
            ],
            certifications=[
                certification.get("name")
                for certification in parsed.get("certifications", [])
                if certification.get("name")
            ],
            projects=[
                project.get("name")
                for project in parsed.get("projects", [])
                if project.get("name")
            ],
        )

    async def publish_completed(self, result: MatchResult) -> None:
        await self.publisher.publish_matching_completed(
            {
                "matchResultId": str(result.id),
                "matchRequestId": str(result.request_id) if result.request_id else None,
                "applicationId": str(result.application_id) if result.application_id else None,
                "jobId": str(result.job_id),
                "candidateId": str(result.candidate_id),
                "candidateCvId": str(result.candidate_cv_id) if result.candidate_cv_id else None,
                "status": result.status.value,
                "totalScore": result.total_score,
                "matchLevel": match_level(result.total_score),
                "explanation": result.explanation,
                "errorCode": result.error_code,
                "errorMessage": result.error_message,
                "matchedAt": datetime.now(timezone.utc).isoformat(),
            }
        )

    def _build_success_result(self, request: MatchRequest, scores: MatchScores) -> MatchResult:
        return MatchResult(
            request_id=request.id,
            job_id=request.job_id,
            candidate_id=request.candidate_id,
            candidate_cv_id=request.candidate_cv_id,
            application_id=request.application_id,
            status=MatchResultStatus.SUCCEEDED,
            provider=MatchProvider.INTERNAL,
            model_version=self.scorer.model_version,
            total_score=scores.totalScore,
            skill_score=scores.skillScore,
            experience_score=scores.experienceScore,
            education_score=scores.educationScore,
            certification_score=scores.certificationScore,
            project_score=scores.projectScore,
            preference_score=scores.preferenceScore,
            semantic_score=scores.semanticScore,
            explanation=scores.explanation.model_dump(),
        )

    def _build_failed_result(self, request: MatchRequest, message: str) -> MatchResult:
        return MatchResult(
            request_id=request.id,
            job_id=request.job_id,
            candidate_id=request.candidate_id,
            candidate_cv_id=request.candidate_cv_id,
            application_id=request.application_id,
            status=MatchResultStatus.FAILED,
            provider=MatchProvider.INTERNAL,
            model_version=self.scorer.model_version,
            total_score=0,
            explanation={
                "matchedSkills": [],
                "missingSkills": [],
                "strongSignals": [],
                "weakSignals": [message],
                "recommendation": "LOW_FIT",
                "decision": "REVIEW_MANUALLY",
                "priority": "LOW",
                "summary": "Matching failed and needs manual review if this application is important.",
                "nextActions": ["Check matching-service logs and retry the request"],
                "riskFlags": ["MATCHING_PROCESS_FAILED"],
            },
            error_code="MATCHING.PROCESS_FAILED",
            error_message=message,
        )
