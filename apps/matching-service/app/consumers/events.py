import json
import uuid
from datetime import datetime, timezone
from aio_pika import ExchangeType, Message, connect_robust
from aio_pika.abc import AbstractRobustConnection, AbstractRobustExchange
from app.config import get_settings


APPLICATION_SUBMITTED = "application.submitted"
MATCHING_COMPLETED = "matching.completed"


def unwrap_event_data(payload: dict) -> dict:
    return payload.get("data", payload)


class EventPublisher:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.connection: AbstractRobustConnection | None = None
        self.exchange: AbstractRobustExchange | None = None

    async def connect(self) -> None:
        self.connection = await connect_robust(self.settings.rabbitmq_url)
        channel = await self.connection.channel(publisher_confirms=True)
        self.exchange = await channel.declare_exchange(
            self.settings.rabbitmq_exchange,
            ExchangeType.TOPIC,
            durable=True,
        )

    async def close(self) -> None:
        if self.connection:
            await self.connection.close()

    async def publish_matching_completed(self, payload: dict) -> None:
        if not self.exchange:
            await self.connect()
        envelope = {
            "eventId": str(uuid.uuid4()),
            "eventType": MATCHING_COMPLETED,
            "occurredAt": datetime.now(timezone.utc).isoformat(),
            "producer": "matching-service",
            "data": payload,
        }
        await self.exchange.publish(
            Message(
                body=json.dumps(envelope, default=str).encode("utf-8"),
                content_type="application/json",
                delivery_mode=2,
            ),
            routing_key=MATCHING_COMPLETED,
        )
