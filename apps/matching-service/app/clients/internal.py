import httpx
from uuid import UUID
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

    async def get_current_cv_parse_source(self, user_id: str, cv_id: str) -> tuple[dict, dict]:
        """Read the active owned CV and its saved parse only; never request parsing or profile fallback."""
        user_id, cv_id = str(UUID(user_id)), str(UUID(cv_id))
        async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds, follow_redirects=False) as client:
            owned = await client.get(
                f'{self.settings.candidate_service_url}/api/v1/internal/candidates/users/{user_id}/cvs/{cv_id}/application-snapshot',
                headers=self._headers())
            owned.raise_for_status()
            owned_envelope = owned.json()
            if not isinstance(owned_envelope, dict) or owned_envelope.get('success') is not True:
                raise ValueError('Invalid active CV envelope')
            active = owned_envelope.get('data')
            if not isinstance(active, dict) or active.get('candidateUserId') != user_id or active.get('candidateCvId') != cv_id or active.get('cvParseStatus') != 'PARSED':
                raise ValueError('Current CV is unavailable')
            parsed = await client.get(
                f'{self.settings.cv_parsing_service_url}/api/v1/internal/cv-parsing/cvs/{cv_id}/latest-result',
                headers=self._headers())
            parsed.raise_for_status()
            parsed_envelope = parsed.json()
            if not isinstance(parsed_envelope, dict) or parsed_envelope.get('success') is not True or not isinstance(parsed_envelope.get('data'), dict):
                raise ValueError('Invalid saved parse envelope')
            return active, parsed_envelope['data']

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
