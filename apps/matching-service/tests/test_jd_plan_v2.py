import unittest
from datetime import datetime, timezone

from app.schemas.jd_plan import Approval, content_digest, draft_plan
from app.schemas.jd_plan_v2 import draft_query_plan, validate_query_plan
from app.schemas.snapshots import JobMatchingSnapshot


class QueryPlanTests(unittest.TestCase):
    def job(self):
        return JobMatchingSnapshot(id='job', title='Backend', skills=['Node.js'],
            requirements='Requirements:\nPostgreSQL\nPreferred: Docker',
            description='Build APIs.', benefits='Insurance', workingType='FULL_TIME',
            experienceLevel='MID', location='Remote')

    def test_source_preserved_and_headings_not_selected(self):
        plan = draft_query_plan(self.job())
        self.assertEqual([c.query for s in plan.sources for c in s.components],
                         ['Node.js', 'PostgreSQL', 'Docker'])
        self.assertEqual([s.original_text for s in plan.sources],
                         ['Node.js', 'Requirements:', 'PostgreSQL', 'Preferred:',
                          'Docker', 'Build APIs.', 'Insurance'])
        self.assertTrue(all(s.source_id.startswith('v2/') for s in plan.sources))

    def test_saved_v2_document_roundtrip(self):
        from app.schemas.jd_plan_v2 import JobQueryPlan
        job = self.job(); plan = draft_query_plan(job)
        restored = JobQueryPlan.model_validate_json(plan.model_dump_json())
        self.assertEqual(content_digest(restored), content_digest(plan))
        validate_query_plan(restored, job)

    def test_selected_does_not_coerce_strings(self):
        from pydantic import ValidationError
        from app.schemas.jd_plan_v2 import JobQueryPlan
        payload = draft_query_plan(self.job()).model_dump(mode='json')
        payload['sources'][0]['selected'] = 'false'
        with self.assertRaises(ValidationError):
            JobQueryPlan.model_validate(payload)

    def test_v1_unchanged(self):
        plan = draft_plan(self.job())
        self.assertEqual(plan.schema_version, 'jd-fixed-requirements-v1')
        self.assertEqual(plan.requirements[1].original_text, 'Requirements:')

    def test_binding_rejects_changed_source_or_order(self):
        job = self.job(); plan = draft_query_plan(job)
        for sources in (plan.sources[1:], tuple(reversed(plan.sources)),
                        (plan.sources[0].model_copy(update={'original_text': 'fake'}),) + plan.sources[1:]):
            with self.assertRaises(ValueError):
                validate_query_plan(plan.model_copy(update={'sources': sources}), job)
        with self.assertRaises(ValueError):
            validate_query_plan(plan, job.model_copy(update={'benefits': 'changed'}))

    def test_approval_invalid_after_selection_change(self):
        job = self.job(); plan = draft_query_plan(job)
        approval = Approval(origin='authenticated_hr', reviewer_id='hr',
            authorization_event_id='event', job_id=job.id, content_sha256=content_digest(plan),
            approved_at=datetime.now(timezone.utc))
        confirmed = plan.model_copy(update={'approval': approval})
        validate_query_plan(confirmed, job)
        first = confirmed.sources[0].model_copy(update={'selected': False, 'components': ()})
        with self.assertRaises(ValueError):
            validate_query_plan(confirmed.model_copy(update={'sources': (first,) + confirmed.sources[1:]}), job)

    def test_hr_may_select_review_source_without_losing_provenance(self):
        from app.schemas.jd_plan import PlanComponent
        job = self.job(); plan = draft_query_plan(job)
        source = plan.sources[-2]
        selected = source.model_copy(update={'selected': True, 'components': (
            PlanComponent(id='quote', query=source.original_text,
                          source_quote=source.original_text, importance='unknown'),)})
        edited = plan.model_copy(update={'sources': plan.sources[:-2] + (selected, plan.sources[-1])})
        validate_query_plan(edited, job)

    def test_retrieval_only_selected_queries_and_requires_hr(self):
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        from app.matching.query_plan import retrieve_query_plan
        from app.schemas.snapshots import CandidateMatchingSnapshot
        job = self.job(); plan = draft_query_plan(job)
        candidate = CandidateMatchingSnapshot(candidateId='candidate')
        runtime = SimpleNamespace(model=SimpleNamespace(tokenizer=Mock(return_value={'input_ids': [[1], [2], [3]]})),
                                  model_version='pinned', manifest={'weights_sha256': 'a' * 64})
        with self.assertRaises(ValueError):
            retrieve_query_plan(runtime, job, candidate, plan)
        runtime.model.tokenizer.assert_not_called()
        approval = Approval(origin='authenticated_hr', reviewer_id='hr', authorization_event_id='event',
                            job_id=job.id, content_sha256=content_digest(plan), approved_at=datetime.now(timezone.utc))
        plan = plan.model_copy(update={'approval': approval})
        matches = {'requirements': [{'status': 'NO_EVIDENCE', 'hits': []} for _ in range(3)]}
        with patch('app.matching.ai1._matches', return_value=matches) as score:
            result = retrieve_query_plan(runtime, job, candidate, plan)
            self.assertEqual(score.call_args.args[1].skills, ['Node.js', 'PostgreSQL', 'Docker'])
            self.assertEqual([q['source_id'] for q in result['queries']],
                             ['v2/skills/0', 'v2/requirements/1', 'v2/requirements/3'])
            self.assertFalse(result['candidate_support_verified'])
        runtime.model.tokenizer.return_value = {'input_ids': [[0] * 257, [1], [2]]}
        with patch('app.matching.ai1._matches') as score:
            with self.assertRaises(ValueError):
                retrieve_query_plan(runtime, job, candidate, plan)
            score.assert_not_called()

    def test_selection_and_source_role_tampering_rejected(self):
        job = self.job(); plan = draft_query_plan(job)
        for update in ({'selected': False}, {'components': ()}, {'suggested_role': 'review'},
                       {'source_field': 'benefits'}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                first = plan.sources[0].model_copy(update=update)
                validate_query_plan(plan.model_copy(update={'sources': (first,) + plan.sources[1:]}), job)

    def test_query_workload_bound(self):
        job = self.job().model_copy(update={'skills': [f'Skill {i}' for i in range(65)]})
        with self.assertRaises(ValueError):
            draft_query_plan(job)

    def test_no_query_plan_rejected(self):
        job = self.job().model_copy(update={'skills': [], 'requirements': 'Requirements:',
                                           'description': '', 'benefits': 'Insurance'})
        with self.assertRaises(ValueError):
            draft_query_plan(job)

    def test_invented_query_rejected(self):
        job = self.job(); plan = draft_query_plan(job)
        first = plan.sources[0]
        forged = first.components[0].model_copy(update={'query': 'Invented'})
        with self.assertRaises(ValueError):
            validate_query_plan(plan.model_copy(update={'sources':
                (first.model_copy(update={'components': (forged,)}),) + plan.sources[1:]}), job)


if __name__ == '__main__':
    unittest.main()
