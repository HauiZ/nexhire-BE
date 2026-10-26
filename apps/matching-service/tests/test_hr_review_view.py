import copy
import os
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.matching.hr_review import hr_review_snapshot
from app.models.matching import MatchResultStatus
from app.schemas.jd_plan import JobRequirementPlan, content_digest


def fixture():
    job, candidate = str(uuid4()), str(uuid4())
    hit = {'id': 'skills/0', 'source': 'skill', 'text': 'PostgreSQL', 'comparison_score': 93.05}
    def proposal(identifier, text, suggestion):
        return {'requirement': {'id': identifier, 'text': text}, 'verified_support': False,
            'requires_hr_review': True, 'verifier': {'model_suggestion': suggestion,
                'assessment_status': 'PENDING_REVIEW', 'verified_support': False}, 'retrieved_evidence': [hit]}
    parent = proposal('requirements/0', 'Administer PostgreSQL and deploy AWS.', 'partial')
    parent['component_analysis'] = 'PREPARED_JD_PLAN_UNVERIFIED_PROPOSALS'
    parent['component_proposals'] = [
        {**proposal('requirements/0/component/database', 'Administer PostgreSQL.', 'matched'), 'group_id': 'database'},
        {**proposal('requirements/0/component/aws', 'Deploy AWS.', 'not_established_in_provided_evidence'), 'group_id': 'aws'}]
    plan = {'schema': 'jd-fixed-requirements-v1', 'job_snapshot_sha256': 'b' * 64,
        'revision': 1, 'confirmation_origin': 'authenticated_hr',
        'component_support_verified': False, 'logical_coverage_automatically_confirmed': False,
        'requirements': [{'requirement_id': 'requirements/0', 'original_text': parent['requirement']['text'],
        'components': [
        {'id': 'database', 'query': 'Administer PostgreSQL.', 'source_quote': 'PostgreSQL', 'importance': 'core'},
        {'id': 'aws', 'query': 'Deploy AWS.', 'source_quote': 'AWS', 'importance': 'core'}],
        'all_of': [['database'], ['aws']], 'joint_context_required': False}]}
    plan['content_sha256'] = content_digest(JobRequirementPlan.model_validate(dict(
        schema_version=plan['schema'], job_id=job, job_snapshot_sha256=plan['job_snapshot_sha256'],
        revision=plan['revision'], requirements=plan['requirements'])))
    assessment = {'schema': 'local-hr-fixture-v1', 'synthetic_test_only': True,
        'assessment_status': 'PENDING_REVIEW', 'candidate_support_verified': False,
        'candidate_rejected': False, 'is_training_label': False, 'planStatus': 'HR_CONFIRMED',
        'planContentSha256': plan['content_sha256'], 'inference': {'job_id': job, 'candidate_id': candidate,
            'job_snapshot_sha256': 'b' * 64,
            'jd_plan_context': {'status': 'HR_CONFIRMED', 'content_sha256': plan['content_sha256']},
            'automatically_supported': False, 'candidate_rejected': False, 'assessment_status': 'PENDING_REVIEW',
            'hr_proposals': [parent], 'fixed_jd_plan': plan, 'model_version': 'fixture-retriever', 'verifier_version': 'fixture-verifier'}}
    return SimpleNamespace(id=uuid4(), application_id=uuid4(), job_id=job, candidate_id=candidate,
        status=MatchResultStatus.SUCCEEDED, total_score=87.6, explanation={
            'decision': 'SHORTLIST', 'recommendation': 'STRONG_FIT', 'rankingModelVersion': 'weighted-baseline-v1',
            'localHrFixtureAssessment': assessment})


