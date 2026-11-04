import httpx
from app.config import get_settings
from app.schemas.snapshot_boundary import normalize_job_snapshot
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from app.schemas.jd_plan_context import JobPlanContext, inspect_trusted_plan


class InternalClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _headers(self) -> dict[str, str]:
        return {
            "x-internal-service-token": self.settings.internal_service_token,
            "x-user-id": "matching-service",
            "x-user-role": "ADMIN",
        }

    async def get_job_matching_snapshot(self, job_id: str) -> JobMatchingSnapshot:
        async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds) as client:
            response = await client.get(
                f"{self.settings.job_service_url}/api/v1/internal/jobs/{job_id}/matching-snapshot",
                headers=self._headers(),
            )
            response.raise_for_status()
            return JobMatchingSnapshot.model_validate(normalize_job_snapshot(response.json()["data"]))

    async def get_candidate_matching_snapshot(
        self,
        candidate_id: str,
        candidate_cv_id: str | None,
    ) -> CandidateMatchingSnapshot:
        path = f"/api/v1/internal/candidates/{candidate_id}/matching-snapshot"
        if candidate_cv_id:
            path = f"{path}?candidateCvId={candidate_cv_id}"
        async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds) as client:
            response = await client.get(
                f"{self.settings.candidate_service_url}{path}",
                headers=self._headers(),
            )
            response.raise_for_status()
            return CandidateMatchingSnapshot.model_validate(response.json()["data"])

    async def get_job_requirement_plan(self, job: JobMatchingSnapshot) -> JobPlanContext:
        """Optional read; stale/unavailable plans must not prevent source-evidence matching."""
        try:
            async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds) as client:
                response = await client.get(
                    f"{self.settings.job_service_url}/api/v1/internal/jobs/{job.id}/requirement-plan",
                    headers=self._headers(),
                )
                response.raise_for_status()
                envelope = response.json()
                if not isinstance(envelope, dict) or envelope.get('success') is not True:
                    return JobPlanContext(status='INVALID', reason='INVALID_INTERNAL_RESPONSE')
                return inspect_trusted_plan(envelope.get('data'), job)
        except (httpx.HTTPError, ValueError):
            # Do not log source contents, credentials or stale approval as a fallback success.
            return JobPlanContext(status='UNAVAILABLE', reason='OPTIONAL_PLAN_READ_UNAVAILABLE')
