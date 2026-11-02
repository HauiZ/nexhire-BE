"""Bounded synthetic-only parity checks; no datasets, services, or saved weights."""

from copy import deepcopy
from dataclasses import asdict
import json
import math

import pytest

from ml.ai2 import artifact_prediction as artifacts
from ml.ai2.preprocessing import fit_transform


def _lr(width=2):
    return {'algorithm': 'lr', 'classes': [False, True],
            'coefficients': [[1.0] * width], 'intercept': [0.0]}


def _stump():
    return {'children_left': [1, -1, -1], 'children_right': [2, -1, -1],
            'feature': [0, -2, -2], 'threshold': [1.0, -2.0, -2.0],
            'value': [[[0.0]], [[2.0]], [[4.0]]]}


def _rf(tree=None):
    return {'algorithm': 'rf', 'trees': [_stump() if tree is None else tree]}


def _write(path, value):
    path.write_text(json.dumps(value, allow_nan=False), encoding='utf-8')
    return path


@pytest.mark.parametrize('standardize', [False, True])
def test_transform_json_roundtrip_and_missing_indicators(tmp_path, standardize):
    rows = [{'x': 0, 'constant': 3, 'empty': None},
            {'x': 2, 'constant': 3, 'empty': None},
            {'x': None, 'constant': 3, 'empty': None}]
    fitted = fit_transform(rows, ['x', 'constant', 'empty'], split='train',
                           standardize=standardize)
    path = _write(tmp_path / 'transform.json', asdict(fitted))
    loaded = artifacts.load_transform_json(path)
    assert loaded == fitted
    assert loaded.output_names == fitted.output_names
    before = asdict(loaded)
    for row in rows + [{'x': 100, 'constant': None, 'empty': 0}]:
        assert loaded.transform(row) == fitted.transform(row)
    assert loaded.transform(rows[0])[1] == 0
    assert loaded.transform(rows[2])[1] == 1
    assert asdict(loaded) == before


@pytest.mark.parametrize('algorithm', ['lr', 'rf'])
def test_tiny_sklearn_export_prediction_parity(tmp_path, algorithm):
    np = pytest.importorskip('numpy')
    pytest.importorskip('sklearn')
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.linear_model import LogisticRegression
    from ml.ai2.train_experiment import _save_model

    # Deliberately tiny and deterministic; these are not application training data.
    rows = [{'x': float(i - 20), 'z': None if i % 5 == 0 else float(i % 7),
             'constant': 2.0, 'empty': None} for i in range(48)]
    transform = fit_transform(rows, ['x', 'z', 'constant', 'empty'], split='train',
                              standardize=algorithm == 'lr')
    x = np.array([transform.transform(row) for row in rows])
    target = np.array([(i * 7) % 4 for i in range(len(rows))])
    if algorithm == 'lr':
        model = LogisticRegression(max_iter=200, random_state=9).fit(x, target >= 2)
    else:
        model = RandomForestRegressor(n_estimators=10, max_depth=4, n_jobs=1,
                                      random_state=9).fit(x, target)
    model_path, transform_path = tmp_path / 'model.json', tmp_path / 'transform.json'
    _save_model(model, algorithm, model_path)
    _write(transform_path, asdict(transform))
    held_out = rows[::5] + [
        {'x': -50.5, 'z': 0, 'constant': 2, 'empty': None},
        {'x': None, 'z': None, 'constant': None, 'empty': 0},
        {'x': 50.5, 'z': 2.5, 'constant': 2, 'empty': None},
    ]
    matrix = np.array([transform.transform(row) for row in held_out])
    expected = (model.predict_proba(matrix)[:, 1] if algorithm == 'lr'
                else model.predict(matrix))
    actual = artifacts.predict_artifact(model_path, transform_path, held_out)
    np.testing.assert_allclose(actual, expected, rtol=1e-12, atol=1e-12)
    predictor = artifacts.load_model_json(model_path, n_features=x.shape[1])
    # Check every split on both sides in double precision, including values that
    # round across the threshold when sklearn casts the input to float32.
    if algorithm == 'rf':
        probes = []
        for estimator in model.estimators_:
            for feature, threshold in zip(estimator.tree_.feature, estimator.tree_.threshold):
                if feature >= 0:
                    for direction in (-math.inf, math.inf):
                        row = x[0].copy()
                        row[feature] = np.nextafter(threshold, direction)
                        probes.append(row.tolist())
        np.testing.assert_allclose(predictor.predict(probes), model.predict(probes),
                                   rtol=1e-12, atol=1e-12)
    else:
        assert len(predictor.predict(matrix.tolist())) == len(held_out)


