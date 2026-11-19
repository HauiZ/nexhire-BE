"""Internal candidate recommendation scoring against cached public JD vectors."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.api.matching import require_internal_service
from app.config import get_settings
from app.recommendations.index import recommendation_index
from app.recommendations.ranking import RecommendationRequest

router = APIRouter(prefix='/internal/job-recommendations', tags=['job-recommendations'])
_REQUEST_BYTES = 9_000_000


@router.post('', dependencies=[Depends(require_internal_service)])
async def recommend_jobs(request: Request):
    settings = get_settings()
    if not settings.local_job_recommendations_enabled:
        raise HTTPException(status_code=503, detail='Local recommendations unavailable')
    # Avoid FastAPI's default validation body, which can echo a private CV excerpt.
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > _REQUEST_BYTES:
            raise HTTPException(status_code=413, detail='Recommendation input exceeds the size limit')
        data.extend(chunk)
    try:
        dto = RecommendationRequest.model_validate_json(data)
    except ValidationError:
        raise HTTPException(status_code=422, detail='Invalid recommendation input') from None
    try:
        result = await recommendation_index.recommend(settings, dto)
    except Exception:
        raise HTTPException(status_code=503, detail='Local recommendations unavailable') from None
    return {'success': True, 'data': result}
