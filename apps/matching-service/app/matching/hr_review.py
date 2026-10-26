"""Allowlisted result projection, separate from legacy aggregate score contracts."""

from pydantic import ValidationError

from app.schemas.jd_plan import JobRequirementPlan, content_digest
from app.schemas.jd_plan import digest, snapshot_digest, source_requirements, validate_plan
from app.schemas.ai1 import Ai1Assessment
from app.schemas.match_result import MatchingInputSnapshots
from app.matching.requirement_matcher import RequirementMatcher
from app.schemas.hr_review import (
    HrReviewSnapshot, ReviewComponent, ReviewEvidence, ReviewRequirement,
)


def _evidence(values):
    if not isinstance(values, list):
        raise ValueError('Stored evidence must be an array')
    return tuple(ReviewEvidence(evidenceId=h['id'], source=h['source'], text=h['text'],
        similarityScore=h['comparison_score'], reasonCodes=h.get('reason_codes', ())) for h in values)


def _proposal(value):
    if value.get('verified_support') is not False or value.get('requires_hr_review') is not True:
        raise ValueError('Stored proposal cannot confirm itself')
    verifier = value['verifier']
    if verifier.get('assessment_status') != 'PENDING_REVIEW' or verifier.get('verified_support') is not False:
        raise ValueError('Stored verifier output must stay unverified')
    return verifier['model_suggestion']


def _fixed_requirements(fixed, inference, job_id, plan_hash):
    # Recompute the stored content binding; equal, unvalidated hash labels are insufficient.
    plan = JobRequirementPlan.model_validate(dict(schema_version=fixed['schema'], job_id=job_id,
        job_snapshot_sha256=fixed['job_snapshot_sha256'], revision=fixed['revision'],
        requirements=fixed['requirements']))
    if (content_digest(plan) != plan_hash or fixed['content_sha256'] != plan_hash
            or plan.job_snapshot_sha256 != inference['job_snapshot_sha256']
            or fixed['confirmation_origin'] != 'authenticated_hr'
            or fixed['component_support_verified'] is not False
            or fixed['logical_coverage_automatically_confirmed'] is not False):
        raise ValueError('Invalid fixed plan binding')
    plans = {r.requirement_id: r.model_dump(mode='json') for r in plan.requirements}
    if len(plans) != len(plan.requirements):
        raise ValueError('Duplicate fixed requirements')
    for source in plans.values():
        ids = [c['id'] for c in source['components']]
        queries = [c['query'] for c in source['components']]
        if len(set(queries)) != len(queries):
            raise ValueError('Unique fixed component queries required')
        if any(not c['source_quote'].strip() or c['source_quote'] not in source['original_text']
                for c in source['components']):
            raise ValueError('Exact original JD quote required')
        groups = source['all_of']
        if (len(set(ids)) != len(ids)
                or any(not g or len(set(g)) != len(g) or not set(g) <= set(ids) for g in groups)
                or {i for g in groups for i in g} != set(ids)
                or len({frozenset(g) for g in groups}) != len(groups)):
            raise ValueError('Invalid fixed component logic')
    return plans


