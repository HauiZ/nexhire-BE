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

    def test_long_query_reason_survives_unavailable_hr_projection(self):
        from app.matching.query_plan import QueryTokenLimitError
        with patch('app.matching.ai1.assess_local', side_effect=QueryTokenLimitError()):
            assessment = self.assess()
        self.assertEqual(assessment.reason, 'QUERY_TOKEN_LIMIT_EXCEEDED_SPLIT_SOURCE_QUOTES')
        view = hr_review_snapshot(self.stored(assessment))
        self.assertEqual(view['reason'], assessment.reason)
        self.assertEqual(view['assessmentStatus'], 'UNAVAILABLE')

    def test_v2_confirmed_selected_queries_survive_stored_hr_projection(self):
        from app.schemas.jd_plan_v2 import draft_query_plan
        from app.schemas.jd_plan_context import inspect_trusted_plan
        self.job = self.job.model_copy(update={
            'requirements': 'Requirements:\nPython\nPreferred: AWS', 'benefits': 'Insurance'})
        plan = draft_query_plan(self.job)
        approval = Approval(origin='authenticated_hr', reviewer_id='test-hr',
            authorization_event_id='synthetic-v2-unit-event', job_id=self.job.id,
            content_sha256=content_digest(plan), approved_at=datetime(2026, 11, 5, tzinfo=timezone.utc))
        plan = plan.model_copy(update={'approval': approval})
        context = inspect_trusted_plan({'status': 'HR_CONFIRMED',
            'current_job_snapshot_sha256': plan.job_snapshot_sha256,
            'content_sha256': content_digest(plan), 'plan': plan.model_dump(mode='json'),
            'publishing_blocked': False, 'candidate_support_verified': False}, self.job)
        self.assertEqual(context.status, 'HR_CONFIRMED')
        assessment = self.assess(context)
        self.assertEqual(assessment.status, 'READY')
        self.assertEqual([r.text for r in assessment.requirements], ['Python', 'AWS'])
        stored = self.stored(assessment)
        before = copy.deepcopy(stored.explanation)
        view = hr_review_snapshot(stored)
        self.assertEqual(view['assessmentStatus'], 'PENDING_REVIEW')
        self.assertEqual([r['text'] for r in view['requirements']], ['Python', 'AWS'])
        self.assertEqual(view['planContentSha256'], content_digest(plan))
        self.assertEqual(stored.explanation, before)
        stored.explanation['ai1Assessment']['fixedPlan']['sources'][1]['selected'] = False
        self.assertEqual(hr_review_snapshot(stored)['assessmentStatus'], 'UNAVAILABLE')

    def test_runtime_span_maps_through_ai1_to_hr_with_full_parent_quote(self):
        self.job = self.job.model_copy(update={'requirements': 'Design reliable distributed services using Python'})
        sentence = 'Designed reliable distributed services using Python for customer workloads.'
        parent = sentence + '\r\n  Managed communications across several unrelated community events.'
        self.candidate = self.candidate.model_copy(update={'projects': [
            self.candidate.projects[0].model_copy(update={'description': parent})]})
        assessment = self.assess()
        self.assertEqual(assessment.status, 'READY')
        hit = assessment.requirements[0].evidence[0]
        self.assertEqual(hit.relevantSpan, sentence)
        self.assertEqual(hit.text, parent)
        stored = self.stored(assessment)
        before = copy.deepcopy(stored.explanation)
        projected = hr_review_snapshot(stored)['requirements'][0]['evidence'][0]
        self.assertEqual(projected, hit.model_dump(mode='json'))
        self.assertEqual(stored.explanation, before)

    def test_schema_rejects_nonexact_empty_or_overlong_span(self):
        from pydantic import ValidationError
        from app.schemas.ai1 import Ai1Hit
        from app.schemas.hr_review import ReviewEvidence

        values = dict(evidenceId='p', source='project', text='Built Python.\r\n  Led a team. ' + 'x' * 601,
                      similarityScore=73)
        for schema in (Ai1Hit, ReviewEvidence):
            for span in ('built Python.', 'Python. Led', '', ' ', 'x' * 601, 12):
                with self.subTest(schema=schema.__name__, span=span), self.assertRaises(ValidationError):
                    schema(**values, relevantSpan=span)
            self.assertEqual(schema(**values, relevantSpan='Python.\r\n  Led').relevantSpan, 'Python.\r\n  Led')
            self.assertIsNone(schema(**values).relevantSpan)
            self.assertIsNone(schema(**values, relevantSpan=None).relevantSpan)

    def test_old_results_and_invalid_optional_hints_keep_valid_evidence(self):
        valid = self.stored(self.assess(self.confirmed()))
        for field, span in [('absent', None), ('relevantSpan', None), ('relevant_span', 'Python'),
                            ('relevantSpan', 'Invented quote'), ('relevant_span', 'built python'),
                            ('relevantSpan', ' '), ('relevantSpan', 12), ('relevantSpan', 'x' * 601)]:
            value = copy.deepcopy(valid)
            requirement = value.explanation['ai1Assessment']['requirements'][0]
            for item in (requirement, *requirement['components']):
                hit = item['evidence'][0]
                hit.pop('relevantSpan', None)
                if field != 'absent':
                    hit[field] = span
            before = copy.deepcopy(value.explanation)
            view = hr_review_snapshot(value)
            self.assertEqual(view['assessmentStatus'], 'PENDING_REVIEW')
            projected = view['requirements'][0]
            for item in (projected, *projected['components']):
                self.assertEqual(item['evidence'][0]['text'], 'Built Python services.')
                self.assertEqual(item['evidence'][0]['relevantSpan'], 'Python' if span == 'Python' else None)
            self.assertEqual(value.explanation, before)

    def test_invalid_runtime_span_fails_validation_without_fabricating_ready_evidence(self):
        score = self.runtime.score
        def corrupt(job, candidate):
            result = score(job, candidate)
            result['requirements'][0]['hits'][0]['relevant_span'] = 'Invented quote'
            return result
        with patch.object(self.runtime, 'score', side_effect=corrupt):
            self.assertEqual(self.assess().status, 'UNAVAILABLE')

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
