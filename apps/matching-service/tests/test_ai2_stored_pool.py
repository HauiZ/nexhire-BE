from app.ranking.stored_pool import rank_stored_pool
from app.ranking.demo_predictor import MODEL_VERSION
from app.schemas.jd_plan import snapshot_digest
from test_ai2_observed_features import bundle


def pool():
    _, job, _ = bundle()
    base = dict(status='READY', jobId=job.id, jobSnapshotSha256=snapshot_digest(job),
                referenceDate='2026-10-30', modelVersion=MODEL_VERSION, candidateCvId='cv', resultId='r')
    return job, [dict(base, applicationId='a', candidateId='a', score=1.0),
                 dict(base, applicationId='b', candidateId='b', score=2.0)]


def test_order_and_ties():
    job, scores = pool()
    output = rank_stored_pool(scores, job)
    assert [x['applicationId'] for x in output['items']] == ['b', 'a']
    scores[0]['score'] = 2.0
    output = rank_stored_pool(scores, job)
    assert [x['rankingPosition'] for x in output['items']] == [1, 1]
    assert 'score' not in output['items'][0]


def test_missing_mixed_stale_and_single_fail_closed():
    job, scores = pool()
    assert rank_stored_pool(scores[:1], job)['reason'] == 'NEED_MORE_APPLICATIONS'
    for field, value, reason in [('status', 'UNAVAILABLE', 'RESULTS_NOT_READY'),
        ('referenceDate', '2026-10-29', 'INCOMPATIBLE_SNAPSHOTS_OR_DATES'),
        ('candidateId', 'a', 'DUPLICATE_APPLICATION_OR_CANDIDATE')]:
        changed = [dict(x) for x in scores]
        changed[1][field] = value
        assert rank_stored_pool(changed, job)['reason'] == reason
    assert rank_stored_pool(scores, job.model_copy(update={'title': 'Changed'}))['reason'] == 'STALE_JOB_SNAPSHOT'


def test_frozen_snapshot_policy_allows_different_observation_dates():
    job, scores = pool()
    for score, observed in zip(scores, ('2026-10-29', '2026-10-30')):
        score.update(chronologyPolicy='FROZEN_SNAPSHOT_CHRONOLOGY_V1',
                     snapshotReferenceDate=observed)
    assert rank_stored_pool(scores, job)['status'] == 'READY'
    scores[1].pop('chronologyPolicy')
    assert rank_stored_pool(scores, job)['reason'] == 'INCOMPATIBLE_SNAPSHOTS_OR_DATES'


def test_disabled_no_current_job_needed():
    assert rank_stored_pool([dict(status='DISABLED')], None)['status'] == 'DISABLED'
