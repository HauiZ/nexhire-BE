import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.api.matching import router as matching_router
from app.consumers.application_submitted_consumer import ApplicationSubmittedConsumer
from app.worker import MatchRequestWorker

logging.basicConfig(level=logging.INFO)


consumer = ApplicationSubmittedConsumer()
worker = MatchRequestWorker()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await consumer.start()
    await worker.start()
    yield
    await worker.stop()
    await consumer.stop()


app = FastAPI(title="NexHire - matching service", version="1.0", lifespan=lifespan)


@app.exception_handler(Exception)
async def exception_handler(_request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "COMMON.INTERNAL_ERROR",
                "message": str(exc),
            },
        },
    )


app.include_router(health_router, prefix="/api/v1")
app.include_router(matching_router, prefix="/api/v1")
