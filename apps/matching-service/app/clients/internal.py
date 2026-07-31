import httpx
from app.config import get_settings
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


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
            return JobMatchingSnapshot.model_validate(response.json()["data"])

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
