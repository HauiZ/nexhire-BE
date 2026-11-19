from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import matching
from test_ai2_stored_score import result


APPLICATION = '44444444-4444-4444-4444-444444444444'
JOB = '55555555-5555-4555-8555-555555555555'
AUTH = {'x-internal-service-token': 'test-internal'}
SETTINGS = dict(internal_service_token='test-internal', ai2_demo_enabled=False, http_timeout_seconds=1)


def client(monkeypatch):
    app = FastAPI()
    app.include_router(matching.router, prefix='/api/v1')
    session = SimpleNamespace(get=AsyncMock(return_value=object()))
    app.dependency_overrides[matching.get_session] = lambda: session
    monkeypatch.setattr(matching, 'get_settings', lambda: SimpleNamespace(**SETTINGS))
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


def ready_pool_client(monkeypatch):
    from app.ranking import demo_loader, stored_score, stored_pool
    from app.clients.internal import InternalClient
    api, lookup = client(monkeypatch)
    saved = result()
    saved.job_id = JOB
    saved.application_id = APPLICATION
    saved.request_id = 'match-request'
    lookup.return_value = saved
    monkeypatch.setattr(demo_loader, 'get_demo_predictor', lambda settings: object())
    monkeypatch.setattr(stored_score, 'score_stored_result', lambda *args, **kwargs: {})
    monkeypatch.setattr(InternalClient, 'get_job_matching_snapshot', AsyncMock(return_value=object()))
    monkeypatch.setattr(stored_pool, 'rank_stored_pool', lambda *args: dict(status='READY', items=[{'rankingPosition': 1}], comparedCount=2))
    check = AsyncMock(return_value={'sourceCheckedAt': '2026-10-18T00:00:00Z'})
    monkeypatch.setattr(matching, '_revalidate_current_cv', check)
    return api, check


def test_pool_content_gate_withholds_otherwise_ready_order(monkeypatch):
    api, check = ready_pool_client(monkeypatch)
    response = api.get(f'/api/v1/matching/jobs/{JOB}/ai2-demo-pool?applicationIds={APPLICATION}', headers=AUTH)
    assert response.status_code == 200
    check.assert_awaited_once()
    data = response.json()['data']
    assert data['status'] == 'UNAVAILABLE'
    assert data['reason'] == 'CONTENT_QUALITY_NOT_VALIDATED'
    assert data['items'] == [] and data['comparedCount'] == 0


def test_explicit_local_demo_order_does_not_approve_production(monkeypatch):
    api, _ = ready_pool_client(monkeypatch)
    for environment, expected in [('development', 'READY'), ('test', 'READY'), ('production', 'UNAVAILABLE')]:
        monkeypatch.setattr(matching, 'get_settings', lambda: SimpleNamespace(
            **SETTINGS, ai2_demo_order_enabled=True, node_env=environment))
        response = api.get(f'/api/v1/matching/jobs/{JOB}/ai2-demo-pool?applicationIds={APPLICATION}', headers=AUTH)
        assert response.status_code == 200
        data = response.json()['data']
        assert data['status'] == expected
        if expected == 'READY':
            assert data['evaluationMode'] == 'LOCAL_DEMO_ONLY'
            assert data['contentQualityValidated'] is False
            assert data['currentCvRevalidated'] is True
        else:
            assert data['items'] == []


def test_pool_duplicate_ids_rejected(monkeypatch):
    api, lookup = client(monkeypatch)
    response = api.get(f'/api/v1/matching/jobs/55555555-5555-4555-8555-555555555555/ai2-demo-pool?applicationIds={APPLICATION}&applicationIds={APPLICATION}', headers={'x-internal-service-token': 'test-internal'})
    assert response.status_code == 400
    lookup.assert_not_awaited()
