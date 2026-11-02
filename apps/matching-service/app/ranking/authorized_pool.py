"""Server-side demo orchestration; caller must provide an authenticated resolver.

Not mounted on main app. No request-supplied CV snapshots or fabricated ownership.
"""
from dataclasses import dataclass
from typing import Protocol

from app.ranking.demo_predictor import order_demo_pool
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from app.schemas.ai1 import Ai1Assessment


@dataclass(frozen=True)
class AuthorizedApplication:
    application_id: str
    job_id: str
    candidate_id: str
    candidate_cv_id: str | None


class PoolResolver(Protocol):
    async def authorize_pool(self, actor_id: str, job_id: str,
                             application_ids: tuple[str, ...]) -> tuple[AuthorizedApplication, ...]: ...
    async def load_job(self, job_id: str) -> JobMatchingSnapshot: ...
    async def load_candidate(self, application: AuthorizedApplication) -> CandidateMatchingSnapshot: ...
    async def load_assessment(self, application: AuthorizedApplication) -> Ai1Assessment: ...


async def rank_authorized_pool(resolver, predictor, *, actor_id, job_id,
                               application_ids, reference_date):
    """Authorize entire pool first, then load server-side sources; no partial pool.

    Resolver must implement ownership against trusted application records. Internal
    service token or caller IDs alone are not proof of HR/company membership.
    Authorization errors propagate to transport; never downgrade to a valid rank.
    """
    if (not isinstance(actor_id, str) or not actor_id.strip()
            or not isinstance(job_id, str) or not job_id.strip()
            or not isinstance(application_ids, tuple) or not 1 <= len(application_ids) <= 50
            or any(not isinstance(i, str) or not i.strip() for i in application_ids)
            or len(set(application_ids)) != len(application_ids)):
        raise ValueError('authenticated actor and bounded unique application IDs required')
    applications = await resolver.authorize_pool(actor_id, job_id, application_ids)
    if (not isinstance(applications, tuple) or len(applications) != len(application_ids)
            or any(not isinstance(a, AuthorizedApplication) or a.job_id != job_id for a in applications)
            or {a.application_id for a in applications} != set(application_ids)):
        raise ValueError('authorized pool identity mismatch')
    if predictor is None:
        return {'status': 'DISABLED', 'items': []}
    job = await resolver.load_job(job_id)
    if job.id != job_id:
        raise ValueError('server job identity mismatch')
    scores, application_by_candidate = [], {}
    for application in applications:
        candidate = await resolver.load_candidate(application)
        if (candidate.candidateId != application.candidate_id
                or candidate.candidateCvId != application.candidate_cv_id):
            raise ValueError('submitted candidate/CV identity mismatch')
        assessment = await resolver.load_assessment(application)
        import asyncio
        score = await asyncio.to_thread(predictor.score, assessment, job, candidate,
                                         reference_date=reference_date)
        if (score.candidate_id != application.candidate_id
                or score.candidate_cv_id != application.candidate_cv_id):
            raise ValueError('prediction identity mismatch')
        scores.append(score)
        application_by_candidate[application.candidate_id] = application.application_id
    ordered = order_demo_pool(scores)
    return {'status': 'READY', 'scoreMeaning': 'RELATIVE_RANKING_SCORE',
            'experimental': True, 'attributionStatus': 'UNAVAILABLE',
            'items': [{'applicationId': application_by_candidate[s.candidate_id],
                       'candidateId': s.candidate_id, 'candidateCvId': s.candidate_cv_id,
                       'score': s.score, 'rank': index + 1, 'modelVersion': s.model_version}
                      for index, s in enumerate(ordered)]}
