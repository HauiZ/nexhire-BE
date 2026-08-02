from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import session_scope
from app.matching.service import MatchingService
from app.models.matching import MatchRequestType
from app.schemas.match_result import CreateMatchRequestDto

router = APIRouter(prefix="/matching", tags=["matching"])


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
