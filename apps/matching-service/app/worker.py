import asyncio
import logging

from app.config import get_settings
from app.db import session_scope
from app.matching.service import MatchingService
from app.models.matching import MatchRequest, MatchResultStatus

logger = logging.getLogger(__name__)


class MatchRequestWorker:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.service = MatchingService()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        while True:
            try:
                async with session_scope() as session:
                    requests = await self.service.claim_pending(session, self.settings.worker_batch_size)
                    request_ids = [request.id for request in requests]
                for request_id in request_ids:
                    result = None
                    async with session_scope() as session:
                        request = await session.get(MatchRequest, request_id)
                        if not request:
                            continue
                        result = await self.service.process(session, request)
                        logger.info("processed match request id=%s status=%s", request.id, request.status.value)
                    if result and result.status == MatchResultStatus.SUCCEEDED:
                        await self.service.publish_completed(result)
            except Exception:
                logger.exception("match request worker tick failed")
            await asyncio.sleep(self.settings.worker_poll_seconds)
