"""Server orchestration boundaries; fake resolver is not ownership integration."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ranking.authorized_pool import AuthorizedApplication, rank_authorized_pool
from app.ranking.demo_predictor import DemoScore
from test_ai2_observed_features import bundle


def resolver():
    assessment, job, candidate = bundle()
    return SimpleNamespace(
        authorize_pool=AsyncMock(return_value=(AuthorizedApplication('a', 'j', 'c', 'cv'),)),
        load_job=AsyncMock(return_value=job), load_candidate=AsyncMock(return_value=candidate),
        load_assessment=AsyncMock(return_value=assessment))


def run(source, predictor=None):
    return asyncio.run(rank_authorized_pool(source, predictor, actor_id='hr', job_id='j',
        application_ids=('a',), reference_date='2026-10-18'))


def test_disabled_still_authorizes_without_loading_private_snapshots():
    source = resolver()
    assert run(source)['status'] == 'DISABLED'
    source.authorize_pool.assert_awaited_once()
    source.load_candidate.assert_not_awaited()
    source.load_job.assert_not_awaited()


def test_foreign_application_denial_never_loads_snapshots():
    source = resolver()
    source.authorize_pool.side_effect = PermissionError('foreign company')
    with pytest.raises(PermissionError):
        run(source)
    source.load_candidate.assert_not_awaited()


def test_authorized_pool_result():
    class Predictor:
        def score(self, assessment, job, candidate, *, reference_date):
            return DemoScore('c', 'cv', 0.7, assessment.jobSnapshotSha256,
                             assessment.candidateSnapshotSha256, reference_date)
    result = run(resolver(), Predictor())
    assert result['items'][0]['applicationId'] == 'a'
    assert result['items'][0]['rank'] == 1


def test_wrong_job_in_authorized_records_refused():
    source = resolver()
    source.authorize_pool.return_value = (AuthorizedApplication('a', 'foreign', 'c', 'cv'),)
    with pytest.raises(ValueError):
        run(source)
    source.load_job.assert_not_awaited()


def test_changed_submitted_cv_refused():
    source = resolver()
    source.load_candidate.return_value = source.load_candidate.return_value.model_copy(update={'candidateCvId': 'other'})
    with pytest.raises(ValueError, match='candidate/CV'):
        run(source, object())
    source.load_assessment.assert_not_awaited()
