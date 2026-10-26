"""Swappable local AI1 adapter, independent of scoring, transport and verifier."""

import asyncio
from functools import lru_cache

from app.matching.requirement_matcher import RequirementMatcher
from app.schemas.ai1 import Ai1Assessment, Ai1Component, Ai1Hit, Ai1Requirement
from app.schemas.jd_plan import digest, snapshot_digest, source_requirements, validate_plan


@lru_cache(maxsize=1)
def load_backend(manifest, manifest_sha256):
    # No experimental imports or network model discovery in application code.
    from app.matching.m1_runtime import LocalM1Runtime
    return LocalM1Runtime.from_manifest(manifest, manifest_sha256)


def _common(job, candidate, context):
    return dict(jobId=job.id, candidateId=candidate.candidateId, candidateCvId=candidate.candidateCvId,
        jobSnapshotSha256=snapshot_digest(job), candidateSnapshotSha256=digest(candidate.model_dump(mode='json')),
        planStatus=context.status)


def _matches(runtime, job, candidate):
    result = runtime.score(job, candidate)
    if (result['model_version'] != runtime.model_version
            or result['weights_sha256'] != runtime.manifest['weights_sha256']
            or result['automatically_supported'] is not False or result['candidate_rejected'] is not False
            or result['production_changed'] is not False):
        raise ValueError('AI1 model/safety provenance changed')
    expected = [(r.id, r.text) for r in source_requirements(job)]
    matches = result['requirements']
    if [(r['requirement']['id'], r['requirement']['text']) for r in matches] != expected:
        raise ValueError('Every original source requirement must be retained in order')
    source = {e.id: e.original_text or e.text for e in RequirementMatcher(None)._build_evidence(candidate)}
    for match in matches:
        hits = match['hits']
        if (match.get('automatically_supported') is not False or match.get('candidate_rejected') is not False
                or match.get('requires_manual_review') is not True
                or len(match['ranked_evidence_ids']) != len(set(match['ranked_evidence_ids']))
                or len(hits) > 3 or len({h['id'] for h in hits}) != len(hits)
                or [h['id'] for h in hits] != list(match['ranked_evidence_ids'][:len(hits)])
                or any(source.get(h['id']) != h['text'] for h in hits)):
            raise ValueError('AI1 quotes must match source sections and ranked Top3')
    return result


def _hits(match):
    return tuple(Ai1Hit(evidenceId=h['id'], source=h['source'], text=h['text'],
        similarityScore=h['comparison_score'], reasonCodes=h.get('reason_codes', ())) for h in match['hits'])


def assess_local(runtime, settings, job, candidate, context):
    plan = context.confirmed_plan
    if plan:
        validate_plan(plan, job)
        if plan.approval is None or plan.approval.origin != 'authenticated_hr':
            raise ValueError('Only the trusted current HR-confirmed plan may drive components')
    result = _matches(runtime, job, candidate)
    components, truncated = {}, result['diagnostics']['truncated_texts']
    if plan:
        requests = [(r.requirement_id, c) for r in plan.requirements for c in r.components]
        if len(requests) + len(plan.requirements) > 64:
            raise ValueError('Bounded AI1 requirement/component workload exceeded')
        component_job = job.model_copy(update={'skills': [], 'description': '',
            'requirements': '\n'.join(c.query for _, c in requests)})
        extra = _matches(runtime, component_job, candidate)
        if len(extra['requirements']) != len(requests):
            raise ValueError('Complete component retrieval required')
        truncated += extra['diagnostics']['truncated_texts']
        for (parent, component), match in zip(requests, extra['requirements']):
            if match['requirement']['text'] != component.query:
                raise ValueError('Component source query changed')
            components.setdefault(parent, []).append(Ai1Component(componentId=component.id,
                text=component.query, importance=component.importance, retrievalStatus=match['status'],
                evidence=_hits(match), reasonCodes=match['reason_codes']))
    plans = {r.requirement_id: r for r in plan.requirements} if plan else {}
    requirements = tuple(Ai1Requirement(requirementId=r['requirement']['id'], text=r['requirement']['text'],
        retrievalStatus=r['status'], evidence=_hits(r), reasonCodes=r['reason_codes'],
        components=tuple(components[r['requirement']['id']]) if plan else None,
        allOf=plans[r['requirement']['id']].all_of if plan else None,
        jointContextRequired=plans[r['requirement']['id']].joint_context_required if plan else None) for r in result['requirements'])
    return Ai1Assessment(**_common(job, candidate, context), status='READY', backend='local_m1',
        reason='RETRIEVED_EVIDENCE_REQUIRES_HR_REVIEW', modelVersion=runtime.model_version,
        weightsSha256=runtime.manifest['weights_sha256'], manifestSha256=settings.ai1_manifest_sha256,
        fixedPlan=plan, requirements=requirements, truncatedTexts=truncated)


async def assess_ai1(settings, job, candidate, context):
    backend = getattr(settings, 'ai1_backend', 'disabled')
    common = _common(job, candidate, context)
    if backend == 'disabled':
        return Ai1Assessment(**common, status='DISABLED', backend='disabled', reason='AI1_BACKEND_DISABLED')
    if settings.node_env not in {'development', 'test'}:
        return Ai1Assessment(**common, status='UNAVAILABLE', backend='local_m1',
            reason='SHADOW_MANIFEST_NOT_APPROVED_FOR_PRODUCTION')
    try:
        if backend != 'local_m1' or not settings.ai1_manifest_path or not settings.ai1_manifest_sha256:
            raise ValueError('Explicit AI1 backend and pinned manifest required')
        def infer():
            runtime = load_backend(settings.ai1_manifest_path, settings.ai1_manifest_sha256)
            return assess_local(runtime, settings, job, candidate, context)
        return await asyncio.to_thread(infer)
    except Exception:
        # Optional inference failure is explicit; no lexical or verifier fallback,
        # no exception text/paths/private input in persisted errors, no queue retry.
        return Ai1Assessment(**common, status='UNAVAILABLE', backend='local_m1', reason='AI1_BACKEND_UNAVAILABLE')
