"""Loopback-only synthetic-fixture assessment. Forbidden outside explicit test mode."""

import ipaddress
from urllib.parse import urlsplit

import httpx

from app.matching.requirement_matcher import RequirementMatcher
from app.schemas.jd_plan import content_digest, digest, snapshot_digest, source_requirements


def fixture_endpoint(settings, job_id, candidate_id):
    if settings.node_env != 'test' or not settings.enable_local_hr_test:
        raise ValueError('Local HR fixture adapter is forbidden outside explicit test mode')
    if (job_id not in settings.local_hr_test_job_ids.split(',')
            or candidate_id not in settings.local_hr_test_candidate_ids.split(',')):
        raise ValueError('Only explicitly allowlisted synthetic fixture identities are permitted')
    url = urlsplit(settings.local_hr_test_url or '')
    try:
        local = ipaddress.ip_address(url.hostname or '').is_loopback
        port = url.port
    except ValueError:
        local, port = False, None
    if (url.scheme != 'http' or not local or not port or url.username or url.password
            or url.query or url.fragment or url.path not in ('', '/')):
        raise ValueError('Only a literal loopback HTTP origin without credentials/path is permitted')
    if len(settings.local_hr_test_token or '') < 16 or len(settings.local_hr_test_weights_sha256 or '') != 64:
        raise ValueError('Dedicated local test token and frozen weights pin required')
    return settings.local_hr_test_url.rstrip('/') + '/api/v1/shadow/assessments'


async def assess_fixture(settings, job, candidate, context):
    endpoint = fixture_endpoint(settings, job.id, candidate.candidateId)
    # Do not honor machine proxy variables or redirects for candidate snapshots.
    async with httpx.AsyncClient(timeout=30, trust_env=False, follow_redirects=False) as client:
        response = await client.post(endpoint, headers={'x-internal-service-token': settings.local_hr_test_token},
            json={'job': job.model_dump(mode='json'), 'candidate': candidate.model_dump(mode='json')})
        response.raise_for_status()
        result = response.json()
    return validate_result(result, job, candidate, context, settings.local_hr_test_weights_sha256)


def validate_result(result, job, candidate, context, pin):
    if not isinstance(result, dict):
        raise ValueError('Local model response must be an object')
    expected = {'assessment_status': 'PENDING_REVIEW', 'automatically_supported': False,
        'candidate_rejected': False, 'reviews_accepted': False, 'hr_review_authenticated': False,
        'production_changed': False, 'weights_sha256': pin, 'job_id': job.id,
        'candidate_id': candidate.candidateId, 'job_snapshot_sha256': snapshot_digest(job),
        'candidate_snapshot_sha256': digest(candidate.model_dump(mode='json'))}
    if any(result.get(k) != v for k, v in expected.items()):
        raise ValueError('Local model identity/source/safety binding mismatch')
    plan_hash = content_digest(context.confirmed_plan) if context.confirmed_plan else None
    binding = result.get('jd_plan_context', {})
    if binding.get('status') != context.status or binding.get('content_sha256') != plan_hash:
        raise ValueError('Plan changed during inference')
    requirements = {r.id: r.text for r in source_requirements(job)}
    proposals = result.get('hr_proposals', [])
    if (len(proposals) != len(requirements) or
            {p['requirement']['id']: p['requirement']['text'] for p in proposals} != requirements):
        raise ValueError('Every original requirement must be preserved')
    sections = {e.id: e.original_text or e.text for e in RequirementMatcher(None)._build_evidence(candidate)}
    for proposal in proposals:
        for item in [proposal, *(proposal.get('component_proposals') or [])]:
            if item.get('verified_support') is not False or item.get('requires_hr_review') is not True:
                raise ValueError('Evidence support remains unverified')
            verifier = item.get('verifier', {})
            if verifier.get('assessment_status') != 'PENDING_REVIEW' or verifier.get('verified_support') is not False:
                raise ValueError('Verifier cannot self-confirm support')
            for hit in item.get('retrieved_evidence', []):
                if sections.get(hit['id']) != hit['text']:
                    raise ValueError('Evidence must match an original candidate section')
    if context.confirmed_plan:
        fixed = result.get('fixed_jd_plan', {})
        if (fixed.get('content_sha256') != plan_hash or fixed.get('requirements') !=
                [r.model_dump(mode='json') for r in context.confirmed_plan.requirements]):
            raise ValueError('Fixed requirement logic changed')
    elif any(p.get('component_analysis') != 'NOT_PERFORMED' for p in proposals):
        raise ValueError('Unconfirmed plan cannot become confirmed component analysis')
    return {'schema': 'local-hr-fixture-v1', 'assessment_status': 'PENDING_REVIEW',
        'synthetic_test_only': True, 'planStatus': context.status, 'planContentSha256': plan_hash,
        'candidate_support_verified': False, 'candidate_rejected': False, 'is_training_label': False,
        'aggregateScoreMeaning': 'LEGACY_BASELINE_NOT_AI2_NOT_REQUIREMENT_SUPPORT_PERCENT', 'inference': result}