class HrReviewProjectionTests(unittest.TestCase):
    def test_baseline_high_score_does_not_leak_into_default_hr_view(self):
        result = fixture()
        view = hr_review_snapshot(result)
        self.assertNotIn('totalScore', view)
        self.assertNotIn('matchLevel', view)
        self.assertNotIn('decision', view)
        self.assertIsNone(view['baselineDiagnostics'])
        self.assertIsNone(view['hiringDecision'])
        self.assertIsNone(view['overallFitScore'])
        self.assertEqual(result.explanation['decision'], 'SHORTLIST')

    def test_partial_and_component_proposals_are_preserved_not_confirmed(self):
        view = hr_review_snapshot(fixture())
        requirement = view['requirements'][0]
        self.assertEqual(requirement['modelSuggestion'], 'partial')
        self.assertEqual(requirement['allOf'], [['database'], ['aws']])
        self.assertEqual(requirement['components'][1]['modelSuggestion'], 'not_established_in_provided_evidence')
        self.assertFalse(requirement['components'][0]['verifiedSupport'])
        self.assertFalse(view['candidateSupportVerified'])
        self.assertEqual(view['assessmentStatus'], 'PENDING_REVIEW')

    def test_explicit_diagnostics_cannot_resurface_archived_scores(self):
        result = fixture()
        view = hr_review_snapshot(result, include_baseline=True)
        self.assertIsNone(view['baselineDiagnostics'])
        self.assertIsNone(view['overallFitScore'])
        self.assertEqual(result.total_score, 87.6)

    def test_no_assessment_does_not_translate_old_matched_skill_into_support(self):
        result = fixture()
        del result.explanation['localHrFixtureAssessment']
        result.explanation['requirementMatches'] = [{'status': 'MATCHED', 'score': 90}]
        view = hr_review_snapshot(result)
        self.assertEqual(view['assessmentStatus'], 'NOT_PERFORMED')
        self.assertEqual(view['requirements'], [])

    def test_failed_request_is_unavailable_not_low_fit(self):
        result = fixture()
        result.status = MatchResultStatus.FAILED
        view = hr_review_snapshot(result)
        self.assertEqual(view['assessmentStatus'], 'UNAVAILABLE')
        self.assertEqual(view['requirements'], [])
        self.assertIsNone(view['hiringDecision'])

    def test_stale_or_draft_plan_cannot_drive_component_view(self):
        for state in ('DRAFT', 'STALE', 'UNPREPARED'):
            result = fixture()
            assessment = result.explanation['localHrFixtureAssessment']
            assessment['planStatus'] = state
            assessment['inference']['jd_plan_context'] = {'status': state, 'content_sha256': None}
            self.assertEqual(hr_review_snapshot(result)['assessmentStatus'], 'UNAVAILABLE')
            assessment['inference']['hr_proposals'][0].update(component_analysis='NOT_PERFORMED', component_proposals=None)
            view = hr_review_snapshot(result)
            self.assertEqual(view['assessmentStatus'], 'PENDING_REVIEW')
            self.assertIsNone(view['planContentSha256'])
            self.assertIsNone(view['requirements'][0]['components'])

    def test_wrong_candidate_or_verified_flags_fail_closed(self):
        for mutation in ({'candidate_id': 'other'}, {'automatically_supported': True}):
            result = fixture()
            result.explanation['localHrFixtureAssessment']['inference'].update(mutation)
            view = hr_review_snapshot(result)
            self.assertEqual(view['assessmentStatus'], 'UNAVAILABLE')
            self.assertEqual(view['requirements'], [])

    def test_invalid_relation_fails_closed_without_partial_projection(self):
        result = fixture()
        result.explanation['localHrFixtureAssessment']['inference']['hr_proposals'][0]['verifier']['model_suggestion'] = 'CONFIRMED'
        view = hr_review_snapshot(result)
        self.assertEqual(view['assessmentStatus'], 'UNAVAILABLE')
        self.assertEqual(view['requirements'], [])

    def test_similarity_is_explicitly_not_probability(self):
        hit = hr_review_snapshot(fixture())['requirements'][0]['evidence'][0]
        self.assertEqual(hit['similarityScore'], 93.05)
        self.assertIn('NOT_SUPPORT_PROBABILITY', hit['scoreMeaning'])

    def test_projection_does_not_mutate_stored_data(self):
        result = fixture()
        before = copy.deepcopy(result.explanation)
        hr_review_snapshot(result, include_baseline=True)
        self.assertEqual(result.explanation, before)

    def test_malformed_historical_payload_does_not_raise_or_leak_baseline(self):
        result = fixture()
        result.explanation['localHrFixtureAssessment'] = 'malformed'
        view = hr_review_snapshot(result)
        self.assertEqual(view['assessmentStatus'], 'UNAVAILABLE')
        self.assertIsNone(view['baselineDiagnostics'])

    def assert_invalid(self, result):
        before = copy.deepcopy(result.explanation)
        view = hr_review_snapshot(result)
        self.assertEqual(view['assessmentStatus'], 'UNAVAILABLE')
        self.assertEqual(view['reason'], 'INVALID_STORED_HR_ASSESSMENT')
        self.assertEqual(view['requirements'], [])
        self.assertIsNone(view['planContentSha256'])
        self.assertEqual(result.explanation, before)

    def test_non_object_explanation_fails_closed_including_empty_containers(self):
        for payload in ('malformed', [], ['data'], False, 0):
            for diagnostics in (False, True):
                with self.subTest(payload=payload, diagnostics=diagnostics):
                    result = fixture()
                    result.explanation = payload
                    view = hr_review_snapshot(result, include_baseline=diagnostics)
                    self.assertEqual(view['reason'], 'INVALID_STORED_HR_ASSESSMENT')
                    self.assertEqual(view['requirements'], [])
                    self.assertIsNone(view['baselineDiagnostics'])

    def test_malformed_optional_diagnostics_do_not_discard_valid_assessment(self):
        for key in ('decision', 'recommendation', 'rankingModelVersion'):
            with self.subTest(key=key):
                result = fixture()
                result.explanation[key] = {'invalid': 'not a string'}
                view = hr_review_snapshot(result, include_baseline=True)
                self.assertEqual(view['assessmentStatus'], 'PENDING_REVIEW')
                self.assertIsNone(view['baselineDiagnostics'])
        for score in (None, '87.6', True, float('nan'), float('inf')):
            with self.subTest(score=score):
                result = fixture()
                result.total_score = score
                view = hr_review_snapshot(result, include_baseline=True)
                self.assertEqual(view['assessmentStatus'], 'PENDING_REVIEW')
                self.assertIsNone(view['baselineDiagnostics'])

    def test_empty_objects_cannot_stand_in_for_stored_arrays(self):
        for field in ('hr_proposals', 'retrieved_evidence'):
            with self.subTest(field=field):
                result = fixture()
                assessment = result.explanation['localHrFixtureAssessment']
                inference = assessment['inference']
                assessment['planStatus'] = 'UNPREPARED'
                inference['jd_plan_context'] = {'status': 'UNPREPARED', 'content_sha256': None}
                proposal = inference['hr_proposals'][0]
                proposal.update(component_analysis='NOT_PERFORMED', component_proposals=None)
                if field == 'hr_proposals':
                    inference[field] = {}
                else:
                    proposal[field] = {}
                self.assert_invalid(result)

    def test_valid_empty_evidence_remains_an_unverified_proposal(self):
        result = fixture()
        result.explanation['localHrFixtureAssessment']['inference']['hr_proposals'][0]['retrieved_evidence'] = []
        view = hr_review_snapshot(result)
        self.assertEqual(view['assessmentStatus'], 'PENDING_REVIEW')
        self.assertEqual(view['requirements'][0]['evidence'], [])
        self.assertFalse(view['requirements'][0]['verifiedSupport'])

    def test_malformed_nested_payloads_fail_closed(self):
        for key, payload in (('inference', []), ('planStatus', [])):
            with self.subTest(key=key):
                result = fixture()
                result.explanation['localHrFixtureAssessment'][key] = payload
                self.assert_invalid(result)
        for key, payload in (('hr_proposals', {}), ('fixed_jd_plan', []),
                             ('jd_plan_context', []), ('hr_proposals', [None])):
            with self.subTest(key=key, payload=payload):
                result = fixture()
                result.explanation['localHrFixtureAssessment']['inference'][key] = payload
                self.assert_invalid(result)

    def test_matching_hash_labels_do_not_bind_altered_fixed_content(self):
        result = fixture()
        assessment = result.explanation['localHrFixtureAssessment']
        assessment['inference']['fixed_jd_plan']['requirements'][0]['components'][0]['importance'] = 'preferred'
        self.assert_invalid(result)

    def test_fixed_requirement_text_and_component_identity_are_bound(self):
        for field in ('parent_text', 'component_id', 'component_query', 'analysis'):
            with self.subTest(field=field):
                result = fixture()
                proposal = result.explanation['localHrFixtureAssessment']['inference']['hr_proposals'][0]
                if field == 'parent_text':
                    proposal['requirement']['text'] = 'Unrelated requirement'
                elif field == 'component_id':
                    proposal['component_proposals'][0]['requirement']['id'] = 'requirements/9/component/database'
                elif field == 'component_query':
                    proposal['component_proposals'][0]['requirement']['text'] = 'Unrelated query'
                else:
                    proposal['component_analysis'] = 'NOT_PERFORMED'
                self.assert_invalid(result)

    def test_inference_identity_snapshot_and_context_must_match(self):
        mutations = [('job_id', str(uuid4())), ('candidate_id', str(uuid4())),
            ('job_snapshot_sha256', 'c' * 64),
            ('jd_plan_context', {'status': 'DRAFT', 'content_sha256': None}),
            ('jd_plan_context', {'status': 'HR_CONFIRMED', 'content_sha256': 'c' * 64})]
        for key, value in mutations:
            with self.subTest(key=key, value=value):
                result = fixture()
                result.explanation['localHrFixtureAssessment']['inference'][key] = value
                self.assert_invalid(result)

    def test_fixed_plan_logic_rejected_even_with_recomputed_hash(self):
        for mutation in ('duplicate_requirement', 'duplicate_component', 'unknown_group',
                         'empty_group', 'missing_component', 'duplicate_group'):
            with self.subTest(mutation=mutation):
                result = fixture()
                assessment = result.explanation['localHrFixtureAssessment']
                inference = assessment['inference']
                plan = inference['fixed_jd_plan']
                requirement = plan['requirements'][0]
                if mutation == 'duplicate_requirement':
                    plan['requirements'].append(copy.deepcopy(requirement))
                elif mutation == 'duplicate_component':
                    requirement['components'].append(copy.deepcopy(requirement['components'][0]))
                elif mutation == 'unknown_group':
                    requirement['all_of'].append(['unknown'])
                elif mutation == 'empty_group':
                    requirement['all_of'].append([])
                elif mutation == 'missing_component':
                    requirement['all_of'] = [['database']]
                else:
                    requirement['all_of'].append(['database'])
                plan_hash = content_digest(JobRequirementPlan.model_validate(dict(
                    schema_version=plan['schema'], job_id=str(result.job_id),
                    job_snapshot_sha256=plan['job_snapshot_sha256'], revision=plan['revision'],
                    requirements=plan['requirements'])))
                assessment['planContentSha256'] = plan['content_sha256'] = plan_hash
                inference['jd_plan_context']['content_sha256'] = plan_hash
                self.assert_invalid(result)

    def test_fixed_component_semantics_rejected_even_with_recomputed_hash(self):
        for mutation in ('duplicate_query', 'foreign_quote', 'blank_quote'):
            with self.subTest(mutation=mutation):
                result = fixture()
                assessment = result.explanation['localHrFixtureAssessment']
                inference = assessment['inference']
                plan = inference['fixed_jd_plan']
                components = plan['requirements'][0]['components']
                if mutation == 'duplicate_query':
                    components[1]['query'] = components[0]['query']
                    # Keep proposal text consistent so the query-binding check cannot mask this gap.
                    inference['hr_proposals'][0]['component_proposals'][1]['requirement']['text'] = components[0]['query']
                else:
                    components[0]['source_quote'] = 'Unrelated JD quote' if mutation == 'foreign_quote' else ' '
                plan_hash = content_digest(JobRequirementPlan.model_validate(dict(
                    schema_version=plan['schema'], job_id=str(result.job_id),
                    job_snapshot_sha256=plan['job_snapshot_sha256'], revision=plan['revision'],
                    requirements=plan['requirements'])))
                assessment['planContentSha256'] = plan['content_sha256'] = plan_hash
                inference['jd_plan_context']['content_sha256'] = plan_hash
                self.assert_invalid(result)

    def test_fixed_plan_confirmation_metadata_cannot_self_confirm_support(self):
        for key, value in (('confirmation_origin', 'assistant_offline'),
                           ('component_support_verified', True),
                           ('logical_coverage_automatically_confirmed', True)):
            with self.subTest(key=key):
                result = fixture()
                result.explanation['localHrFixtureAssessment']['inference']['fixed_jd_plan'][key] = value
                self.assert_invalid(result)


