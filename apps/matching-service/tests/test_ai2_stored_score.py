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


def test_disabled_does_not_read_explanation():
    value = result()
    value.explanation = None
    assert score_stored_result(value, None)['status'] == 'DISABLED'


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
