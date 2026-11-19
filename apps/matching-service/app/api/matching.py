from fastapi import APIRouter, Depends, Header, HTTPException, Query
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import session_scope
from app.matching.service import MatchingService, revalidate_current_cv as _revalidate_current_cv
from app.matching.hr_review import hr_review_snapshot
from app.models.matching import MatchRequestType, MatchRequest
from app.schemas.match_result import CreateMatchRequestDto

router = APIRouter(prefix="/matching", tags=["matching"])


def _snapshot_freshness():
    return dict(sourceFreshness='STORED_MATCHING_SNAPSHOT_ONLY', currentCvRevalidated=False)


def _unavailable_score(result, reason):
    return dict(schemaVersion='ai2-demo-score-v1', applicationId=str(result.application_id), jobId=str(result.job_id),
                candidateId=str(result.candidate_id), candidateCvId=str(result.candidate_cv_id) if result.candidate_cv_id else None,
                resultId=str(result.id), status='UNAVAILABLE', score=None, experimental=True,
                scoreMeaning='RELATIVE_RANKING_SCORE', rankingPosition=None, automaticallyReject=False,
                hiringDecision=None, attributionStatus='UNAVAILABLE', reason=reason, **_snapshot_freshness())




async def get_session():
    async with session_scope() as session:
        yield session


def require_internal_service(
    internal_token: str | None = Header(default=None, alias="x-internal-service-token"),
) -> None:
    expected = get_settings().internal_service_token
    if not expected or internal_token != expected:
        raise HTTPException(status_code=403, detail="Invalid internal service token")


@router.post("/applications/{application_id}/requests", status_code=201)
async def create_application_match_request(
    application_id: str,
    dto: CreateMatchRequestDto,
    session: AsyncSession = Depends(get_session),
    _internal: None = Depends(require_internal_service),
) -> dict:
    service = MatchingService()
    request_type = (
        MatchRequestType.RECRUITER_MANUAL
        if dto.requestType == MatchRequestType.RECRUITER_MANUAL.value
        else MatchRequestType.AUTO_APPLICATION
    )
    request = await service.enqueue_application_request(
        session,
        dto.model_copy(update={"applicationId": application_id}),
        request_type=request_type,
        priority=50 if request_type == MatchRequestType.RECRUITER_MANUAL else 100,
    )
    return {
        "success": True,
        "data": {
            "id": str(request.id),
            "applicationId": str(request.application_id) if request.application_id else None,
            "status": request.status.value,
            "requestType": request.request_type.value,
        },
    }


@router.get("/applications/{application_id}/latest-result")
async def get_latest_application_match_result(
    application_id: str,
    session: AsyncSession = Depends(get_session),
    _internal: None = Depends(require_internal_service),
) -> dict:
    service = MatchingService()
    result = await service.get_latest_application_result(session, application_id)
    if not result:
        raise HTTPException(status_code=404, detail="Match result not found")
    return {
        "success": True,
        "data": service.map_result_snapshot(result),
    }


@router.get('/applications/{application_id}/latest-ai2-demo')
async def get_latest_ai2_demo(
    application_id: UUID,
    session: AsyncSession = Depends(get_session),
    _internal: None = Depends(require_internal_service),
) -> dict:
    import asyncio
    from app.ranking.demo_loader import get_demo_predictor
    from app.ranking.stored_score import score_stored_result
    result = await MatchingService().get_latest_application_result(session, str(application_id))
    if not result:
        raise HTTPException(status_code=404, detail='Match result not found')
    try:
        predictor = await asyncio.to_thread(get_demo_predictor, get_settings())
        freshness = _snapshot_freshness()
        if predictor is not None:
            request = await session.get(MatchRequest, result.request_id) if result.request_id else None
            freshness = await _revalidate_current_cv(result, request)
            if 'reason' in freshness:
                return {'success': True, 'data': _unavailable_score(result, freshness['reason'])}
        data = await asyncio.to_thread(score_stored_result, result, predictor)
        data.update(freshness)
    except Exception:
        # Optional native-model failures must not leak inputs or break legacy reads.
        raise HTTPException(status_code=503, detail='AI2 demo scoring unavailable') from None
    return {'success': True, 'data': data}


