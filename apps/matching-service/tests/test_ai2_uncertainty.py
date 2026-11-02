"""Synthetic paired uncertainty fixtures; never open held-out data."""

import pytest

from ml.ai2.uncertainty import paired_bootstrap


def test_constant_paired_gain_and_sorted_determinism():
    result = paired_bootstrap({'b': 0.75, 'a': 0.5}, {'a': 0.25, 'b': 0.5})
    assert result['difference'] == result['ci_lower'] == result['ci_upper'] == 0.25
    assert result['eligible_jobs'] == 2
    assert result == paired_bootstrap({'a': 0.5, 'b': 0.75}, {'b': 0.5, 'a': 0.25})


def test_undefined_pairs_are_explicit():
    result = paired_bootstrap({'a': None, 'b': 0.5}, {'a': 0.4, 'b': 0.5})
    assert result['excluded_job_ids'] == ['a']
    assert result['eligible_jobs'] == 1
    assert result['difference'] == result['ci_lower'] == result['ci_upper'] == 0
    result = paired_bootstrap({'a': None}, {'a': None})
    assert result['eligible_jobs'] == 0
    assert result['difference'] is result['ci_lower'] is result['ci_upper'] is None


def test_paired_comparison_not_independent_resampling():
    result = paired_bootstrap({'a': 0.1, 'b': 0.9}, {'a': 0.1, 'b': 0.9})
    assert result['ci_lower'] == result['ci_upper'] == 0


def test_mixed_differences_have_two_sided_interval():
    result = paired_bootstrap({'a': 1, 'b': 0}, {'a': 0, 'b': 1})
    assert result['difference'] == 0
    assert result['ci_lower'] < 0 < result['ci_upper']


@pytest.mark.parametrize('candidate,baseline', [
    ({}, {}), ({'a': 0}, {'b': 0}), ({1: 0}, {1: 0}),
    ({'a': True}, {'a': 0}), ({'a': float('nan')}, {'a': 0}),
    ({'a': 0}, {'a': float('inf')}), ({'a': '0'}, {'a': 0}),
])
def test_invalid_maps_rejected(candidate, baseline):
    with pytest.raises(ValueError):
        paired_bootstrap(candidate, baseline)


@pytest.mark.parametrize('options', [
    {'seed': True}, {'repetitions': 99}, {'repetitions': 100001},
    {'repetitions': 100.0}, {'confidence': True}, {'confidence': 1},
    {'confidence': 0}, {'confidence': float('nan')},
])
def test_invalid_configuration_rejected(options):
    with pytest.raises(ValueError):
        paired_bootstrap({'a': 0}, {'a': 0}, **options)