def _ai1_projection(raw, result, explanation, values):
    try:
        assessment = Ai1Assessment.model_validate(raw)
        if (assessment.jobId != values['jobId'] or assessment.candidateId != values['candidateId']
                or assessment.candidateCvId != values['candidateCvId']):
            raise ValueError('AI1 identity changed')
        snapshots = MatchingInputSnapshots.model_validate(explanation['inputSnapshots'])
        job, candidate = snapshots.job, snapshots.candidate
        if (job.id != assessment.jobId or candidate.candidateId != assessment.candidateId
                or candidate.candidateCvId != assessment.candidateCvId
                or snapshot_digest(job) != assessment.jobSnapshotSha256
                or digest(candidate.model_dump(mode='json')) != assessment.candidateSnapshotSha256):
            raise ValueError('AI1 source snapshot changed')
        if assessment.status != 'READY':
            return HrReviewSnapshot(**dict(values,
                assessmentStatus='NOT_PERFORMED' if assessment.status == 'DISABLED' else 'UNAVAILABLE',
                reason='AI1_BACKEND_DISABLED' if assessment.status == 'DISABLED' else 'AI1_BACKEND_UNAVAILABLE',
                assessmentSource='M1_RETRIEVAL')).model_dump(mode='json')
        if [(r.requirementId, r.text) for r in assessment.requirements] != [(r.id, r.text) for r in source_requirements(job)]:
            raise ValueError('AI1 original requirements changed')
        plan = assessment.fixedPlan
        if plan:
            validate_plan(plan, job)
            if (assessment.planStatus != 'HR_CONFIRMED' or not plan.approval
                    or plan.approval.origin != 'authenticated_hr'):
                raise ValueError('AI1 plan is not a trusted HR confirmation')
        elif assessment.planStatus == 'HR_CONFIRMED':
            raise ValueError('Confirmed AI1 plan missing')
        planned = {r.requirement_id: r for r in plan.requirements} if plan else {}
        sections = {e.id: (e.source, e.original_text or e.text) for e in RequirementMatcher(None)._build_evidence(candidate)}

        def evidence(hits):
            if len(hits) > 3 or len({h.evidenceId for h in hits}) != len(hits):
                raise ValueError('Bounded unique Top3 required')
            if any(sections.get(h.evidenceId) != (h.source, h.text) for h in hits):
                raise ValueError('AI1 quote differs from supplied CV')
            return tuple(ReviewEvidence(**h.model_dump(mode='json')) for h in hits)

        requirements = []
        for item in assessment.requirements:
            components = None
            if plan:
                expected = planned[item.requirementId]
                if (item.allOf != expected.all_of or item.jointContextRequired != expected.joint_context_required
                        or item.components is None
                        or [(c.componentId, c.text, c.importance) for c in item.components] !=
                           [(c.id, c.query, c.importance) for c in expected.components]):
                    raise ValueError('AI1 fixed component structure changed')
                components = tuple(ReviewComponent(componentId=c.componentId, text=c.text,
                    importance=c.importance, modelSuggestion=None, retrievalStatus=c.retrievalStatus,
                    reasonCodes=c.reasonCodes, evidence=evidence(c.evidence)) for c in item.components)
            elif item.components is not None or item.allOf is not None or item.jointContextRequired is not None:
                raise ValueError('Unconfirmed AI1 plan cannot drive components')
            requirements.append(ReviewRequirement(requirementId=item.requirementId, text=item.text,
                modelSuggestion=None, retrievalStatus=item.retrievalStatus, evidence=evidence(item.evidence),
                reasonCodes=item.reasonCodes, jointContextRequired=item.jointContextRequired,
                componentAnalysis='FIXED_PLAN_RETRIEVAL' if plan else 'NOT_PERFORMED',
                allOf=item.allOf, components=components))
        return HrReviewSnapshot(**dict(values, assessmentStatus='PENDING_REVIEW',
            reason='AI1_EVIDENCE_REQUIRES_HR_REVIEW', assessmentSource='M1_RETRIEVAL',
            planStatus=assessment.planStatus, planContentSha256=content_digest(plan) if plan else None,
            retrievalModelVersion=assessment.modelVersion, verifierModelVersion=None,
            retrievalWarnings=('M1_CONTEXT_TRUNCATED',) if assessment.truncatedTexts else (),
            jobSnapshotSha256=assessment.jobSnapshotSha256,
            candidateSnapshotSha256=assessment.candidateSnapshotSha256,
            requirements=tuple(requirements))).model_dump(mode='json')
    except (AttributeError, KeyError, TypeError, ValueError, ValidationError):
        return HrReviewSnapshot(**dict(values, assessmentStatus='UNAVAILABLE',
            reason='INVALID_STORED_AI1_ASSESSMENT', assessmentSource='M1_RETRIEVAL')).model_dump(mode='json')


