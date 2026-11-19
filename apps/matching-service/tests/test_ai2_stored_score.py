from types import SimpleNamespace

from app.ranking.stored_score import score_stored_result
from app.ranking.demo_predictor import DemoScore
from test_ai2_observed_features import bundle


def result():
    assessment, job, candidate = bundle()
    return SimpleNamespace(id='result', application_id='app', job_id='j', candidate_id='c',
        candidate_cv_id='cv', status='SUCCEEDED', explanation={
            'inputSnapshots': {'job': job.model_dump(mode='json'), 'candidate': candidate.model_dump(mode='json')},
            'ai1Assessment': assessment.model_dump(mode='json'), 'scoreReferenceDate': '2026-10-18'})


def test_pool_common_date_preserves_frozen_chronology_and_saved_inputs():
    from copy import deepcopy
    seen = []

    class Predictor:
        def score(self, assessment, job, candidate, *, reference_date):
            seen.append(reference_date)
            return DemoScore('c', 'cv', 1.2, assessment.jobSnapshotSha256,
                             assessment.candidateSnapshotSha256, reference_date)

    first, second = result(), result()
    second.explanation['scoreReferenceDate'] = '2026-10-19'
    originals = [deepcopy(x.explanation) for x in (first, second)]
    outputs = [score_stored_result(x, Predictor(), pool_reference_date='2026-11-04')
               for x in (first, second)]
    assert all(x['status'] == 'READY' for x in outputs)
    assert {x['referenceDate'] for x in outputs} == {'2026-11-04'}
    assert seen == ['2026-10-18', '2026-10-19']
    assert [x['snapshotReferenceDate'] for x in outputs] == seen
    assert all(x['chronologyPolicy'] == 'FROZEN_SNAPSHOT_CHRONOLOGY_V1' for x in outputs)
    assert [x.explanation for x in (first, second)] == originals
    for invalid in ('2026-10-01', 'bad-date', '2026-2-3'):
        assert score_stored_result(second, Predictor(), pool_reference_date=invalid)['status'] == 'UNAVAILABLE'


def test_v2_invalid_unapproved_input_never_calls_predictor():
    from unittest.mock import Mock
    from app.schemas.jd_plan_v2 import draft_query_plan
    value = result()
    _, job, _ = bundle()
    value.explanation['ai1Assessment']['fixedPlan'] = draft_query_plan(job).model_dump(mode='json')
    predictor = Mock()
    output = score_stored_result(value, predictor)
    assert output['status'] == 'UNAVAILABLE'
    assert output['reason'] == 'STORED_INPUT_OR_ASSESSMENT_INCOMPATIBLE'
    assert output['score'] is None
    assert output['rankingPosition'] is None
    predictor.score.assert_not_called()


def test_compatible_v2_score_reports_saved_plan_without_rewriting_inputs():
    from copy import deepcopy
    from test_ai2_observed_features import query_bundle
    assessment, job, candidate = query_bundle()
    value = result()
    value.explanation['ai1Assessment'] = assessment.model_dump(mode='json')
    before = deepcopy(value.explanation)
    class Predictor:
        def score(self, assessment, job, candidate, *, reference_date):
            return DemoScore('c', 'cv', 1.2, assessment.jobSnapshotSha256,
                             assessment.candidateSnapshotSha256, reference_date)
    output = score_stored_result(value, Predictor())
    assert output['status'] == 'READY'
    assert output['inputContract'] == 'M1_REQUIREMENT_OBSERVATIONS_V1'
    assert output['planSchemaVersion'] == 'jd-source-query-v2'
    assert value.explanation == before


def test_valid_selected_subquote_is_scored_as_m1_observation():
    from unittest.mock import Mock
    from test_ai2_observed_features import query_bundle
    from app.schemas.jd_plan import content_digest
    assessment, job, candidate = query_bundle()
    plan = assessment.fixedPlan
    source = plan.sources[0]
    component = source.components[0].model_copy(update={'query': 'Pyth', 'source_quote': 'Pyth'})
    plan = plan.model_copy(update={'sources': (source.model_copy(update={'components': (component,)}),)})
    plan = plan.model_copy(update={'approval': plan.approval.model_copy(update={'content_sha256': content_digest(plan)})})
    requirement = assessment.requirements[0].model_copy(update={'text': 'Pyth'})
    assessment = assessment.model_copy(update={'fixedPlan': plan, 'requirements': (requirement,)})
    value = result()
    value.explanation['ai1Assessment'] = assessment.model_dump(mode='json')
    predictor = Mock()
    predictor.score.return_value = DemoScore('c', 'cv', 1.2, assessment.jobSnapshotSha256, assessment.candidateSnapshotSha256, '2026-10-18')
    output = score_stored_result(value, predictor)
    assert output['status'] == 'READY'
    assert output['inputContract'] == 'M1_REQUIREMENT_OBSERVATIONS_V1'
    predictor.score.assert_called_once()


