import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx

from app.api.jd_plans import response
from app.clients.internal import InternalClient
from app.schemas.jd_plan import Approval, JobRequirementPlan, content_digest, draft_plan
from app.schemas.jd_plan_context import inspect_trusted_plan
from app.schemas.snapshots import JobMatchingSnapshot


class JdPlanContextTests(unittest.TestCase):
    def setUp(self):
        self.job = JobMatchingSnapshot(id='job', title='Analyst', description='', requirements='Use SQL and AWS.',
            skills=[], workingType='', experienceLevel='', location='')
        self.draft = draft_plan(self.job)

    def confirmed(self, origin='authenticated_hr'):
        approval = Approval(origin=origin, reviewer_id='fixture', authorization_event_id='fixture-event',
            job_id=self.job.id, content_sha256=content_digest(self.draft),
            approved_at=datetime(2026, 10, 24, tzinfo=timezone.utc))
        return JobRequirementPlan.model_validate({**self.draft.model_dump(mode='json'),
            'approval': approval.model_dump(mode='json')})

    def read(self, plan=None):
        return inspect_trusted_plan(response(self.job, plan)['data'], self.job)

    def test_unprepared_and_draft_are_not_confirmed_and_never_block(self):
        for plan, status in ((None, 'UNPREPARED'), (self.draft, 'DRAFT')):
            context = self.read(plan)
            self.assertEqual(context.status, status)
            self.assertIsNone(context.confirmed_plan)
            self.assertFalse(context.publishing_blocked)

    def test_hr_confirmation_does_not_confirm_candidate_support(self):
        context = self.read(self.confirmed())
        self.assertEqual(context.status, 'HR_CONFIRMED')
        self.assertIsNotNone(context.confirmed_plan)
        self.assertFalse(context.candidate_support_verified)

    def test_assistant_is_not_hr(self):
        context = self.read(self.confirmed('assistant_offline'))
        self.assertEqual(context.status, 'ASSISTANT_REVIEWED')
        self.assertIsNone(context.confirmed_plan)

    def test_changed_snapshot_discards_prior_confirmation(self):
        data = response(self.job, self.confirmed())['data']
        changed = self.job.model_copy(update={'title': 'Changed'})
        context = inspect_trusted_plan(data, changed)
        self.assertEqual(context.status, 'STALE')
        self.assertIsNone(context.plan)
        self.assertIsNone(context.confirmed_plan)

    def test_stale_state_never_returns_old_document_for_consumption(self):
        data = response(self.job, self.confirmed())['data']
        data['status'] = 'STALE'
        context = inspect_trusted_plan(data, self.job)
        self.assertEqual(context.status, 'STALE')
        self.assertIsNone(context.plan)

    def test_wrong_content_hash_and_forged_state_are_invalid(self):
        for mutation in ({'content_sha256': '0' * 64}, {'status': 'HR_CONFIRMED'}):
            data = {**response(self.job, self.draft)['data'], **mutation}
            self.assertEqual(inspect_trusted_plan(data, self.job).status, 'INVALID')

    def test_another_job_document_is_invalid(self):
        data = response(self.job, self.draft)['data']
        data['plan']['job_id'] = 'another-job'
        context = inspect_trusted_plan(data, self.job)
        self.assertEqual(context.status, 'INVALID')
        self.assertIsNone(context.confirmed_plan)

    def test_missing_or_unsafe_envelope_flags_are_invalid(self):
        for value in (None, [], {'candidate_support_verified': True}, {'publishing_blocked': True}):
            self.assertEqual(inspect_trusted_plan(value, self.job).status, 'INVALID')

    def client_read(self, handler):
        real_client = httpx.AsyncClient
        client = InternalClient.__new__(InternalClient)
        client.settings = SimpleNamespace(job_service_url='http://job.test', http_timeout_seconds=1,
            internal_service_token='fixture-internal-token')
        transport = httpx.MockTransport(handler)
        with patch('app.clients.internal.httpx.AsyncClient', side_effect=lambda **kwargs: real_client(transport=transport, **kwargs)):
            return asyncio.run(client.get_job_requirement_plan(self.job))

    def test_real_client_includes_service_token_and_validates_hash(self):
        def handler(request):
            self.assertEqual(request.headers['x-internal-service-token'], 'fixture-internal-token')
            self.assertEqual(request.url.path, '/api/v1/internal/jobs/job/requirement-plan')
            return httpx.Response(200, json=response(self.job, self.confirmed()))
        self.assertEqual(self.client_read(handler).status, 'HR_CONFIRMED')

    def test_timeout_and_missing_endpoint_are_optional_read_failures(self):
        def timeout(request):
            raise httpx.ReadTimeout('fixture timeout')
        for handler in (timeout, lambda request: httpx.Response(404)):
            context = self.client_read(handler)
            self.assertEqual(context.status, 'UNAVAILABLE')
            self.assertIsNone(context.confirmed_plan)
            self.assertFalse(context.publishing_blocked)

    def test_malformed_success_response_does_not_crash_matching(self):
        for value in ([], {'success': False}, {'success': True, 'data': 'invalid'}):
            self.assertEqual(self.client_read(lambda request: httpx.Response(200, json=value)).status, 'INVALID')


if __name__ == '__main__':
    unittest.main()