class HrReviewApiTests(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault('MATCHING_SERVICE_DB_NAME', 'unit_no_connection')
        os.environ.setdefault('MATCHING_SERVICE_DB_USER', 'unit')
        os.environ.setdefault('MATCHING_SERVICE_DB_PASS', 'unit')
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.api import matching
        self.matching = matching
        self.app = FastAPI()
        self.app.include_router(matching.router, prefix='/api/v1')
        async def session():
            yield None
        self.app.dependency_overrides[matching.get_session] = session
        self.app.dependency_overrides[matching.require_internal_service] = lambda: None
        self.result = fixture()
        self.service = SimpleNamespace(get_latest_application_result=AsyncMock(return_value=self.result))
        self.patch = patch('app.api.matching.MatchingService', return_value=self.service)
        self.patch.start()
        self.client = TestClient(self.app)
        self.url = f'/api/v1/matching/applications/{self.result.application_id}/latest-hr-review'

    def tearDown(self):
        self.client.close()
        self.patch.stop()

    def test_default_and_explicit_diagnostic_reads(self):
        data = self.client.get(self.url).json()['data']
        self.assertIsNone(data['baselineDiagnostics'])
        data = self.client.get(self.url + '?includeBaselineDiagnostics=true').json()['data']
        self.assertIsNone(data['baselineDiagnostics'])

    def test_malformed_stored_payload_and_diagnostics_are_safe_api_responses(self):
        self.result.explanation = ['malformed']
        response = self.client.get(self.url + '?includeBaselineDiagnostics=true')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['reason'], 'INVALID_STORED_HR_ASSESSMENT')
        self.result = fixture()
        self.service.get_latest_application_result.return_value = self.result
        self.result.total_score = float('nan')
        response = self.client.get(self.url + '?includeBaselineDiagnostics=true')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['assessmentStatus'], 'PENDING_REVIEW')
        self.assertIsNone(response.json()['data']['baselineDiagnostics'])

    def test_missing_result_is_404(self):
        self.service.get_latest_application_result.return_value = None
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_invalid_id_is_422(self):
        self.assertEqual(self.client.get('/api/v1/matching/applications/invalid/latest-hr-review').status_code, 422)

    def test_authentication_is_still_required(self):
        del self.app.dependency_overrides[self.matching.require_internal_service]
        with patch('app.api.matching.get_settings', return_value=SimpleNamespace(internal_service_token='unit-token')):
            self.assertEqual(self.client.get(self.url).status_code, 403)


if __name__ == '__main__':
    unittest.main()
