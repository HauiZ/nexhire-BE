"""Reviewed logic fixtures; no automatic truth inference from CV/JD prose."""

import itertools

import pytest

from app.ranking.conditions import (
    Condition, Support, certification_disposition, credential_mentions, evaluate_condition,
)


def atom(name):
    return Condition('atom', name)


@pytest.mark.parametrize('left,right', list(itertools.product(Support, repeat=2)))
def test_three_valued_all(left, right):
    expected = (Support.NOT_SUPPORTED if Support.NOT_SUPPORTED in (left, right) else
                Support.SUPPORTED if left == right == Support.SUPPORTED else Support.UNKNOWN)
    assert evaluate_condition(Condition('all', children=(atom('a'), atom('b'))),
                              {'a': left, 'b': right}) == expected


@pytest.mark.parametrize('left,right', list(itertools.product(Support, repeat=2)))
def test_three_valued_any(left, right):
    expected = (Support.SUPPORTED if Support.SUPPORTED in (left, right) else
                Support.NOT_SUPPORTED if left == right == Support.NOT_SUPPORTED else Support.UNKNOWN)
    assert evaluate_condition(Condition('any', children=(atom('a'), atom('b'))),
                              {'a': left, 'b': right}) == expected


def test_alternative_does_not_become_all_required():
    condition = Condition('any', children=(atom('degree'),
        Condition('all', children=(atom('work'), atom('training')))))
    assert evaluate_condition(condition, {'degree': Support.SUPPORTED}) == Support.SUPPORTED
    assert evaluate_condition(condition, {'work': Support.SUPPORTED}) == Support.UNKNOWN


@pytest.mark.parametrize('condition', [
    Condition('all', children=(atom('a'),)), Condition('or'), Condition('atom', ''),
    Condition('all', children=(atom('a'), atom('a'))),
    Condition('atom', 'a', (atom('b'),)),
])
def test_invalid_condition_rejected(condition):
    with pytest.raises(ValueError):
        evaluate_condition(condition, {})


def test_invalid_observation_mapping_and_mutable_atom_rejected():
    with pytest.raises(ValueError):
        evaluate_condition(atom('a'), [])
    with pytest.raises(ValueError):
        evaluate_condition(Condition('atom', 'a', []), {})


def test_untyped_support_rejected():
    with pytest.raises(ValueError):
        evaluate_condition(atom('a'), {'a': True})


@pytest.mark.parametrize('text,credential', [
    ('B.S. in Computer Science', 'bachelor'), ('B.A. in Economics', 'bachelor'),
    ('BS + 10 years', 'bachelor'), ('MS in Computing', 'master'),
    ('Master of Science in Computing', 'master'), ('Ph.D. in Chemistry', 'doctorate'),
    ("Bachelor's degree expected", 'bachelor'),
])
def test_degree_mentions_do_not_assert_completion_or_discipline(text, credential):
    mentions = credential_mentions(text)
    assert len(mentions) == 1
    mention = mentions[0]
    assert mention.credential == credential
    assert text[mention.start:mention.end] == mention.quote
    assert mention.completion == 'unknown'
    assert mention.field is None


def test_degree_alternatives_stay_separate_mentions():
    assert [m.credential for m in credential_mentions('BS or MS preferred')] == ['bachelor', 'master']
    assert not credential_mentions('as a manager in a business')


def test_regulatory_exclusion_is_explicit_and_unmatched_is_unresolved():
    excluded = certification_disposition(' Series 7 ', excluded_regulatory_names=['Series 7'])
    assert excluded.disposition == 'excluded'
    assert excluded.quote == ' Series 7 '
    assert certification_disposition('Python Certificate', excluded_regulatory_names=['Series 7']).disposition == 'unresolved'
    assert certification_disposition('Series 7 license', excluded_regulatory_names=['Series 7']).disposition == 'unresolved'
