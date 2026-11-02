"""Standalone synthetic-input demo API; never mounted on production main app."""
import asyncio
import secrets

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.ai1 import Ai1Assessment
from app.schemas.snapshots import JobMatchingSnapshot, CandidateMatchingSnapshot
from app.ranking.demo_predictor import order_demo_pool


class DemoCandidate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    snapshot: CandidateMatchingSnapshot
    assessment: Ai1Assessment


class DemoRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    job: JobMatchingSnapshot
    candidates: list[DemoCandidate] = Field(min_length=1, max_length=50)
    reference_date: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')


def create_demo_app(predictor, *, token, node_env='production'):
    """Explicit test/dev factory over caller-supplied synthetic snapshots.

    Token is not HR/company authorization. Do not expose through gateway until
    ownership-bound server-side snapshot loading replaces caller-supplied input.
    No DB, broker, model training or AI1 inference started by this factory.
    """
    if node_env not in {'development', 'test'} or not isinstance(token, str) or len(token) < 32:
        raise ValueError('development/test and dedicated token of at least32characters required')
    app = FastAPI(title='NexHire AI2 isolated demo', docs_url=None, redoc_url=None, openapi_url=None)

    @app.post('/api/v1/demo/ranking')
    async def rank(request: DemoRequest, x_demo_token: str = Header(default='')):
        if not secrets.compare_digest(x_demo_token, token):
            raise HTTPException(status_code=403, detail='Forbidden')
        if predictor is None:
            return {'status': 'DISABLED', 'experimental': True, 'items': []}
        def compute():
            scores = [predictor.score(item.assessment, request.job, item.snapshot,
                      reference_date=request.reference_date) for item in request.candidates]
            return order_demo_pool(scores)
        try:
            ordered = await asyncio.to_thread(compute)
        except (ValueError, TypeError):
            return {'status': 'UNAVAILABLE', 'reason': 'INCOMPATIBLE_INPUT_OR_ASSESSMENT',
                    'experimental': True, 'items': []}
        return {'status': 'READY', 'experimental': True,
                'scoreMeaning': 'RELATIVE_RANKING_SCORE', 'poolSize': len(ordered),
                'attributionStatus': 'UNAVAILABLE',
                'notice': 'Experimental ordering; no proven advantage over semantic baseline; HR review required.',
                'items': [{'rank': index + 1, 'candidateId': item.candidate_id,
                           'candidateCvId': item.candidate_cv_id, 'score': item.score,
                           'modelVersion': item.model_version,
                           'jobSnapshotSha256': item.job_snapshot_sha256,
                           'candidateSnapshotSha256': item.candidate_snapshot_sha256,
                           'referenceDate': item.reference_date}
                          for index, item in enumerate(ordered)]}
    return app
