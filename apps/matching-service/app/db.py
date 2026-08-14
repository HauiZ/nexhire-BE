from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings


settings = get_settings()
engine: AsyncEngine = create_async_engine(
    settings.database_url,
    connect_args=settings.database_connect_args,
    pool_size=settings.db_pool_max,
    max_overflow=0,
    pool_timeout=settings.db_pool_connection_timeout_seconds,
    pool_pre_ping=True,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
