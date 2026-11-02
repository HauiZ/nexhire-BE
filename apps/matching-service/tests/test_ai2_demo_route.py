from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import matching
from test_ai2_stored_score import result


APPLICATION = '44444444-4444-4444-4444-444444444444'


def client(monkeypatch):
    app = FastAPI()
    app.include_router(matching.router, prefix='/api/v1')
    app.dependency_overrides[matching.get_session] = lambda: None
    monkeypatch.setattr(matching, 'get_settings', lambda: SimpleNamespace(internal_service_token='test-internal', ai2_demo_enabled=False))
    saved = result()
    saved.application_id = APPLICATION
    lookup = AsyncMock(return_value=saved)
    monkeypatch.setattr(matching.MatchingService, 'get_latest_application_result', lookup)
    return TestClient(app), lookup


def test_route_requires_internal_token_before_read(monkeypatch):
    api, lookup = client(monkeypatch)
    assert api.get(f'/api/v1/matching/applications/{APPLICATION}/latest-ai2-demo').status_code == 403
    lookup.assert_not_awaited()


def test_route_disabled_never_loads_model(monkeypatch):
    api, _ = client(monkeypatch)
    response = api.get(f'/api/v1/matching/applications/{APPLICATION}/latest-ai2-demo', headers={'x-internal-service-token': 'test-internal'})
    assert response.status_code == 200
    assert response.json()['data']['status'] == 'DISABLED'


def test_route_native_failure_is_generic(monkeypatch):
    from app.ranking import demo_loader
    api, _ = client(monkeypatch)
    def fail(settings):
        raise RuntimeError('private-model-path-and-input')
    monkeypatch.setattr(demo_loader, 'get_demo_predictor', fail)
    response = api.get(f'/api/v1/matching/applications/{APPLICATION}/latest-ai2-demo', headers={'x-internal-service-token': 'test-internal'})
    assert response.status_code == 503
    assert 'private' not in response.text


def test_pool_requires_internal_token_before_read(monkeypatch):
    api, lookup = client(monkeypatch)
    response = api.get(f'/api/v1/matching/jobs/55555555-5555-4555-8555-555555555555/ai2-demo-pool?applicationIds={APPLICATION}')
    assert response.status_code == 403
    lookup.assert_not_awaited()


def test_pool_wrong_job_is_unavailable(monkeypatch):
    api, _ = client(monkeypatch)
    response = api.get(f'/api/v1/matching/jobs/55555555-5555-4555-8555-555555555555/ai2-demo-pool?applicationIds={APPLICATION}', headers={'x-internal-service-token': 'test-internal'})
    assert response.status_code == 200
    assert response.json()['data']['items'] == []
    assert response.json()['data']['status'] == 'UNAVAILABLE'


def test_pool_content_gate_withholds_otherwise_ready_order(monkeypatch):
    from app.ranking import demo_loader, stored_score, stored_pool
    from app.clients.internal import InternalClient
    api, lookup = client(monkeypatch)
    job_id = '55555555-5555-4555-8555-555555555555'
    saved = result()
    saved.job_id = job_id
    saved.application_id = APPLICATION
    lookup.return_value = saved
    monkeypatch.setattr(demo_loader, 'get_demo_predictor', lambda settings: object())
    monkeypatch.setattr(stored_score, 'score_stored_result', lambda *args: {})
    monkeypatch.setattr(InternalClient, 'get_job_matching_snapshot', AsyncMock(return_value=object()))
    monkeypatch.setattr(stored_pool, 'rank_stored_pool', lambda *args: dict(status='READY', items=[{'rankingPosition': 1}], comparedCount=2))
    response = api.get(f'/api/v1/matching/jobs/{job_id}/ai2-demo-pool?applicationIds={APPLICATION}', headers={'x-internal-service-token': 'test-internal'})
    data = response.json()['data']
    assert data['status'] == 'UNAVAILABLE'
    assert data['reason'] == 'CONTENT_QUALITY_NOT_VALIDATED'
    assert data['items'] == [] and data['comparedCount'] == 0


def test_pool_duplicate_ids_rejected(monkeypatch):
    api, lookup = client(monkeypatch)
    response = api.get(f'/api/v1/matching/jobs/55555555-5555-4555-8555-555555555555/ai2-demo-pool?applicationIds={APPLICATION}&applicationIds={APPLICATION}', headers={'x-internal-service-token': 'test-internal'})
    assert response.status_code == 400
    lookup.assert_not_awaited()
