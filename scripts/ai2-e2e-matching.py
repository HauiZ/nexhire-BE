"""HTTP-only local E2E entrypoint; production routes, no background worker."""
from fastapi import FastAPI
from app.api.matching import router

from contextlib import asynccontextmanager
import asyncio
from app.config import get_settings
from app.ranking.demo_loader import get_demo_predictor


@asynccontextmanager
async def lifespan(app):
    await asyncio.to_thread(get_demo_predictor, get_settings())
    yield


app = FastAPI(title='AI2 local E2E HTTP-only', lifespan=lifespan)
app.include_router(router, prefix='/api/v1')
