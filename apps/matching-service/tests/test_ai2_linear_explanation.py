"""Numerical accounting only; no trained-model parity claim."""

import math

import pytest

from ml.ai2.linear_explanation import explain_logit


def test_reconstruction_includes_missing_indicator():
    result = explain_logit(['semantic_scaled', 'tenure_scaled', 'tenure_missing'],
                           [1.5, 0, 1], [2, -1, -0.5], -0.25)
    assert result['logit'] == 2.25
    assert result['intercept'] + sum(t['logit_contribution'] for t in result['terms']) == 2.25
    assert result['classifier_score'] == pytest.approx(1 / (1 + math.exp(-2.25)))
    assert result['terms'][2]['logit_contribution'] == -0.5
    assert result['output_space'] == 'binary-logit'


@pytest.mark.parametrize('logit,expected', [(1000, 1), (-1000, 0), (0, 0.5)])
def test_stable_sigmoid(logit, expected):
    assert explain_logit(['x'], [0], [1], logit)['classifier_score'] == expected


@pytest.mark.parametrize('names,values,weights,bias', [
    ([], [], [], 0), (['x', 'x'], [1, 2], [1, 2], 0),
    (['x'], [1, 2], [1], 0), ([''], [1], [1], 0),
    (['x'], [True], [1], 0), (['x'], [None], [1], 0),
    (['x'], [float('nan')], [1], 0), (['x'], [1], [float('inf')], 0),
    (['x'], [1], [1], True), (['x'], [1e308], [1e308], 0),
])
def test_invalid_inputs(names, values, weights, bias):
    with pytest.raises(ValueError):
        explain_logit(names, values, weights, bias)
