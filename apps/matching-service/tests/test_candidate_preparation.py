import unittest
from unittest.mock import patch
from types import SimpleNamespace
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.candidate_preparation import router, prepare, PreparationRequest
from app.schemas.snapshots import JobMatchingSnapshot


class CandidatePreparationTests(unittest.TestCase):
    def dto(self):
        return PreparationRequest(job=JobMatchingSnapshot(id=str(uuid4()), title='Backend', skills=[],
            requirements='Requirements: SQL\nPreferred: Docker', description='', benefits='Insurance',
            workingType='', experienceLevel='', location=''), candidate_id=uuid4(), candidate_cv_id=uuid4(),
            parsed_resume={'skills': [{'name': 'SQL'}]})

    def test_public_queries_only_no_scores_or_hr_state(self):
        runtime = SimpleNamespace(model=SimpleNamespace(tokenizer=lambda texts, **kw: {'input_ids': [[1] for _ in texts]}))
        matches = {'requirements': [{'hits': [{'id': 'skills/0', 'source': 'skill', 'text': 'SQL'}]}, {'hits': []}]}
        with patch('app.api.candidate_preparation._matches', return_value=matches):
            result = prepare(runtime, self.dto())
        self.assertEqual([x['requirement'] for x in result['requirements']], ['SQL', 'Docker'])
        self.assertEqual(result['requirements'][1]['status'], 'NO_REFERENCE_FOUND')
        self.assertFalse(result['applicationCreated']); self.assertTrue(result['private'])
        self.assertNotIn('similarityScore', str(result)); self.assertNotIn('fixedPlan', result)

    def test_internal_endpoint_denies_missing_token(self):
        app = FastAPI(); app.include_router(router)
        with patch('app.api.matching.get_settings', return_value=SimpleNamespace(internal_service_token='synthetic')):
            with TestClient(app) as client:
                self.assertEqual(client.post('/internal/candidate-preparation', json=self.dto().model_dump(mode='json')).status_code, 403)

    def test_malformed_or_oversized_records_rejected_before_model(self):
        for records in ('not-a-list', [None], [{}] * 101):
            dto = self.dto().model_copy(update={'parsed_resume': {'skills': records}})
            with self.assertRaises(ValueError): prepare(None, dto)

    def test_oversized_public_job_rejected_before_model(self):
        dto = self.dto()
        dto.job.description = 'x' * 100001
        with self.assertRaises(ValueError): prepare(None, dto)

    def test_disabled_model_has_no_fallback(self):
        from app.api.matching import require_internal_service
        app = FastAPI(); app.include_router(router)
        app.dependency_overrides[require_internal_service] = lambda: None
        with patch('app.api.candidate_preparation.get_settings', return_value=SimpleNamespace(ai1_backend='disabled', node_env='test')):
            with TestClient(app) as client:
                self.assertEqual(client.post('/internal/candidate-preparation', json=self.dto().model_dump(mode='json')).status_code, 503)

    def test_busy_model_rejects_without_loading(self):
        from app.api.matching import require_internal_service
        from app.api.candidate_preparation import _preparation_slot
        app = FastAPI(); app.include_router(router)
        app.dependency_overrides[require_internal_service] = lambda: None
        with patch('app.api.candidate_preparation.get_settings', return_value=SimpleNamespace(ai1_backend='local_m1', node_env='test')), patch('app.api.candidate_preparation.load_backend') as load:
            _preparation_slot.acquire()
            try:
                with TestClient(app) as client:
                    self.assertEqual(client.post('/internal/candidate-preparation', json=self.dto().model_dump(mode='json')).status_code, 503)
                load.assert_not_called()
            finally:
                _preparation_slot.release()

    def test_long_query_fails_explicitly_before_scoring(self):
        runtime = SimpleNamespace(model=SimpleNamespace(tokenizer=lambda texts, **kw: {'input_ids': [[0]*257 for _ in texts]}))
        with patch('app.api.candidate_preparation._matches') as score:
            with self.assertRaises(ValueError): prepare(runtime, self.dto())
            score.assert_not_called()
