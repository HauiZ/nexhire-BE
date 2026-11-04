"""No DB/broker/model access: exercise processing, HTTP projections and event payloads."""

import copy
import os
from contextlib import asynccontextmanager
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault('MATCHING_SERVICE_DB_NAME', 'unused_test')
os.environ.setdefault('MATCHING_SERVICE_DB_USER', 'unused_test')
os.environ.setdefault('MATCHING_SERVICE_DB_PASS', 'unused_test')

from app.matching.service import MatchingService
from app.matching.hr_review import hr_review_snapshot
from app.models.matching import MatchResult, MatchRequestStatus
from app.schemas.jd_plan_context import JobPlanContext
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


SCORES = ('total_score', 'skill_score', 'experience_score', 'education_score',
          'certification_score', 'project_score', 'preference_score', 'semantic_score')


class EvidenceOnlyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Any accidental baseline construction or model loading is a regression.
        for target in ('app.matching.scorer.MatchingScorer.__init__',
                       'app.matching.ranking.WeightedRanker.__init__',
                       'app.matching.semantic.SemanticScorer.__init__',
                       'app.matching.semantic.load_sentence_transformer'):
            guard = patch(target, side_effect=AssertionError('Runtime touched offline scorer'))
            guard.start()
            self.addCleanup(guard.stop)
        self.service = MatchingService()
        self.service.settings = SimpleNamespace(ai1_backend='disabled', max_attempts=2,
            enable_local_hr_test=True, node_env='test', ai1_manifest_path='unused',
            ai1_manifest_sha256='a' * 64)
        self.request = SimpleNamespace(id=uuid4(), job_id=uuid4(), candidate_id=uuid4(),
            candidate_cv_id=None, application_id=uuid4(), parsed_resume=None,
            attempt_count=1, finished_at=None)
        self.job = JobMatchingSnapshot(id=str(self.request.job_id), title='Backend', description='',
            requirements='Python', skills=[], workingType='', experienceLevel='', location='')
        self.candidate = CandidateMatchingSnapshot(candidateId=str(self.request.candidate_id))
        self.service.client = SimpleNamespace(get_job_matching_snapshot=AsyncMock(return_value=self.job),
            get_candidate_matching_snapshot=AsyncMock(return_value=self.candidate),
            get_job_requirement_plan=AsyncMock(return_value=JobPlanContext(status='UNPREPARED', reason='TEST')))
        self.session = SimpleNamespace(add=lambda result: None, flush=AsyncMock())

    def assert_no_scores(self, result):
        for name in SCORES:
            self.assertIsNone(getattr(result, name), name)
        for name in ('recommendation', 'decision', 'priority', 'rankingFeatures', 'requirementMatches'):
            self.assertNotIn(name, result.explanation)

    async def test_disabled_processing_is_evidence_only_and_does_not_load_or_call_fixture(self):
        with patch('app.matching.ai1.load_backend', side_effect=AssertionError('Model loaded')) as loader:
            result = await self.service.process(self.session, self.request)
        loader.assert_not_called()
        self.service.client.get_job_requirement_plan.assert_not_awaited()
        self.assertEqual(self.request.status, MatchRequestStatus.SUCCEEDED)
        self.assert_no_scores(result)
        self.assertEqual(result.explanation['ai1Assessment']['status'], 'DISABLED')
        self.assertEqual(hr_review_snapshot(result)['assessmentStatus'], 'NOT_PERFORMED')
        self.assertIsNone(hr_review_snapshot(result, include_baseline=True)['baselineDiagnostics'])
        self.assertNotIn('localHrFixtureAssessment', result.explanation)

    async def test_missing_m1_and_plan_error_are_honestly_unavailable_without_retry(self):
        self.service.settings.ai1_backend = 'local_m1'
        self.service.client.get_job_requirement_plan.side_effect = RuntimeError('unavailable plan')
        with patch('app.matching.ai1.load_backend', side_effect=ValueError('bad pin')):
            result = await self.service.process(self.session, self.request)
        self.assertEqual(self.request.status, MatchRequestStatus.SUCCEEDED)
        self.assertEqual(result.explanation['ai1Assessment']['status'], 'UNAVAILABLE')
        self.assert_no_scores(result)
        self.assertEqual(hr_review_snapshot(result)['assessmentStatus'], 'UNAVAILABLE')

    async def test_ready_m1_is_preserved_without_heuristic_scoring(self):
        from test_m1_runtime import FakeModel, manifest
        from app.matching.m1_runtime import LocalM1Runtime
        self.service.settings.ai1_backend = 'local_m1'
        self.candidate = CandidateMatchingSnapshot(candidateId=str(self.request.candidate_id),
            projects=[{'description': 'Built Python services.'}])
        self.service.client.get_candidate_matching_snapshot.return_value = self.candidate
        with patch('app.matching.ai1.load_backend', return_value=LocalM1Runtime(FakeModel(), manifest())):
            result = await self.service.process(self.session, self.request)
        self.assert_no_scores(result)
        assessment = result.explanation['ai1Assessment']
        self.assertEqual(assessment['status'], 'READY')
        self.assertFalse(assessment['candidateSupportVerified'])
        self.assertEqual(assessment['requirements'][0]['evidence'][0]['text'], 'Built Python services.')
        self.assertEqual(hr_review_snapshot(result)['assessmentStatus'], 'PENDING_REVIEW')

    async def test_parsed_resume_path_keeps_origin_hashes_without_scoring(self):
        self.request.candidate_user_id = None
        self.request.parsed_resume = {'profile': {'summary': 'Python developer'},
            'projects': [{'name': 'API', 'description': 'Built Python services.'}]}
        result = await self.service.process(self.session, self.request)
        self.assert_no_scores(result)
        self.service.client.get_candidate_matching_snapshot.assert_not_awaited()
        self.assertEqual(result.explanation['dataOrigin'], 'PARSED_CV')
        assessment = result.explanation['ai1Assessment']
        self.assertEqual(assessment['candidateSnapshotSha256'], result.explanation['candidateSnapshotHash'])
        self.assertEqual(assessment['jobSnapshotSha256'], result.explanation['jobSnapshotHash'])

    async def test_worker_republication_sanitizes_history_and_marks_only_after_publish(self):
        from app.worker import MatchRequestWorker
        worker = MatchRequestWorker()
        worker.service = self.service
        result = await self.service.process(self.session, self.request)
        result.id = uuid4()
        result.total_score = 90
        result.explanation.update(decision='SHORTLIST', recommendation='STRONG_FIT')
        self.session.get = AsyncMock(return_value=result)
        self.service.publisher.publish_matching_completed = AsyncMock()
        self.service.mark_completed_published = AsyncMock()

        @asynccontextmanager
        async def session_scope():
            yield self.session

        with patch('app.worker.session_scope', session_scope):
            await worker._publish_completed_result(result.id)
            payload = self.service.publisher.publish_matching_completed.call_args.args[0]
            self.assertIsNone(payload['totalScore'])
            self.assertNotIn('decision', payload['explanation'])
            self.service.mark_completed_published.assert_awaited_once_with(self.session, result.id)
            self.service.mark_completed_published.reset_mock()
            self.service.publisher.publish_matching_completed.side_effect = RuntimeError('broker unavailable')
            with self.assertRaises(RuntimeError):
                await worker._publish_completed_result(result.id)
            self.service.mark_completed_published.assert_not_awaited()

    async def test_failure_retry_and_terminal_results_have_null_components(self):
        self.service.client.get_job_matching_snapshot.side_effect = ValueError('snapshot failed')
        for attempts, expected in ((1, MatchRequestStatus.PENDING), (2, MatchRequestStatus.FAILED)):
            self.request.attempt_count = attempts
            result = await self.service.process(self.session, self.request)
            self.assertEqual(self.request.status, expected)
            self.assert_no_scores(result)
            self.assertEqual(result.error_code, 'MATCHING.PROCESS_FAILED')

    async def test_http_and_events_sanitize_archived_claims_without_mutating_history(self):
        result = await self.service.process(self.session, self.request)
        result.id = uuid4()
        result.total_score = 98
        result.explanation.update(decision='SHORTLIST', recommendation='STRONG_FIT', priority='HIGH',
            rankingFeatures={'semantic_score': 98}, requirementMatches=[{'status': 'MATCHED'}],
            nextActions=['Hire'], featureLimitations=['Legacy recommendation'])
        before = copy.deepcopy(result.explanation)
        self.service.publisher.publish_matching_completed = AsyncMock()
        await self.service.publish_completed(result)
        payload = self.service.publisher.publish_matching_completed.call_args.args[0]
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.api.matching import router, get_session, require_internal_service
        app = FastAPI()
        app.include_router(router, prefix='/api/v1')
        app.dependency_overrides[get_session] = lambda: self.session
        app.dependency_overrides[require_internal_service] = lambda: None
        with patch.object(MatchingService, 'get_latest_application_result', AsyncMock(return_value=result)):
            with TestClient(app) as client:
                response = client.get(f'/api/v1/matching/applications/{result.application_id}/latest-result')
                self.assertEqual(response.status_code, 200)
                snapshot = response.json()['data']
                hr = client.get(f'/api/v1/matching/applications/{result.application_id}/latest-hr-review?includeBaselineDiagnostics=true')
                self.assertEqual(hr.status_code, 200)
                self.assertIsNone(hr.json()['data']['baselineDiagnostics'])
        for output in (payload, snapshot):
            self.assertEqual(output['scoringStatus'], 'NOT_AVAILABLE')
            self.assertIsNone(output['totalScore'])
            self.assertIsNone(output['matchLevel'])
            for key in ('decision', 'recommendation', 'priority', 'rankingFeatures', 'requirementMatches', 'nextActions'):
                self.assertNotIn(key, output['explanation'])
        self.assertNotIn('inputSnapshots', payload['explanation'])
        self.assertEqual(result.explanation, before)
        self.assertEqual(result.total_score, 98)

    def test_sqlalchemy_has_no_zero_defaults(self):
        for name in SCORES:
            column = MatchResult.__table__.columns[name]
            self.assertTrue(column.nullable)
            self.assertIsNone(column.default)
            self.assertIsNone(column.server_default)


if __name__ == '__main__':
    unittest.main()
