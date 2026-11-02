import pytest
from ml.ai2.content_protocol import validate_reviews, training_readiness


def row():
    return dict(id='a', job_group='job-a', split='development', state='EXPLICIT_CONTEXT',
        job_text='Use Python.', candidate_text='Built Python APIs.', job_quote='Python',
        candidate_quote='Python', reviewer_id='assistant-proposal', review_event_id='draft-1',
        independent_review=False, adjudicated=False, author_is_reviewer=True)


def test_content_observations_do_not_infer_support_or_global_absence():
    from ml.ai2.content_observations import observe_content
    value = observe_content('Node.js and TypeScript', [{'text': 'No Node.js experience.', 'source': 'skill'}])
    assert value['absent_from_supplied_passages'] == ['typescript']
    assert value['passages'][0]['negation_cue']
    assert value['passages'][0]['listing_only']
    assert not value['passages'][0]['support_verified']
    assert not value['usable_as_training_features']
    assert not observe_content('Python', [])['whole_cv_absence_established']


def test_assistant_drafts_not_gold_or_training_ready():
    output = training_readiness([row()])
    assert not output['training_ready'] and not output['independent_gold']
    assert 'NO_APPROVED_CANDIDATE_RANKING_TARGETS' in output['blockers']


def test_exact_quotes_and_split_groups_required():
    with pytest.raises(ValueError):
        validate_reviews([{**row(), 'candidate_quote': 'AWS'}])
    with pytest.raises(ValueError):
        validate_reviews([row(), {**row(), 'id': 'b', 'split': 'test'}])


def test_silver_policy_explicitly_allows_blinded_ai_review_not_gold():
    silver = {**row(), 'split': 'validation', 'label_origin': 'AI_REVIEWED_SILVER',
        'source_only_review': True, 'split_frozen_before_review': True, 'model_outputs_seen': False}
    assert validate_reviews([silver], review_policy='ai_silver')['validation'] == 1
    with pytest.raises(ValueError):
        validate_reviews([{**silver, 'model_outputs_seen': True}], review_policy='ai_silver')
    with pytest.raises(ValueError):
        validate_reviews([silver])


def test_independent_test_provenance_required():
    with pytest.raises(ValueError):
        validate_reviews([{**row(), 'split': 'test'}])
    assert validate_reviews([{**row(), 'split': 'test', 'independent_review': True,
        'adjudicated': True, 'author_is_reviewer': False}])['test'] == 1