@router.get('/jobs/{job_id}/ai2-demo-pool')
async def get_ai2_demo_pool(
    job_id: UUID,
    applicationIds: list[UUID] = Query(min_length=1, max_length=50),
    session: AsyncSession = Depends(get_session),
    _internal: None = Depends(require_internal_service),
) -> dict:
    import asyncio
    from app.clients.internal import InternalClient
    from app.ranking.demo_loader import get_demo_predictor
    from app.ranking.stored_score import score_stored_result
    from app.ranking.stored_pool import rank_stored_pool
    if len(set(applicationIds)) != len(applicationIds):
        raise HTTPException(status_code=400, detail='Duplicate application IDs')
    service = MatchingService()
    results = [await service.get_latest_application_result(session, str(identity)) for identity in applicationIds]
    if any(result is None or str(result.job_id) != str(job_id) or str(result.application_id) != str(identity)
           for identity, result in zip(applicationIds, results)):
        return {'success': True, 'data': dict(schemaVersion='ai2-demo-pool-v1', status='UNAVAILABLE',
            experimental=True, automaticallyReject=False, hiringDecision=None,
            requestedCount=len(applicationIds), comparedCount=0, items=[], reason='RESULTS_NOT_READY')}
    try:
        predictor = await asyncio.to_thread(get_demo_predictor, get_settings())
        freshness = _snapshot_freshness()
        if predictor is not None:
            # AsyncSession reads stay sequential; only bounded external reads run concurrently.
            requests = {result.request_id: await session.get(MatchRequest, result.request_id)
                        for result in results if result.request_id}
            semaphore = asyncio.Semaphore(5)
            async def checked(result):
                async with semaphore:
                    return await _revalidate_current_cv(result, requests.get(result.request_id))
            try:
                checks = await asyncio.wait_for(asyncio.gather(*(checked(result) for result in results)),
                                                timeout=get_settings().http_timeout_seconds * 2 + 1)
            except asyncio.TimeoutError:
                checks = [dict(reason='CURRENT_CV_UNAVAILABLE')]
            failure = next((check['reason'] for check in checks if 'reason' in check), None)
            if failure:
                return {'success': True, 'data': dict(schemaVersion='ai2-demo-pool-v1', status='UNAVAILABLE',
                    experimental=True, automaticallyReject=False, hiringDecision=None, requestedCount=len(results),
                    comparedCount=0, items=[], reason=failure, **_snapshot_freshness())}
            freshness = dict(sourceFreshness='CURRENT_CV_REVALIDATED_AT_CHECK_TIME', currentCvRevalidated=True,
                             sourceCheckedAt=max(check['sourceCheckedAt'] for check in checks))
        from datetime import datetime, timezone
        pool_reference = datetime.now(timezone.utc).date().isoformat()
        scores = await asyncio.to_thread(lambda: [score_stored_result(
            result, predictor, pool_reference_date=pool_reference) for result in results])
        current_job = await InternalClient().get_job_matching_snapshot(str(job_id)) if predictor else None
        data = rank_stored_pool(scores, current_job)
        data.update(freshness)
        if data['status'] == 'READY':
            settings = get_settings()
            demo_order = (getattr(settings, 'ai2_demo_order_enabled', False)
                          and settings.node_env in {'development', 'test'})
            if demo_order:
                # Explicit local inspection, never production quality approval.
                data.update(evaluationMode='LOCAL_DEMO_ONLY', contentQualityValidated=False)
            else:
                data.update(status='UNAVAILABLE', reason='CONTENT_QUALITY_NOT_VALIDATED',
                            items=[], comparedCount=0)
    except Exception:
        raise HTTPException(status_code=503, detail='AI2 pool unavailable') from None
    return {'success': True, 'data': data}


@router.get('/applications/{application_id}/latest-hr-review')
async def get_latest_hr_review(
    application_id: UUID,
    includeBaselineDiagnostics: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    _internal: None = Depends(require_internal_service),
) -> dict:
    result = await MatchingService().get_latest_application_result(session, str(application_id))
    if not result:
        raise HTTPException(status_code=404, detail='Match result not found')
    return {'success': True, 'data': hr_review_snapshot(result, include_baseline=includeBaselineDiagnostics)}
