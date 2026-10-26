"""Application adapter and HR view preserve provenance without verifier decisions."""

import asyncio
import copy
from datetime import datetime, timezone
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.matching.ai1 import assess_ai1
from app.matching.hr_review import hr_review_snapshot
from app.matching.m1_runtime import LocalM1Runtime
from app.models.matching import MatchResultStatus
from app.schemas.jd_plan import Approval, PlannedRequirement, PlanComponent, content_digest, draft_plan, validate_plan
from app.schemas.jd_plan_context import JobPlanContext
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from test_m1_runtime import FakeModel, manifest


class Ai1PipelineTests(unittest.TestCase):
    def setUp(self):
        self.job = JobMatchingSnapshot(id=str(uuid4()), title='Backend', description='', skills=[],
            requirements='Use Python and AWS.', workingType='', experienceLevel='', location='')
        self.candidate = CandidateMatchingSnapshot(candidateId=str(uuid4()),
            projects=[{'description': 'Built Python services.'}])
        self.settings = SimpleNamespace(node_env='test', ai1_backend='local_m1', ai1_manifest_path='local.json',
            ai1_manifest_sha256='a' * 64)
        self.runtime = LocalM1Runtime(FakeModel(), manifest())
        self.context = JobPlanContext(status='UNPREPARED', reason='NO_PLAN')

    def assess(self, context=None):
        with patch('app.matching.ai1.load_backend', return_value=self.runtime):
            return asyncio.run(assess_ai1(self.settings, self.job, self.candidate, context or self.context))

    def confirmed(self, joint=False):
        draft = draft_plan(self.job)
        planned = PlannedRequirement(requirement_id='requirements/0', original_text=self.job.requirements,
            components=(PlanComponent(id='python', query='Use Python.', source_quote='Python', importance='core'),
                PlanComponent(id='aws', query='Use AWS.', source_quote='AWS', importance='core')),
            all_of=(('python',), ('aws',)), joint_context_required=joint)
        edited = draft.model_copy(update={'requirements': (planned,), 'revision': 2})
        # Synthetic trusted-service fixture, not a client-supplied approval route.
        approval = Approval(origin='authenticated_hr', reviewer_id='test-hr',
            authorization_event_id='synthetic-unit-approval', job_id=self.job.id, content_sha256=content_digest(edited),
            approved_at=datetime(2026, 10, 24, tzinfo=timezone.utc))
        plan = validate_plan(edited.model_copy(update={'approval': approval}), self.job)
        return JobPlanContext(status='HR_CONFIRMED', reason='TEST_APPROVAL', plan=plan)

    def stored(self, assessment):
        return SimpleNamespace(id=uuid4(), application_id=uuid4(), job_id=self.job.id,
            candidate_id=self.candidate.candidateId, candidate_cv_id=None, status=MatchResultStatus.SUCCEEDED,
            total_score=90., explanation={'ai1Assessment': assessment.model_dump(mode='json'),
                'inputSnapshots': {'job': self.job.model_dump(mode='json'), 'candidate': self.candidate.model_dump(mode='json')},
                'decision': 'SHORTLIST', 'recommendation': 'STRONG_FIT'})

    def test_disabled_never_loads_model(self):
        self.settings.ai1_backend = 'disabled'
        with patch('app.matching.ai1.load_backend') as loader:
            result = asyncio.run(assess_ai1(self.settings, self.job, self.candidate, self.context))
        loader.assert_not_called()
        self.assertEqual(result.status, 'DISABLED')

    def test_failure_is_unavailable_without_exception_text_or_lexical_success(self):
        with patch('app.matching.ai1.load_backend', side_effect=ValueError('private-path-secret')):
            result = asyncio.run(assess_ai1(self.settings, self.job, self.candidate, self.context))
        self.assertEqual(result.status, 'UNAVAILABLE')
        self.assertEqual(result.requirements, ())
        self.assertNotIn('secret', result.model_dump_json())
        self.assertEqual(hr_review_snapshot(self.stored(result))['assessmentStatus'], 'UNAVAILABLE')

    def test_shadow_checkpoint_cannot_be_enabled_in_production(self):
        for environment in ('production', 'staging', 'Production'):
            self.settings.node_env = environment
            with patch('app.matching.ai1.load_backend') as loader:
                result = asyncio.run(assess_ai1(self.settings, self.job, self.candidate, self.context))
            loader.assert_not_called()
            self.assertEqual(result.status, 'UNAVAILABLE')

    def test_current_hr_plan_retrieves_components_without_inventing_support_labels(self):
        result = self.assess(self.confirmed())
        self.assertEqual(result.status, 'READY')
        self.assertEqual([c.componentId for c in result.requirements[0].components], ['python', 'aws'])
        for item in (result.requirements[0], *result.requirements[0].components):
            self.assertIsNone(item.supportStatus)
            self.assertFalse(item.verifiedSupport)
        view = hr_review_snapshot(self.stored(result))
        self.assertEqual(view['assessmentSource'], 'M1_RETRIEVAL')
        self.assertEqual(view['requirements'][0]['componentAnalysis'], 'FIXED_PLAN_RETRIEVAL')
        self.assertIsNone(view['requirements'][0]['components'][1]['modelSuggestion'])
        self.assertIsNone(view['verifierModelVersion'])
        self.assertIsNone(view['baselineDiagnostics'])
        self.assertIsNone(view['overallFitScore'])

    def test_stale_draft_or_unavailable_plan_does_not_reuse_component_structure(self):
        for status in ('DRAFT', 'STALE', 'UNAVAILABLE', 'INVALID'):
            result = self.assess(JobPlanContext(status=status, reason='TEST'))
            self.assertEqual(result.status, 'READY')
            self.assertIsNone(result.fixedPlan)
            self.assertIsNone(result.requirements[0].components)

    def test_corrupt_stored_source_identity_quotes_and_plan_fail_closed(self):
        valid = self.stored(self.assess(self.confirmed()))
        for mutation in ('job', 'candidate', 'snapshot', 'quote', 'component', 'support', 'plan'):
            value = copy.deepcopy(valid)
            raw = value.explanation['ai1Assessment']
            if mutation == 'job': raw['jobId'] = str(uuid4())
            elif mutation == 'candidate': raw['candidateCvId'] = str(uuid4())
            elif mutation == 'snapshot': raw['candidateSnapshotSha256'] = 'b' * 64
            elif mutation == 'quote': raw['requirements'][0]['evidence'][0]['text'] = 'Invented quote'
            elif mutation == 'component': raw['requirements'][0]['components'][0]['text'] = 'Other task'
            elif mutation == 'support': raw['requirements'][0]['supportStatus'] = 'matched'
            else: raw['planStatus'] = 'DRAFT'
            with self.subTest(mutation=mutation):
                view = hr_review_snapshot(value)
                self.assertEqual(view['assessmentStatus'], 'UNAVAILABLE')
                self.assertEqual(view['requirements'], [])

    def test_snapshot_inputs_and_model_scores_are_not_mutated_by_projection(self):
        value = self.stored(self.assess())
        before = copy.deepcopy(value.explanation)
        hr_review_snapshot(value)
        self.assertEqual(value.explanation, before)

    def test_empty_cv_is_no_evidence_not_candidate_rejection(self):
        self.candidate = self.candidate.model_copy(update={'projects': []})
        result = self.assess()
        self.assertEqual(result.requirements[0].retrievalStatus, 'NO_EVIDENCE')
        self.assertFalse(result.automaticallyReject)

    def test_explicit_negation_warning_survives_to_hr_evidence(self):
        self.job = self.job.model_copy(update={'requirements': 'Python'})
        self.candidate = self.candidate.model_copy(update={'projects': [
            self.candidate.projects[0].model_copy(update={'description': 'No experience with Python.'})]})
        result = self.assess()
        self.assertIn('EXPLICIT_NEGATION_CUE', result.requirements[0].evidence[0].reasonCodes)
        view = hr_review_snapshot(self.stored(result))
        self.assertIn('EXPLICIT_NEGATION_CUE', view['requirements'][0]['evidence'][0]['reasonCodes'])
        self.assertIn('RETRIEVAL_IS_NOT_ENTAILMENT', view['requirements'][0]['reasonCodes'])

    def test_joint_context_instruction_survives_to_hr_and_cannot_be_changed(self):
        value = self.stored(self.assess(self.confirmed(joint=True)))
        self.assertTrue(hr_review_snapshot(value)['requirements'][0]['jointContextRequired'])
        value.explanation['ai1Assessment']['requirements'][0]['jointContextRequired'] = False
        self.assertEqual(hr_review_snapshot(value)['assessmentStatus'], 'UNAVAILABLE')

    def test_truncated_context_is_visible_to_hr_without_changing_raw_source_quote(self):
        self.candidate = self.candidate.model_copy(update={'projects': [
            self.candidate.projects[0].model_copy(update={'description': 'long ' * 300 + 'Python'})]})
        result = self.assess()
        self.assertGreater(result.truncatedTexts, 0)
        view = hr_review_snapshot(self.stored(result))
        self.assertIn('M1_CONTEXT_TRUNCATED', view['retrievalWarnings'])
        self.assertEqual(view['requirements'][0]['evidence'][0]['text'], self.candidate.projects[0].description)


if __name__ == '__main__':
    unittest.main()
