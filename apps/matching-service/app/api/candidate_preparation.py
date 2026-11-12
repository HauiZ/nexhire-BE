"""Private stateless preparation from public JD and owner-verified parsed CV.

No application/result persistence, HR plans, ranking or provider calls.
"""
import asyncio
from threading import BoundedSemaphore
from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.matching import require_internal_service
from app.config import get_settings
from app.matching.ai1 import load_backend, _matches
from app.matching.normalizer import normalize_semantic_text
from app.matching.service import MatchingService
from app.schemas.jd_plan import digest, snapshot_digest
from app.schemas.jd_sections import suggest_job_sections
from app.schemas.snapshots import JobMatchingSnapshot

router = APIRouter(prefix='/internal/candidate-preparation', tags=['candidate-preparation'])
# Bound optional preparation work per process without queueing unbounded encoder requests.
_preparation_slot = BoundedSemaphore(1)


class PreparationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    job: JobMatchingSnapshot
    candidate_id: UUID
    candidate_cv_id: UUID
    parsed_resume: dict = Field(max_length=30)


def prepare(runtime, dto):
    import json
    if len(json.dumps(dto.job.model_dump(mode='json'), ensure_ascii=False)) > 100000:
        raise ValueError('Public JD exceeds preparation budget')
    if len(json.dumps(dto.parsed_resume, ensure_ascii=False)) > 150000:
        raise ValueError('Parsed CV exceeds preparation budget')
    if not isinstance(dto.parsed_resume.get('profile', {}), dict):
        raise ValueError('Invalid parsed profile')
    for field in ('skills', 'experiences', 'educations', 'certifications', 'projects'):
        records = dto.parsed_resume.get(field, [])
        if not isinstance(records, list) or len(records) > 100 or any(not isinstance(x, dict) for x in records):
            raise ValueError('Invalid or oversized parsed records')
    candidate = MatchingService._candidate_from_parsed_resume(None, SimpleNamespace(
        parsed_resume=dto.parsed_resume, candidate_id=dto.candidate_id,
        candidate_user_id=None, candidate_cv_id=dto.candidate_cv_id))
    selected = [x for x in suggest_job_sections(dto.job) if x.selected_for_retrieval]
    if not 1 <= len(selected) <= 32:
        raise ValueError('Preparation supports 1–32 public requirements')
    queries = [x.block.text for x in selected]
    lengths = runtime.model.tokenizer([normalize_semantic_text(q) for q in queries], truncation=False, add_special_tokens=True)['input_ids']
    if any(len(x) > 256 for x in lengths):
        raise ValueError('Public requirement too long for preparation')
    synthetic = dto.job.model_copy(update={'skills': queries, 'requirements': '', 'description': ''})
    result = _matches(runtime, synthetic, candidate)
    if len(result['requirements']) != len(selected):
        raise ValueError('Incomplete public requirement retrieval')
    rows = []
    for item, match in zip(selected, result['requirements']):
        hits = match['hits']
        rows.append({'requirement': item.block.text, 'importance': item.block.importance,
            'status': 'REVIEW_REFERENCES' if hits else 'NO_REFERENCE_FOUND',
            'evidence': [{'id': h['id'], 'source': h['source'], 'text': h['text']} for h in hits],
            'prompt': 'Review these references. If you have relevant experience, describe the project, your actions and outcomes truthfully.' if hits
                else 'No reference was retrieved from this parsed CV. This does not establish missing ability. Add relevant experience only if true.'})
    warnings = []
    if not candidate.experiences and not candidate.projects:
        warnings.append('NO_EXPERIENCE_OR_PROJECT_RECORDS')
    if result.get('diagnostics', {}).get('truncated_texts'):
        warnings.append('CV_EVIDENCE_CONTEXT_TRUNCATED')
    return {'schemaVersion': 'candidate-preparation-v1', 'status': 'READY',
        'jobId': dto.job.id, 'candidateCvId': str(dto.candidate_cv_id),
        'jobSnapshotSha256': snapshot_digest(dto.job),
        'cvSnapshotSha256': digest(candidate.model_dump(mode='json')),
        'private': True, 'applicationCreated': False, 'candidateSupportVerified': False,
        'requirements': rows, 'warnings': warnings}


@router.post('', dependencies=[Depends(require_internal_service)])
async def candidate_preparation(dto: PreparationRequest):
    settings = get_settings()
    if settings.ai1_backend != 'local_m1' or settings.node_env not in {'development', 'test'}:
        raise HTTPException(status_code=503, detail='Preparation AI unavailable')
    try:
        def run():
            if not _preparation_slot.acquire(blocking=False):
                raise HTTPException(status_code=503, detail='Preparation busy; retry shortly')
            try:
                runtime = load_backend(settings.ai1_manifest_path, settings.ai1_manifest_sha256)
                return prepare(runtime, dto)
            finally:
                _preparation_slot.release()
        return {'success': True, 'data': await asyncio.to_thread(run)}
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=422, detail='Review public JD/parsed CV bounds before preparing') from None
    except Exception:
        raise HTTPException(status_code=503, detail='Preparation AI unavailable') from None
