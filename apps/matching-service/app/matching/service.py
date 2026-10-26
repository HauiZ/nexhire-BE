import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.internal import InternalClient
from app.config import get_settings
from app.publishers.events import EventPublisher
from app.matching.evidence_result import evidence_explanation, public_explanation
from app.matching.ai1 import assess_ai1
from app.schemas.jd_plan_context import JobPlanContext
from app.models.matching import (
    MatchProvider,
    MatchRequest,
    MatchRequestStatus,
    MatchRequestType,
    MatchResult,
    MatchResultStatus,
)
from app.schemas.match_result import CreateMatchRequestDto



class MatchingService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = InternalClient()
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
            context = JobPlanContext(status='UNAVAILABLE', reason='AI1_BACKEND_DISABLED')
            if getattr(self.settings, 'ai1_backend', 'disabled') != 'disabled':
                try:
                    context = await self.client.get_job_requirement_plan(job)
                except Exception:
                    context = JobPlanContext(status='UNAVAILABLE', reason='OPTIONAL_PLAN_UNAVAILABLE')
            reference_date = datetime.now(timezone.utc).date()
            assessment = await assess_ai1(self.settings, job, candidate, context)
            explanation = evidence_explanation(job, candidate, assessment, reference_date)
            result = self._build_success_result(request, explanation)
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
            "scoringStatus": "NOT_AVAILABLE",
            "totalScore": None,
            "matchLevel": None,
            "explanation": public_explanation(result.explanation),
            "errorCode": result.error_code,
            "errorMessage": result.error_message,
            "createdAt": result.created_at.isoformat() if result.created_at else None,
        }

    def _candidate_from_parsed_resume(self, request: MatchRequest):
        from app.schemas.snapshots import (
            CandidateEducationSnapshot,
            CandidateExperienceSnapshot,
            CandidateMatchingSnapshot,
            CandidateProjectSnapshot,
            CandidateSkillSnapshot,
        )

        parsed = request.parsed_resume or {}
        profile = parsed.get("profile") or {}
        return CandidateMatchingSnapshot(
            snapshotSchemaVersion="candidate-matching-v2",
            dataOrigin="PARSED_CV",
            candidateId=str(request.candidate_id),
            candidateUserId=str(request.candidate_user_id) if request.candidate_user_id else None,
            candidateCvId=str(request.candidate_cv_id) if request.candidate_cv_id else None,
            fullName=profile.get("fullName"),
            headline=profile.get("headline"),
            summary=profile.get("summary"),
            location=profile.get("location"),
            skills=[
                CandidateSkillSnapshot(
                    id=f"skills/{index}",
                    name=skill.get("name", ""),
                    level=skill.get("level"),
                    yearsOfExperience=skill.get("yearsOfExperience"),
                )
                for index, skill in enumerate(parsed.get("skills", []))
                if skill.get("name")
            ],
            experiences=[
                CandidateExperienceSnapshot(
                    id=f"experiences/{index}",
                    description=experience.get("description"),
                    title=experience.get("position"),
                    company=experience.get("companyName"),
                    startYear=experience.get("startYear"),
                    startMonth=experience.get("startMonth"),
                    endYear=experience.get("endYear"),
                    endMonth=experience.get("endMonth"),
                    isCurrent=experience.get("isCurrent"),
                )
                for index, experience in enumerate(parsed.get("experiences", []))
            ],
            educations=[
                CandidateEducationSnapshot(
                    id=f"educations/{index}",
                    description=education.get("description"),
                    degree=education.get("degree"),
                    school=education.get("schoolName"),
                    fieldOfStudy=education.get("fieldOfStudy"),
                )
                for index, education in enumerate(parsed.get("educations", []))
            ],
            certifications=[
                dict(certification, id=f"certifications/{index}")
                for index, certification in enumerate(parsed.get("certifications", []))
                if certification.get("name")
            ],
            projects=[
                CandidateProjectSnapshot(
                    id=f"projects/{index}",
                    name=project.get("name"),
                    description=project.get("description"),
                    technologies=project.get("technologies") or [],
                )
                for index, project in enumerate(parsed.get("projects", []))
                if project.get("name")
                or project.get("description")
                or project.get("technologies")
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
                "scoringStatus": "NOT_AVAILABLE",
                "totalScore": None,
                "matchLevel": None,
                "explanation": public_explanation(result.explanation, include_snapshots=False),
                "errorCode": result.error_code,
                "errorMessage": result.error_message,
                "matchedAt": datetime.now(timezone.utc).isoformat(),
            }
        )

    def _build_success_result(self, request: MatchRequest, explanation: dict) -> MatchResult:
        return self._build_result(request, MatchResultStatus.SUCCEEDED, explanation)

    def _build_failed_result(self, request: MatchRequest, message: str) -> MatchResult:
        return self._build_result(request, MatchResultStatus.FAILED,
            public_explanation(None), error_code="MATCHING.PROCESS_FAILED", error_message=message)

    @staticmethod
    def _build_result(request, status, explanation, **errors):
        return MatchResult(
            request_id=request.id, job_id=request.job_id, candidate_id=request.candidate_id,
            candidate_cv_id=request.candidate_cv_id, application_id=request.application_id,
            status=status, provider=MatchProvider.INTERNAL, model_version="evidence-only-v1",
            total_score=None, skill_score=None, experience_score=None, education_score=None,
            certification_score=None, project_score=None, preference_score=None, semantic_score=None,
            explanation=explanation, **errors,
        )
