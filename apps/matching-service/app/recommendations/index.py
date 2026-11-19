"""Bounded public-JD encoder and PostgreSQL materialized vector cache."""

import asyncio
import logging
import re
from typing import Annotated, Literal

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db import engine
from app.matching.ai1 import load_backend, local_m1_guard
from app.recommendations.ranking import (
    MAX_DESCRIPTION,
    MAX_JOBS,
    MAX_REQUIREMENTS_TEXT,
    MAX_SKILL,
    MAX_SKILLS,
    MAX_TITLE,
    POLICY,
    PublicJob,
    RecommendationRequest,
    embed_texts,
    rank_jobs,
    unique_sections,
)

logger = logging.getLogger(__name__)
_LEASE_ID = 70832471
_INDEX_BATCH_SIZE = 4
_POLL_SECONDS = 30
_CACHE_LIMIT_PER_MODEL = 300
_VISIBLE_KEYS = '''
    unnest(CAST(:ids AS uuid[]), CAST(:digests AS text[])) AS source(job_id, digest)
'''
_PARTITION = 'entry.manifest_sha256 = :manifest AND entry.policy = :policy'
_JOIN_KEYS = 'entry.job_id = source.job_id AND entry.semantic_input_sha256 = source.digest'
_READ = text(f'''
    SELECT entry.job_id, entry.semantic_input_sha256, entry.vectors
    FROM job_recommendation_embeddings AS entry JOIN {_VISIBLE_KEYS} ON {_JOIN_KEYS}
    WHERE {_PARTITION}
''')
_READ_KEYS = text(f'''
    SELECT entry.job_id, entry.semantic_input_sha256
    FROM job_recommendation_embeddings AS entry JOIN {_VISIBLE_KEYS} ON {_JOIN_KEYS}
    WHERE {_PARTITION}
''')
_TOUCH = text(f'''
    UPDATE job_recommendation_embeddings AS entry SET last_seen_at = statement_timestamp()
    FROM {_VISIBLE_KEYS}
    WHERE {_JOIN_KEYS} AND {_PARTITION}
''')
_WRITE = text('''
    INSERT INTO job_recommendation_embeddings
        (job_id, semantic_input_sha256, manifest_sha256, policy, vectors)
    VALUES (:id, :digest, :manifest, :policy, CAST(:vectors AS real[]))
    ON CONFLICT (job_id, semantic_input_sha256, manifest_sha256, policy)
        DO UPDATE SET last_seen_at = statement_timestamp()
''')
_PURGE = text(f'''
    WITH expired AS (
        SELECT entry.ctid FROM job_recommendation_embeddings AS entry
        WHERE entry.last_seen_at < statement_timestamp() - interval '1 day'
        ORDER BY entry.last_seen_at LIMIT 400
    ), over_limit AS (
        SELECT entry.ctid FROM job_recommendation_embeddings AS entry
        WHERE {_PARTITION}
        ORDER BY entry.last_seen_at DESC, entry.job_id, entry.semantic_input_sha256
        OFFSET :cache_limit LIMIT 400
    )
    DELETE FROM job_recommendation_embeddings AS entry
    WHERE entry.ctid IN (SELECT ctid FROM expired UNION SELECT ctid FROM over_limit)
''')


class SyncJob(BaseModel):
    """Validate the existing Job projection before capping historical field lengths."""

    id: str
    title: str
    description: str
    requirements: str
    skills: list[str]
    publishedAt: str

    def limited(self) -> PublicJob:
        return PublicJob(id=self.id, title=self.title[:MAX_TITLE], description=self.description[:MAX_DESCRIPTION],
                         requirements=self.requirements[:MAX_REQUIREMENTS_TEXT],
                         skills=[skill[:MAX_SKILL] for skill in self.skills[:MAX_SKILLS]],
                         publishedAt=self.publishedAt)


class PublicPool(BaseModel):
    schemaVersion: Literal['public-recommendation-pool-v1']
    limit: Literal[100]
    truncated: bool
    items: Annotated[list[SyncJob], Field(max_length=MAX_JOBS)]


class RecommendationUnavailable(Exception):
    """A disabled, busy, or unavailable local recommendation dependency."""


