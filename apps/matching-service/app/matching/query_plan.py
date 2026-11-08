"""Explicit v2 retrieval entry point; existing v1 matching remains unchanged."""
from app.schemas.jd_plan import content_digest, digest
from app.schemas.jd_plan_v2 import validate_query_plan


class QueryTokenLimitError(ValueError):
    """A previously stored query requires source-quote splitting."""


def retrieve_query_plan(runtime, job, candidate, plan):
    """Only source-exact HR-confirmed queries may drive v2 retrieval.

    All query lengths are checked before inference, not silently truncated.
    Returned records bind to v2 source/component IDs, never synthetic skill IDs.
    """
    validate_query_plan(plan, job)
    if plan.approval is None or plan.approval.origin != 'authenticated_hr':
        raise ValueError('Trusted HR-confirmed v2 plan required')
    requests = [(s, c) for s in plan.sources if s.selected for c in s.components]
    texts = [c.query for _, c in requests]
    from app.matching.normalizer import normalize_semantic_text
    lengths = runtime.model.tokenizer(
        [normalize_semantic_text(t) for t in texts], truncation=False,
        add_special_tokens=True)['input_ids']
    if len(lengths) != len(texts) or any(len(ids) > 256 for ids in lengths):
        raise QueryTokenLimitError('V2 query exceeds pinned M1 token budget; split source quote before confirming')
    synthetic = job.model_copy(update={'skills': texts, 'requirements': '', 'description': ''})
    from app.matching.ai1 import _matches
    result = _matches(runtime, synthetic, candidate)
    if len(result['requirements']) != len(requests):
        raise ValueError('Complete v2 query retrieval required')
    return {
        'schema_version': 'jd-source-query-evidence-v2',
        'job_id': job.id,
        'candidate_id': candidate.candidateId,
        'candidate_cv_id': candidate.candidateCvId,
        'candidate_snapshot_sha256': digest(candidate.model_dump(mode='json')),
        'job_snapshot_sha256': plan.job_snapshot_sha256,
        'plan_content_sha256': content_digest(plan),
        'model_version': runtime.model_version,
        'weights_sha256': runtime.manifest['weights_sha256'],
        'truncated_texts': result.get('diagnostics', {}).get('truncated_texts', 0),
        'candidate_support_verified': False,
        'automatically_reject': False,
        'queries': [dict(source_id=s.source_id, component_id=c.id,
                         query=c.query, importance=c.importance,
                         retrieval_status=m['status'], evidence=m['hits'])
                    for (s, c), m in zip(requests, result['requirements'])],
    }
