from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.jd_plans import router
from app.schemas.jd_plan import Approval, JobRequirementPlan, content_digest, draft_plan
from app.schemas.snapshots import JobMatchingSnapshot


class JdPlanApiTests(unittest.TestCase):
    def setUp(self):
        self.patch = patch('app.api.jd_plans.get_settings', return_value=SimpleNamespace(internal_service_token='unit-plan-token'))
        self.patch.start()
        app = FastAPI()
        app.include_router(router, prefix='/api/v1')
        self.client = TestClient(app)
        self.headers = {'x-internal-service-token': 'unit-plan-token'}
        self.job = {'id': 'job', 'title': 'Analyst', 'description': '',
            'requirements': '<ul><li>Use SQL.</li><li>Deploy on AWS.</li></ul>', 'skills': [],
            'workingType': '', 'experienceLevel': '', 'location': ''}

    def tearDown(self):
        self.client.close()
        self.patch.stop()

    def post(self, operation, body):
        return self.client.post('/api/v1/internal/jd-plans/' + operation, json=body, headers=self.headers)

    def test_all_operations_require_internal_token(self):
        for operation in ('draft', 'inspect', 'validate'):
            self.assertEqual(self.client.post('/api/v1/internal/jd-plans/' + operation,
                json={'job': self.job, 'revision': 1}).status_code, 403)

    def test_draft_preserves_every_source_block_and_does_not_block_publishing(self):
        response = self.post('draft', {'job': self.job, 'revision': 1})
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertEqual(data['status'], 'DRAFT')
        self.assertEqual([r['original_text'] for r in data['plan']['requirements']], ['Use SQL.', 'Deploy on AWS.'])
        self.assertFalse(data['publishing_blocked'])
        self.assertFalse(data['candidate_support_verified'])

    def test_unprepared_or_stale_remains_nonblocking(self):
        data = self.post('inspect', {'job': self.job}).json()['data']
        self.assertEqual(data['status'], 'UNPREPARED')
        plan = self.post('draft', {'job': self.job, 'revision': 1}).json()['data']['plan']
        changed = {**self.job, 'title': 'Changed'}
        data = self.post('inspect', {'job': changed, 'plan': plan}).json()['data']
        self.assertEqual(data['status'], 'STALE')
        self.assertFalse(data['publishing_blocked'])
        self.assertEqual(self.post('validate', {'job': changed, 'plan': plan}).status_code, 422)

    def test_wrong_job_or_missing_requirement_cannot_validate(self):
        plan = self.post('draft', {'job': self.job, 'revision': 1}).json()['data']['plan']
        self.assertEqual(self.post('inspect', {'job': {**self.job, 'id': 'other'}, 'plan': plan}).status_code, 422)
        plan['requirements'] = plan['requirements'][:1]
        self.assertEqual(self.post('validate', {'job': self.job, 'plan': plan}).status_code, 422)

    def test_extra_caller_fields_or_coerced_revision_rejected(self):
        self.assertEqual(self.post('draft', {'job': self.job, 'revision': '1'}).status_code, 422)
        self.assertEqual(self.post('draft', {'job': self.job, 'revision': 1, 'reviewer_id': 'spoof'}).status_code, 422)

    def test_confirmed_structure_does_not_verify_candidate_support(self):
        job = JobMatchingSnapshot.model_validate(self.job)
        draft = draft_plan(job)
        approval = Approval(origin='authenticated_hr', reviewer_id='unit-test-only',
            authorization_event_id='not-a-real-hr-event', job_id=job.id,
            content_sha256=content_digest(draft), approved_at=datetime(2026, 10, 24, tzinfo=timezone.utc))
        approved = JobRequirementPlan.model_validate({**draft.model_dump(mode='json'),
            'approval': approval.model_dump(mode='json')})
        data = self.post('validate', {'job': self.job, 'plan': approved.model_dump(mode='json')}).json()['data']
        self.assertEqual(data['status'], 'HR_CONFIRMED')
        self.assertFalse(data['candidate_support_verified'])
        self.assertFalse(data['publishing_blocked'])


if __name__ == '__main__':
    unittest.main()
