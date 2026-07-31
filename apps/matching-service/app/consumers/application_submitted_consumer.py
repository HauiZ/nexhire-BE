import asyncio
import json
import logging
from aio_pika import ExchangeType, IncomingMessage, connect_robust

from app.config import get_settings
from app.consumers.events import APPLICATION_SUBMITTED, unwrap_event_data
from app.db import session_scope
from app.matching.service import MatchingService
from app.schemas.match_result import CreateMatchRequestDto

logger = logging.getLogger(__name__)


class ApplicationSubmittedConsumer:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.service = MatchingService()
        self._task: asyncio.Task | None = None
        self._connection = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
        if self._connection:
            await self._connection.close()

    async def _run(self) -> None:
        while True:
            try:
                self._connection = await connect_robust(self.settings.rabbitmq_url)
                channel = await self._connection.channel()
                exchange = await channel.declare_exchange(
                    self.settings.rabbitmq_exchange,
                    ExchangeType.TOPIC,
                    durable=True,
                )
                queue = await channel.declare_queue(self.settings.matching_queue, durable=True)
                await queue.bind(exchange, APPLICATION_SUBMITTED)
                await queue.consume(self._consume, no_ack=False)
                logger.info("application.submitted consumer is running queue=%s", self.settings.matching_queue)
                await asyncio.Future()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("application.submitted consumer failed; retrying")
                await asyncio.sleep(5)

    async def _consume(self, message: IncomingMessage) -> None:
        async with message.process(requeue=False):
            payload = unwrap_event_data(json.loads(message.body.decode("utf-8")))
            dto = CreateMatchRequestDto(
                applicationId=payload["applicationId"],
                jobId=payload["jobId"],
                candidateId=payload["candidateId"],
                candidateUserId=payload.get("candidateUserId"),
                candidateCvId=payload.get("candidateCvId"),
                cvDocumentId=payload.get("cvDocumentId"),
            )
            async with session_scope() as session:
                request = await self.service.enqueue_application_request(session, dto)
                logger.info("queued match request id=%s applicationId=%s", request.id, dto.applicationId)
