"""Synthetic train-only fitting and missing versus observed zero."""

from dataclasses import asdict
import json

import pytest

from ml.ai2.preprocessing import fit_transform


def test_median_missing_indicators_and_frozen_inference():
    transform = fit_transform([{'x': 0}, {'x': 2}, {'x': None}], ['x'], split='train', standardize=False)
    assert transform.medians == (1,)
    assert transform.transform({'x': None}) == (1, 1)
    assert transform.transform({'x': 0}) == (0, 0)
    before = json.dumps(asdict(transform), sort_keys=True)
    assert transform.transform({'x': 1000}) == (1000, 0)
    assert json.dumps(asdict(transform), sort_keys=True) == before
    assert transform.output_names == ('x/value', 'x/missing')


def test_standardization_and_constant_all_missing():
    transform = fit_transform([{'x': 0, 'empty': None}, {'x': 2, 'empty': None}],
                              ['x', 'empty'], split='train', standardize=True)
    assert transform.transform({'x': 0, 'empty': None}) == (-1, 0, 0, 1)
    assert transform.transform({'x': 2, 'empty': 0}) == (1, 0, 0, 0)
    assert transform.all_missing == (False, True)
    assert transform.scales == (1, 1)


@pytest.mark.parametrize('split', ['validation', 'test', '', None])
def test_nontrain_fit_rejected(split):
    with pytest.raises(ValueError):
        fit_transform([{'x': 1}], ['x'], split=split, standardize=False)


@pytest.mark.parametrize('rows,names', [
    ([], ['x']), ([{'x': 1}], []), ([{'x': 1}], ['x', 'x']),
    ([{'x': True}], ['x']), ([{'x': float('nan')}], ['x']),
    ([{'x': float('inf')}], ['x']), ([{'y': 1}], ['x']),
    ([{'x': 1, 'extra': 2}], ['x']),
])
def test_malformed_fit_rejected(rows, names):
    with pytest.raises(ValueError):
        fit_transform(rows, names, split='train', standardize=False)


def test_inference_schema_and_values_rejected():
    transform = fit_transform([{'x': 1}], ['x'], split='train', standardize=True)
    for row in ({'y': 1}, {'x': True}, {'x': float('inf')}):
        with pytest.raises(ValueError):
            transform.transform(row)