class JobRecommendationIndex:
    def __init__(self):
        self._encoder_lock = asyncio.Lock()

    def _pinned(self, settings):
        if (not settings.local_job_recommendations_enabled or not settings.ai1_manifest_path
                or not re.fullmatch(r'[a-f0-9]{64}', settings.ai1_manifest_sha256 or '')):
            raise RecommendationUnavailable('Local recommendations unavailable')
        return {'manifest': settings.ai1_manifest_sha256, 'policy': POLICY}

    def _parameters(self, jobs, pins):
        keys = [job.embedding_key() for job in jobs]
        return {**pins, 'ids': [item[0] for item in keys], 'digests': [item[1] for item in keys]}

    def _embed_sync(self, settings, texts):
        with local_m1_guard(settings):
            runtime = load_backend(settings.ai1_manifest_path, settings.ai1_manifest_sha256)
            return embed_texts(runtime, texts)

    async def _embed(self, settings, texts):
        if self._encoder_lock.locked():
            raise RecommendationUnavailable('Local recommendations busy')
        async with self._encoder_lock:
            task = asyncio.create_task(asyncio.to_thread(self._embed_sync, settings, texts))
            try:
                return await asyncio.shield(task)
            except asyncio.CancelledError:
                # A cancelled await does not stop native inference. Keep admission closed until it ends.
                await asyncio.gather(task, return_exceptions=True)
                raise

    async def recommend(self, settings, dto: RecommendationRequest):
        pins = self._pinned(settings)
        response = {'status': 'EMPTY', 'modelVersion': 'm1:' + pins['manifest'],
                    'indexedCount': 0, 'items': []}
        sections = unique_sections(dto.sections)
        if not dto.jobs or not sections:
            return response
        async with engine.connect() as connection:
            rows = await connection.execute(_READ, self._parameters(dto.jobs, pins))
            stored = {(row.job_id, row.semantic_input_sha256): row.vectors for row in rows}
        response['indexedCount'] = len(stored)
        if len(stored) < min(dto.limit, len(dto.jobs)):
            response['status'] = 'INDEX_WARMING'
            return response
        vectors = await self._embed(settings, [section[1] for section in sections])
        response['status'] = 'READY' if len(stored) == len(dto.jobs) else 'READY_PARTIAL'
        response['items'] = rank_jobs(dto.jobs, stored, sections, vectors, dto.limit)
        return response

    async def _read_public_pool(self, settings):
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds, follow_redirects=False) as client:
            # The Job Service checks both the internal identity and the service token.
            response = await client.get(
                f"{settings.job_service_url.rstrip('/')}/api/v1/internal/jobs/recommendation-pool",
                headers={
                    'x-internal-service-token': settings.internal_service_token,
                    'x-user-id': 'matching-service',
                    'x-user-role': 'ADMIN',
                },
            )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or payload.get('success') is not True:
            raise ValueError('Invalid public job response')
        pool = PublicPool.model_validate(payload.get('data'))
        jobs = [item.limited() for item in pool.items]
        if len(jobs) != len({job.id for job in jobs}):
            raise ValueError('Duplicate job in public pool')
        return jobs

    async def reconcile(self, settings):
        pins = self._pinned(settings)
        async with engine.connect() as connection:
            acquired = await connection.scalar(text('SELECT pg_try_advisory_lock(:id)'), {'id': _LEASE_ID})
            try:
                await connection.commit()
                if not acquired:
                    return
                jobs = await self._read_public_pool(settings)
                parameters = self._parameters(jobs, pins)
                rows = await connection.execute(_READ_KEYS, parameters)
                indexed = {(row.job_id, row.semantic_input_sha256) for row in rows}
                await connection.execute(_TOUCH, parameters)
                await connection.commit()
                pending = [job for job in jobs if job.embedding_key() not in indexed]
                completed = 0
                for start in range(0, len(pending), _INDEX_BATCH_SIZE):
                    batch = pending[start:start + _INDEX_BATCH_SIZE]
                    chunks = [job.chunks() for job in batch]
                    try:
                        vectors = await self._embed(settings, [part for source in chunks for part in source])
                    except RecommendationUnavailable:
                        # Let an active candidate request finish. The next poll retries missing keys.
                        break
                    offset = 0
                    records = []
                    for job, source in zip(batch, chunks, strict=True):
                        job_id, digest = job.embedding_key()
                        end = offset + len(source)
                        records.append({**pins, 'id': job_id, 'digest': digest,
                                        'vectors': vectors[offset:end].ravel().tolist()})
                        offset = end
                    await connection.execute(_WRITE, records)
                    await connection.commit()
                    completed += len(records)
                    await asyncio.sleep(0)
                await connection.execute(_PURGE, {**pins, 'cache_limit': _CACHE_LIMIT_PER_MODEL})
                await connection.commit()
                logger.info('Public JD index listed=%d already_indexed=%d embedded=%d',
                            len(jobs), len(indexed), completed)
            finally:
                if acquired:
                    try:
                        await connection.rollback()
                        await connection.execute(text('SELECT pg_advisory_unlock(:id)'), {'id': _LEASE_ID})
                        await connection.commit()
                    except BaseException:
                        await connection.invalidate()
                        raise

    async def run(self, settings):
        delay = _POLL_SECONDS
        while True:
            try:
                await self.reconcile(settings)
                delay = _POLL_SECONDS
            except Exception as exc:
                # Do not log backend diagnostics containing source text or connection URLs.
                logger.warning('Public JD index sync unavailable (%s)', type(exc).__name__)
                delay = min(delay * 2, 120)
            await asyncio.sleep(delay)


recommendation_index = JobRecommendationIndex()
