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


def test_disabled_does_not_read_explanation():
    value = result()
    value.explanation = None
    assert score_stored_result(value, None)['status'] == 'DISABLED'


def test_stored_identity_change_fails_closed():
    value = result()
    value.candidate_cv_id = 'foreign'
    assert score_stored_result(value, object())['status'] == 'UNAVAILABLE'


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
