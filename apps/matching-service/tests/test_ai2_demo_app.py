"""Isolated HTTP contract, not gateway/company-ownership or real UI acceptance."""
from fastapi.testclient import TestClient
import pytest

from app.ranking.demo_app import create_demo_app
from app.ranking.demo_predictor import DemoScore
from test_ai2_observed_features import bundle

TOKEN = 'synthetic-demo-token-with-32-characters'


def payload():
    assessment, job, candidate = bundle()
    return {'job': job.model_dump(mode='json'), 'reference_date': '2026-10-18',
        'candidates': [{'snapshot': candidate.model_dump(mode='json'),
                        'assessment': assessment.model_dump(mode='json')}]}


def test_auth_and_default_disabled():
    client = TestClient(create_demo_app(None, token=TOKEN, node_env='test'))
    assert client.post('/api/v1/demo/ranking', json=payload()).status_code == 403
    result = client.post('/api/v1/demo/ranking', json=payload(), headers={'x-demo-token': TOKEN}).json()
    assert result['status'] == 'DISABLED'


def test_response_score_meaning_and_no_internal_vector():
    class Predictor:
        def score(self, assessment, job, candidate, *, reference_date):
            return DemoScore(candidate.candidateId, candidate.candidateCvId, 0.7,
                             assessment.jobSnapshotSha256, assessment.candidateSnapshotSha256, reference_date)
    client = TestClient(create_demo_app(Predictor(), token=TOKEN, node_env='test'))
    result = client.post('/api/v1/demo/ranking', json=payload(), headers={'x-demo-token': TOKEN}).json()
    assert result['status'] == 'READY'
    assert result['scoreMeaning'] == 'RELATIVE_RANKING_SCORE'
    assert result['items'][0]['rank'] == 1
    assert 'features' not in result['items'][0]
    assert result['attributionStatus'] == 'UNAVAILABLE'


def test_validation_failure_no_partial_pool():
    class Predictor:
        def score(self, *args, **kwargs):
            raise ValueError('private detail must not escape')
    client = TestClient(create_demo_app(Predictor(), token=TOKEN, node_env='test'))
    response = client.post('/api/v1/demo/ranking', json=payload(), headers={'x-demo-token': TOKEN})
    assert response.json()['status'] == 'UNAVAILABLE'
    assert 'private detail' not in response.text


def test_production_factory_refused():
    with pytest.raises(ValueError):
        create_demo_app(None, token=TOKEN)
