"""Standalone shadow API. Not registered by app.main or the production worker."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import math
import os
import secrets

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError, field_validator

from app.experimental.evidence_assessment import AssessmentContext, assess_evidence
from app.experimental.shadow_requirement_matcher import ShadowMatch
from app.experimental.shadow_runtime import ShadowEncoder, ShadowInputError
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from app.schemas.snapshot_boundary import normalize_job_snapshot


class ShadowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job: JobMatchingSnapshot
    candidate: CandidateMatchingSnapshot

    @field_validator("job", mode="before")
    @classmethod
    def normalize_nullable_job_text(cls, value):
        return normalize_job_snapshot(value)


def score_pending_assessments(engine, job, candidate):
    result = engine.score(job, candidate)
    weights = engine.manifest["weights_sha256"]
    if (result["model_version"] != engine.model_version or result["weights_sha256"] != weights
            or result["automatically_supported"] is not False or result["candidate_rejected"] is not False
            or result["production_changed"] is not False):
        raise ValueError("Shadow model provenance or safety flags changed")
    matches = TypeAdapter(list[ShadowMatch]).validate_python(result["requirements"])
    if len({m.requirement.id for m in matches}) != len(matches):
        raise ValueError("Unique requirement identities required")
    for match in matches:
        ids = tuple(hit.id for hit in match.hits)
        if (len(set(ids)) != len(ids) or ids != match.ranked_evidence_ids[:len(ids)]
                or len(set(match.ranked_evidence_ids)) != len(match.ranked_evidence_ids)
                or match.automatically_supported or match.candidate_rejected or not match.requires_manual_review):
            raise ValueError("Shadow retrieval window or safety flags changed")
    context = AssessmentContext(job.id, candidate.candidateId, engine.model_version, weights)
    return {**result, "assessments": [assess_evidence(match, context) for match in matches],
        "assessment_mode": "pending_review_only", "reviews_accepted": False}


def create_shadow_app(engine, token: str, *, timeout_seconds=30., max_body_bytes=131072):
    if not isinstance(token, str) or len(token) < 16:
        raise ValueError("A dedicated shadow token of at least 16 characters is required")
    if (type(timeout_seconds) not in (int, float) or not math.isfinite(timeout_seconds) or timeout_seconds <= 0
            or type(max_body_bytes) is not int or max_body_bytes < 1):
        raise ValueError("Positive bounded request settings required")
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ai1-shadow")
    @asynccontextmanager
    async def lifespan(_app):
        yield
        executor.shutdown(wait=True, cancel_futures=True)
    app = FastAPI(title="NexHire AI1 Shadow", version="1.0", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.busy = False

    @app.get("/health")
    async def health():
        return {"mode": "shadow", "ready": True, "busy": app.state.busy,
            "model_version": engine.model_version, "production_changed": False}

    @app.post("/api/v1/shadow/requirements")
    async def requirements(request: Request):
        return await handle_request(request, with_assessments=False)

    @app.post("/api/v1/shadow/assessments")
    async def assessments(request: Request):
        return await handle_request(request, with_assessments=True)

    async def handle_request(request: Request, *, with_assessments: bool):
        provided = request.headers.get("x-internal-service-token", "")
        if not secrets.compare_digest(provided.encode(), token.encode()):
            raise HTTPException(403, "Invalid internal service token")
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            raise HTTPException(415, "JSON snapshots required")
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > max_body_bytes:
                raise HTTPException(413, "Shadow request too large")
            chunks.append(chunk)
        try:
            payload = ShadowRequest.model_validate_json(b"".join(chunks))
        except ValidationError:
            # Do not echo personal fields or raw body in validation failures.
            raise HTTPException(422, "Invalid JD/CV snapshot") from None
        if with_assessments and (not payload.job.id.strip() or not payload.candidate.candidateId.strip()):
            raise HTTPException(422, "Nonempty JD/CV identities required")
        if app.state.busy:
            raise HTTPException(503, "Shadow encoder busy")
        app.state.busy = True
        loop = asyncio.get_running_loop()
        try:
            if with_assessments:
                future = loop.run_in_executor(executor, score_pending_assessments, engine, payload.job, payload.candidate)
            else:
                future = loop.run_in_executor(executor, engine.score, payload.job, payload.candidate)
        except Exception:
            app.state.busy = False
            raise HTTPException(503, "Shadow encoder unavailable") from None
        def finished(result):
            app.state.busy = False
            if not result.cancelled():
                result.exception()
        future.add_done_callback(finished)
        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            # Native inference is not killable: retain the busy slot until it
            # actually finishes, even after the HTTP deadline/client cancellation.
            raise HTTPException(504, "Shadow inference deadline exceeded") from None
        except ShadowInputError:
            raise HTTPException(422, "Invalid or oversized shadow input") from None
        except Exception:
            raise HTTPException(503, "Shadow encoder unavailable; no lexical fallback") from None
    return app


def create_app():
    manifest = os.environ.get("MATCHING_SHADOW_MANIFEST")
    token = os.environ.get("MATCHING_SHADOW_TOKEN", "")
    if not manifest or len(token) < 16:
        raise ValueError("Explicit shadow manifest and dedicated token required")
    engine = ShadowEncoder.from_manifest(manifest)
    return create_shadow_app(engine, token)
