"""Synthetic source proposal contracts, not semantic reviewer validation."""

from copy import deepcopy

import pytest

from ml.ai2.source_review import bind_source_review, resolve_quote


def field(text, path='requirements'):
    return {'text': text, 'field_path': path, 'snapshot_sha256': 'a' * 64, 'evidence_id': 'e'}


@pytest.fixture
def bundle():
    task = {'split': 'train', 'task_id': 't', 'job': {'review_fields': [field('Payroll processing')]},
            'candidates': [{'snapshot_id': 'c', 'review_fields': [field('Reviewed payroll', 'summary')]}]}
    proposal = {'schema_version': 'ai2-source-review-proposal-v1', 'task_id': 't',
        'status': 'development_proposal_not_approved', 'used_targets': False,
        'requirements': [{'id': 'p', 'field_path': 'requirements', 'quote': 'Payroll processing', 'priority': 'unspecified'}],
        'candidate_observations': [{'candidate_id': 'c', 'observations': [
            {'requirement_id': 'p', 'state': 'related_scope_unknown', 'field_path': 'summary', 'quote': 'Reviewed payroll'}]}]}
    return task, proposal


def test_binding_preserves_scope_unknown_and_exact_source(bundle):
    result = bind_source_review(*bundle)
    assert result['observations'][0][2] == 'related_scope_unknown'
    assert result['observations'][0][3].quote == 'Reviewed payroll'
    assert result['status'].endswith('not_approved')
    assert result['requirements'][0]['priority'] == 'unspecified'


@pytest.mark.parametrize('text,quote', [('Python Python', 'Python'), ('Python', 'python'), ('Python', '')])
def test_quote_missing_ambiguous_or_blank_rejected(text, quote):
    with pytest.raises(ValueError):
        resolve_quote([field(text)], 'requirements', quote)


@pytest.mark.parametrize('change', ['test', 'target', 'approved', 'missing_candidate', 'missing_observation', 'fit_state'])
def test_invalid_proposal_rejected(bundle, change):
    task, proposal = deepcopy(bundle)
    if change == 'test': task['split'] = 'test'
    if change == 'target': proposal['used_targets'] = True
    if change == 'approved': proposal['status'] = 'approved'
    if change == 'missing_candidate': proposal['candidate_observations'] = []
    if change == 'missing_observation': proposal['candidate_observations'][0]['observations'] = []
    if change == 'fit_state': proposal['candidate_observations'][0]['observations'][0]['state'] = 'supported'
    with pytest.raises(ValueError):
        bind_source_review(task, proposal)


def test_unresolved_reason_retained_and_required(bundle):
    task, proposal = deepcopy(bundle)
    proposal['unresolved_conditions'] = [{'field_path': 'requirements',
        'quote': 'Payroll processing', 'reason': 'scope unresolved'}]
    assert bind_source_review(task, proposal)['unresolved_conditions'][0]['reason'] == 'scope unresolved'
    proposal['unresolved_conditions'][0]['reason'] = ''
    with pytest.raises(ValueError):
        bind_source_review(task, proposal)


def test_silence_not_fabricated_evidence(bundle):
    task, proposal = deepcopy(bundle)
    observation = proposal['candidate_observations'][0]['observations'][0]
    observation.clear()
    observation.update(requirement_id='p', state='no_explicit_mention_found')
    assert bind_source_review(task, proposal)['observations'][0][3] is None
    observation['quote'] = 'Reviewed payroll'
    with pytest.raises(ValueError):
        bind_source_review(task, proposal)