def test_lr_stable_probability_and_ordered_numeric_classes():
    value = _lr(1)
    value['classes'] = [2, 7]
    model = artifacts.model_from_dict(value, n_features=1)
    assert model.predict([[-1000], [0], [1000]]) == (0.0, 0.5, 1.0)
    assert model.predict([]) == ()


def test_rf_float32_threshold_routing_and_single_leaf():
    model = artifacts.model_from_dict(_rf(), n_features=1)
    # float64 exceeds the threshold, but float32 rounds back to 1.0.
    assert model.predict([[1.0 + 1e-9], [1.0 + 1e-6]]) == (2.0, 4.0)
    tree = {'children_left': [-1], 'children_right': [-1], 'feature': [-2],
            'threshold': [-2], 'value': [[[3.5]]]}
    assert artifacts.model_from_dict(_rf(tree), n_features=1).predict([[100]]) == (3.5,)


@pytest.mark.parametrize('field,bad', [
    ('feature_names', []), ('feature_names', ['x', 'x']),
    ('feature_names', [' ']), ('feature_names', ['x' * 257]),
    ('medians', []), ('medians', [True]), ('medians', [float('nan')]),
    ('means', [float('inf')]), ('scales', [0]), ('scales', [-1]),
    ('scales', ['1']), ('all_missing', [1]), ('standardize', 1),
    ('version', 'unknown'),
])
def test_bad_transform_rejected(field, bad):
    fitted = fit_transform([{'x': 1}], ['x'], split='train', standardize=True)
    value = asdict(fitted)
    value[field] = bad
    with pytest.raises(ValueError):
        artifacts.transform_from_dict(value)


def test_transform_unknown_fields_all_missing_constants_and_limits(monkeypatch):
    value = asdict(fit_transform([{'x': None}], ['x'], split='train', standardize=False))
    broken = deepcopy(value)
    broken['medians'] = [1]
    with pytest.raises(ValueError):
        artifacts.transform_from_dict(broken)
    broken = dict(value, unknown=1)
    with pytest.raises(ValueError):
        artifacts.transform_from_dict(broken)
    monkeypatch.setattr(artifacts, 'MAX_FEATURES', 0)
    with pytest.raises(ValueError):
        artifacts.transform_from_dict(value)


@pytest.mark.parametrize('field,bad', [
    ('classes', [False]), ('classes', [True, False]), ('classes', [1, 1]),
    ('classes', ['no', 'yes']), ('classes', [0, float('nan')]),
    ('coefficients', [[1]]), ('coefficients', [[True, 1]]),
    ('coefficients', [[float('inf'), 1]]), ('coefficients', [[1, 2], [3, 4]]),
    ('intercept', []), ('intercept', [float('nan')]),
])
def test_bad_lr_rejected(field, bad):
    value = _lr()
    value[field] = bad
    with pytest.raises(ValueError):
        artifacts.model_from_dict(value, n_features=2)


@pytest.mark.parametrize('value', [None, [], {'algorithm': 'xgb'},
                                    {'learner': {}}, {'algorithm': '__import__'},
                                    dict(_lr(), module='os'),
                                    {'algorithm': 'rf', 'trees': []}])
def test_unknown_or_executable_metadata_rejected(value):
    with pytest.raises(ValueError):
        artifacts.model_from_dict(value, n_features=2)


@pytest.mark.parametrize('width', [True, 0, -1, 1025, 1.0, None])
def test_invalid_explicit_width_rejected(width):
    with pytest.raises(ValueError):
        artifacts.model_from_dict(_lr(), n_features=width)


@pytest.mark.parametrize('field,bad', [
    ('children_left', [1, -1]), ('children_left', [True, -1, -1]),
    ('children_left', [3, -1, -1]), ('children_left', [0, -1, -1]),
    ('children_left', [-1, -1, -1]), ('children_right', [1, -1, -1]),
    ('children_right', [2, 0, -1]), ('feature', [2, -2, -2]),
    ('feature', [-1, -2, -2]), ('feature', [0, -1, -2]),
    ('threshold', [float('nan'), -2, -2]),
    ('value', [[[0]], [[1]], [[float('inf')]]]),
    ('value', [[[0, 1]], [[1]], [[2]]]),
    ('value', [[[0], [1]], [[1]], [[2]]]),
])
def test_malformed_tree_rejected(field, bad):
    tree = _stump()
    tree[field] = bad
    with pytest.raises(ValueError):
        artifacts.model_from_dict(_rf(tree), n_features=2)


