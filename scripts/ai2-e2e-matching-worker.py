"""Local scoped worker: real processing, only new requests for authorized application."""
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI
from sqlalchemy import select

from app.api.matching import router
from app.db import session_scope
from app.matching.service import MatchingService
from app.models.matching import MatchRequest, MatchRequestStatus
from app.worker import MatchRequestWorker


@asynccontextmanager
async def lifespan(app):
    application_id = UUID(os.environ['AI2_E2E_APPLICATION_ID'])
    started = datetime.now(timezone.utc)
    service = MatchingService()
    publisher = MatchRequestWorker()

    async def run():
        while True:
            async with session_scope() as session:
                request = await session.scalar(select(MatchRequest).where(
                    MatchRequest.application_id == application_id,
                    MatchRequest.created_at >= started,
                    MatchRequest.status == MatchRequestStatus.PENDING,
                ).order_by(MatchRequest.created_at).limit(1).with_for_update(skip_locked=True))
                request_id = None
                if request:
                    request.status = MatchRequestStatus.PROCESSING
                    request.started_at = datetime.now(timezone.utc)
                    request.attempt_count += 1
                    request_id = request.id
            if request_id:
                async with session_scope() as session:
                    request = await session.get(MatchRequest, request_id)
                    result = await service.process(session, request)
                    result_id = result.id
                if result_id:
                    await publisher._publish_completed_result(result_id)
            await asyncio.sleep(0.5)

    task = asyncio.create_task(run())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title='AI2 scoped local worker E2E', lifespan=lifespan)
app.include_router(router, prefix='/api/v1')