def test_disabled_does_not_read_explanation():
    value = result()
    value.explanation = None
    assert score_stored_result(value, None)['status'] == 'DISABLED'


def test_m1_not_ready_never_calls_xgb_or_uses_chronology_fallback():
    from unittest.mock import Mock
    from copy import deepcopy
    values = [None]
    for status in ('PENDING', 'DISABLED', 'UNAVAILABLE', 'ERROR', 'FAILED'):
        raw = deepcopy(result().explanation['ai1Assessment'])
        raw['status'] = status
        values.append(raw)
    raw = deepcopy(result().explanation['ai1Assessment'])
    raw['requirements'][0].update(retrievalStatus='SCORER_UNAVAILABLE', evidence=[])
    values.append(raw)
    for raw in values:
        value = result()
        value.explanation['ai1Assessment'] = raw
        predictor = Mock()
        assert score_stored_result(value, predictor)['reason'] == 'M1_NOT_READY'
        predictor.score.assert_not_called()


def test_stored_identity_change_fails_closed():
    value = result()
    value.candidate_cv_id = 'foreign'
    assert score_stored_result(value, object())['status'] == 'UNAVAILABLE'


def test_optional_reading_span_survives_saved_result_without_changing_score():
    seen = []

    class Predictor:
        def score(self, assessment, job, candidate, *, reference_date):
            seen.append(assessment.requirements[0].evidence[0].relevantSpan)
            return DemoScore('c', 'cv', 1.2, assessment.jobSnapshotSha256,
                             assessment.candidateSnapshotSha256, reference_date)

    value = result()
    baseline = score_stored_result(value, Predictor())
    hit = value.explanation['ai1Assessment']['requirements'][0]['evidence'][0]
    hit['relevantSpan'] = hit['text']
    assert score_stored_result(value, Predictor()) == baseline
    assert seen == [None, hit['text']]
    assert baseline['status'] == 'READY'
    assert baseline['rankingPosition'] is None


def test_stored_sources_score_without_rank_or_hiring_decision():
    class Predictor:
        def score(self, assessment, job, candidate, *, reference_date):
            return DemoScore('c', 'cv', 1.2, assessment.jobSnapshotSha256,
                             assessment.candidateSnapshotSha256, reference_date)
    output = score_stored_result(result(), Predictor())
    assert output['status'] == 'READY'
    assert output['score'] == 1.2
    assert output['rankingPosition'] is None
    assert output['hiringDecision'] is None


def test_current_cv_freshness_reuses_parsed_converter_and_rejects_changed_source(monkeypatch):
    import asyncio
    from copy import deepcopy
    from uuid import UUID
    from unittest.mock import AsyncMock
    from app.matching.service import revalidate_current_cv as _revalidate_current_cv
    from app.clients.internal import InternalClient
    from app.matching.service import MatchingService
    uid, cid, cvid, did = [UUID(f'00000000-0000-4000-8000-{i:012d}') for i in range(1, 5)]
    payload = {'profile': {'summary': 'Python'}, 'skills': [{'name': 'Python'}]}
    request = SimpleNamespace(candidate_id=cid, candidate_user_id=uid, candidate_cv_id=cvid, cv_document_id=did, parsed_resume=payload)
    stored = MatchingService._candidate_from_parsed_resume(request)
    value = SimpleNamespace(candidate_id=cid, candidate_cv_id=cvid, explanation={'inputSnapshots': {
        'job': bundle()[1].model_dump(mode='json'), 'candidate': stored.model_dump(mode='json')}})
    active = {'candidateId': str(cid), 'candidateUserId': str(uid), 'candidateCvId': str(cvid), 'cvDocumentId': str(did), 'cvParseStatus': 'PARSED'}
    parsed = {'id': str(did), 'parseRequestId': str(uid), 'candidateId': str(cid), 'candidateCvId': str(cvid), 'documentId': str(did), 'normalizedPayload': payload, 'createdAt': '2026-11-18T06:00:00Z'}
    read = AsyncMock(return_value=(active, parsed))
    monkeypatch.setattr(InternalClient, '__init__', lambda self: None)
    monkeypatch.setattr(InternalClient, 'get_current_cv_parse_source', read)
    assert asyncio.run(_revalidate_current_cv(value, request))['currentCvRevalidated'] is True
    changed = deepcopy(parsed)
    changed['normalizedPayload']['skills'].append({'name': 'Docker'})
    read.return_value = active, changed
    assert asyncio.run(_revalidate_current_cv(value, request))['reason'] == 'CURRENT_CV_CHANGED'
    read.side_effect = RuntimeError('unavailable')
    assert asyncio.run(_revalidate_current_cv(value, request))['reason'] == 'CURRENT_CV_UNAVAILABLE'