def test_disconnected_cycle_and_excessive_depth_rejected(monkeypatch):
    # Root is a leaf; nodes 1 and 2 form a disconnected cycle with a leaf each.
    tree = {'children_left': [-1, 2, 1, -1, -1],
            'children_right': [-1, 3, 4, -1, -1],
            'feature': [-2, 0, 0, -2, -2], 'threshold': [-2, 0, 0, -2, -2],
            'value': [[[0]]] * 5}
    with pytest.raises(ValueError, match='unreachable'):
        artifacts.model_from_dict(_rf(tree), n_features=1)
    monkeypatch.setattr(artifacts, 'MAX_TREE_DEPTH', 0)
    with pytest.raises(ValueError, match='deep'):
        artifacts.model_from_dict(_rf(), n_features=1)


@pytest.mark.parametrize('limit,value', [('MAX_TREES', 0), ('MAX_TREE_NODES', 2),
                                        ('MAX_TOTAL_NODES', 2)])
def test_forest_resource_limits(monkeypatch, limit, value):
    monkeypatch.setattr(artifacts, limit, value)
    with pytest.raises(ValueError):
        artifacts.model_from_dict(_rf(), n_features=2)


@pytest.mark.parametrize('algorithm', ['lr', 'rf'])
@pytest.mark.parametrize('matrix', [None, '12', [[1]], [[1, 2, 3]], [[True, 1]],
                                    [[None, 1]], [[float('nan'), 1]],
                                    [[float('inf'), 1]], [['1', 1]], [[10 ** 500, 1]]])
def test_bad_prediction_input_rejected(algorithm, matrix):
    model = artifacts.model_from_dict(_lr() if algorithm == 'lr' else _rf(), n_features=2)
    with pytest.raises(ValueError):
        model.predict(matrix)


def test_prediction_overflow_and_batch_limit(monkeypatch):
    lr = artifacts.model_from_dict(_lr(), n_features=2)
    rf = artifacts.model_from_dict(_rf(), n_features=2)
    with pytest.raises(ValueError):
        lr.predict([[1e308, 1e308]])
    with pytest.raises(ValueError):
        rf.predict([[1e100, 0]])
    monkeypatch.setattr(artifacts, 'MAX_BATCH_ROWS', 1)
    for model in (lr, rf):
        with pytest.raises(ValueError):
            model.predict([[0, 0], [0, 0]])


@pytest.mark.parametrize('text', [
    '{"algorithm":"lr","algorithm":"rf"}',
    '{"algorithm":NaN}', '{"algorithm":Infinity}', '{"algorithm":-Infinity}',
    '{', '[' * 1100 + '0' + ']' * 1100,
])
def test_invalid_json_rejected(tmp_path, text):
    path = tmp_path / 'bad.json'
    path.write_text(text, encoding='utf-8')
    with pytest.raises(ValueError):
        artifacts.load_model_json(path, n_features=2)


def test_json_byte_limit_and_invalid_encoding(tmp_path, monkeypatch):
    path = tmp_path / 'model.json'
    path.write_bytes(b'\xff')
    with pytest.raises(ValueError):
        artifacts.load_model_json(path, n_features=2)
    path.write_bytes(b' ' * 17)
    monkeypatch.setattr(artifacts, 'MAX_JSON_BYTES', 16)
    with pytest.raises(ValueError, match='byte limit'):
        artifacts.load_model_json(path, n_features=2)


def test_artifact_raw_schema_validation_and_transform_width(tmp_path, monkeypatch):
    transform = fit_transform([{'x': 1}], ['x'], split='train', standardize=True)
    transform_path = _write(tmp_path / 'transform.json', asdict(transform))
    model_path = _write(tmp_path / 'model.json', _lr())
    assert artifacts.predict_artifact(model_path, transform_path, [{'x': 1}]) == (0.5,)
    for row in ({}, {'y': 1}, {'x': 1, 'y': 2}, {'x': True}, {'x': float('inf')},
                {'x': 10 ** 500}, None):
        with pytest.raises(ValueError):
            artifacts.predict_artifact(model_path, transform_path, [row])
    monkeypatch.setattr(artifacts, 'MAX_BATCH_ROWS', 1)
    with pytest.raises(ValueError):
        artifacts.predict_artifact(model_path, transform_path, [{'x': 1}] * 2)
    _write(model_path, _lr(1))
    with pytest.raises(ValueError):
        artifacts.predict_artifact(model_path, transform_path, [{'x': 1}])