def hr_review_snapshot(result, *, include_baseline=False):
    status = result.status.value
    explanation = result.explanation if result.explanation is not None else {}
    values = dict(resultId=str(result.id), applicationId=str(result.application_id) if result.application_id else None,
        jobId=str(result.job_id), candidateId=str(result.candidate_id), executionStatus=status,
        candidateCvId=str(result.candidate_cv_id) if getattr(result, 'candidate_cv_id', None) else None,
        assessmentStatus='UNAVAILABLE' if status != 'SUCCEEDED' else 'NOT_PERFORMED',
        reason='MATCHING_REQUEST_FAILED' if status != 'SUCCEEDED' else 'NO_SEPARATE_HR_ASSESSMENT')
    if not isinstance(explanation, dict):
        values.update(assessmentStatus='UNAVAILABLE', reason='INVALID_STORED_HR_ASSESSMENT')
        return HrReviewSnapshot(**values).model_dump(mode='json')
    # Compatibility query parameter is ignored: archived baseline diagnostics stay hidden.
    if explanation.get('ai1Assessment') is not None and status == 'SUCCEEDED':
        return _ai1_projection(explanation['ai1Assessment'], result, explanation, values)
    assessment = explanation.get('localHrFixtureAssessment')
    if assessment is None or status != 'SUCCEEDED':
        return HrReviewSnapshot(**values).model_dump(mode='json')
    try:
        if (assessment.get('schema') != 'local-hr-fixture-v1' or assessment.get('synthetic_test_only') is not True
                or assessment.get('assessment_status') != 'PENDING_REVIEW'
                or assessment.get('candidate_support_verified') is not False
                or assessment.get('candidate_rejected') is not False or assessment.get('is_training_label') is not False):
            raise ValueError('Unsafe stored assessment')
        inference = assessment['inference']
        if (inference.get('job_id') != values['jobId'] or inference.get('candidate_id') != values['candidateId']
                or inference.get('automatically_supported') is not False
                or inference.get('candidate_rejected') is not False
                or inference.get('assessment_status') != 'PENDING_REVIEW'):
            raise ValueError('Wrong assessment identity or safety flags')
        if not isinstance(inference['hr_proposals'], list):
            raise ValueError('Stored proposals must be an array')
        state = assessment['planStatus']
        if state not in {'UNPREPARED', 'DRAFT', 'HR_CONFIRMED', 'STALE', 'INVALID', 'UNAVAILABLE', 'ASSISTANT_REVIEWED'}:
            raise ValueError('Unknown plan state')
        fixed = inference.get('fixed_jd_plan') or {}
        confirmed = state == 'HR_CONFIRMED'
        if confirmed and (not assessment.get('planContentSha256') or fixed.get('content_sha256') != assessment['planContentSha256']):
            raise ValueError('Missing fixed plan binding')
        plans = _fixed_requirements(fixed, inference, values['jobId'], assessment['planContentSha256']) if confirmed else {}
        binding = inference['jd_plan_context']
        if (binding['status'] != state
                or binding['content_sha256'] != (assessment.get('planContentSha256') if confirmed else None)):
            raise ValueError('Inference plan context changed')
        if confirmed and set(plans) != {p['requirement']['id'] for p in inference['hr_proposals']}:
            raise ValueError('Fixed requirement set changed')
        requirements = []
        for item in inference['hr_proposals']:
            identifier = item['requirement']['id']
            components, groups = None, None
            if confirmed:
                source = plans[identifier]
                if (item['requirement']['text'] != source['original_text']
                        or item.get('component_analysis') != 'PREPARED_JD_PLAN_UNVERIFIED_PROPOSALS'):
                    raise ValueError('Fixed requirement changed')
                raw_components = item['component_proposals']
                if not isinstance(raw_components, list):
                    raise ValueError('Stored components must be an array')
                expected = {c['id']: c for c in source['components']}
                if len(raw_components) != len(expected) or {g['group_id'] for g in raw_components} != set(expected):
                    raise ValueError('Component set changed')
                if any(g['requirement']['text'] != expected[g['group_id']]['query']
                        or g['requirement']['id'] != identifier + '/component/' + g['group_id']
                        for g in raw_components):
                    raise ValueError('Fixed component query changed')
                components = tuple(ReviewComponent(componentId=g['group_id'], text=g['requirement']['text'],
                    importance=expected[g['group_id']]['importance'], modelSuggestion=_proposal(g),
                    evidence=_evidence(g['retrieved_evidence'])) for g in raw_components)
                groups = source['all_of']
            elif item.get('component_analysis') != 'NOT_PERFORMED':
                raise ValueError('Unconfirmed structure cannot drive component analysis')
            requirements.append(ReviewRequirement(requirementId=identifier, text=item['requirement']['text'],
                modelSuggestion=_proposal(item), evidence=_evidence(item['retrieved_evidence']),
                componentAnalysis='FIXED_PLAN_UNVERIFIED_PROPOSALS' if confirmed else 'NOT_PERFORMED',
                jointContextRequired=plans[identifier]['joint_context_required'] if confirmed else None,
                allOf=groups, components=components))
        if len({r.requirementId for r in requirements}) != len(requirements):
            raise ValueError('Duplicate requirements')
        projected = dict(values, assessmentStatus='PENDING_REVIEW', reason='MODEL_PROPOSALS_REQUIRE_HR_REVIEW',
            planStatus=state, planContentSha256=assessment.get('planContentSha256') if confirmed else None,
            syntheticTestOnly=True, retrievalModelVersion=inference['model_version'],
            assessmentSource='VERIFIER_DIAGNOSTIC',
            jobSnapshotSha256=inference.get('job_snapshot_sha256'),
            candidateSnapshotSha256=inference.get('candidate_snapshot_sha256'),
            verifierModelVersion=inference['verifier_version'], requirements=tuple(requirements))
        return HrReviewSnapshot(**projected).model_dump(mode='json')
    except (AttributeError, KeyError, TypeError, ValueError, ValidationError):
        values.update(assessmentStatus='UNAVAILABLE', reason='INVALID_STORED_HR_ASSESSMENT')
        return HrReviewSnapshot(**values).model_dump(mode='json')
