"""Opt-in, local prediction for AI2 numeric JSON exports; not runtime wiring.

Only the existing binary logistic regression and single-output random forest
regression formats are supported. No pickle, estimator reconstruction, dynamic
imports, or executable model metadata is used. XGBoost/native JSON is explicitly
unsupported here rather than interpreted as one of these formats.
"""

from dataclasses import dataclass
import json
import math
import struct

from ml.ai2.preprocessing import FittedTransform


MAX_JSON_BYTES = 16 * 1024 * 1024
MAX_FEATURES = 512  # Before the transform adds missing indicators.
MAX_BATCH_ROWS = 1024
MAX_TREES = 256
MAX_TREE_NODES = 65535
MAX_TOTAL_NODES = 262144
MAX_TREE_DEPTH = 64
TRANSFORM_VERSION = 'ai2-median-indicators-v1'


def _keys(value, expected, description):
    if (not isinstance(value, dict) or len(value) != len(expected)
            or set(value) != set(expected)):
        raise ValueError('invalid ' + description + ' fields')


def _finite(value):
    if type(value) not in (int, float):
        raise ValueError('finite numeric JSON values required')
    try:
        number = float(value)
    except (OverflowError, ValueError) as exc:
        raise ValueError('numeric value outside supported range') from exc
    if not math.isfinite(number):
        raise ValueError('finite numeric JSON values required')
    return number


def _sequence(value, size, description):
    if not isinstance(value, (list, tuple)) or len(value) != size:
        raise ValueError('invalid ' + description + ' shape')
    return value


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON object key')
        result[key] = value
    return result


def _invalid_constant(value):
    raise ValueError('nonfinite JSON constant: ' + value)


def _read_json(path):
    # Read at most the limit plus one, not an unbounded read followed by a check.
    with open(path, 'rb') as stream:
        data = stream.read(MAX_JSON_BYTES + 1)
    if len(data) > MAX_JSON_BYTES:
        raise ValueError('artifact exceeds JSON byte limit')
    try:
        return json.loads(data.decode('utf-8'), object_pairs_hook=_unique_object,
                          parse_constant=_invalid_constant)
    except (UnicodeError, RecursionError, ValueError) as exc:
        raise ValueError('invalid numeric JSON artifact') from exc


def transform_from_dict(value):
    """Validate a JSON-decoded dataclasses.asdict(FittedTransform) roundtrip."""
    _keys(value, ('feature_names', 'medians', 'means', 'scales', 'all_missing',
                  'standardize', 'version'), 'transform')
    names = value['feature_names']
    if not isinstance(names, (list, tuple)) or not 1 <= len(names) <= MAX_FEATURES:
        raise ValueError('invalid feature count')
    if (any(not isinstance(name, str) or not name.strip() or len(name) > 256
            for name in names) or len(set(names)) != len(names)):
        raise ValueError('unique bounded nonempty feature names required')
    if value['version'] != TRANSFORM_VERSION or type(value['standardize']) is not bool:
        raise ValueError('unsupported transform version or scaling policy')
    size = len(names)
    numeric = {}
    for field in ('medians', 'means', 'scales'):
        numeric[field] = tuple(_finite(item) for item in
                               _sequence(value[field], size, field))
    if any(scale <= 0 for scale in numeric['scales']):
        raise ValueError('strictly positive scales required')
    missing = tuple(_sequence(value['all_missing'], size, 'all_missing'))
    if any(type(item) is not bool for item in missing):
        raise ValueError('boolean all_missing flags required')
    for index, flag in enumerate(missing):
        if flag and (numeric['medians'][index] != 0 or numeric['means'][index] != 0
                     or numeric['scales'][index] != 1):
            raise ValueError('invalid all-missing column constants')
    return FittedTransform(tuple(names), numeric['medians'], numeric['means'],
                           numeric['scales'], missing, value['standardize'],
                           value['version'])


def load_transform_json(path):
    return transform_from_dict(_read_json(path))


@dataclass(frozen=True)
class _Tree:
    left: tuple
    right: tuple
    features: tuple
    thresholds: tuple
    values: tuple

    def predict(self, row):
        node = 0
        while self.left[node] != -1:
            node = (self.left[node] if row[self.features[node]] <= self.thresholds[node]
                    else self.right[node])
        return self.values[node]


def _tree_from_dict(value, n_features):
    fields = ('children_left', 'children_right', 'feature', 'threshold', 'value')
    _keys(value, fields, 'tree')
    if not isinstance(value['children_left'], (list, tuple)):
        raise ValueError('invalid tree nodes')
    count = len(value['children_left'])
    if not 1 <= count <= MAX_TREE_NODES:
        raise ValueError('tree node limit exceeded')
    for field in fields:
        _sequence(value[field], count, field)
    left, right, features = (tuple(value[field]) for field in fields[:3])
    if any(type(item) is not int for items in (left, right, features) for item in items):
        raise ValueError('integer child indices and feature indices required')
    thresholds = tuple(_finite(item) for item in value['threshold'])
    predictions = []
    for item in value['value']:
        output = _sequence(_sequence(item, 1, 'single regression output')[0],
                           1, 'single regression value')
        predictions.append(_finite(output[0]))
    parents = [0] * count
    for node, (first, second, feature) in enumerate(zip(left, right, features)):
        if first == second == -1:
            if feature != -2:
                raise ValueError('invalid leaf feature sentinel')
            continue
        if (first == second or not 0 <= first < count or not 0 <= second < count
                or not 0 <= feature < n_features):
            raise ValueError('invalid child or split feature index')
        for child in (first, second):
            parents[child] += 1
    if parents[0] != 0 or any(number != 1 for number in parents[1:]):
        raise ValueError('tree must have one root and one parent per other node')
    seen, pending = set(), [(0, 0)]
    while pending:
        node, depth = pending.pop()
        if node in seen or depth > MAX_TREE_DEPTH:
            raise ValueError('cyclic or excessively deep tree')
        seen.add(node)
        if left[node] != -1:
            pending.extend(((left[node], depth + 1), (right[node], depth + 1)))
    if len(seen) != count:
        raise ValueError('unreachable tree nodes')
    return _Tree(left, right, features, thresholds, tuple(predictions))


def _float32(value):
    # sklearn's tree prediction casts inputs to float32 before comparing them to
    # double-precision thresholds. Skipping this changes near-threshold routing.
    try:
        result = struct.unpack('f', struct.pack('f', value))[0]
    except (OverflowError, struct.error) as exc:
        raise ValueError('RF input exceeds float32 range') from exc
    if not math.isfinite(result):
        raise ValueError('RF input exceeds float32 range')
    return result


@dataclass(frozen=True)
class NumericPredictor:
    """Validated loader output. Construct through model_from_dict/load_model_json.

    LR returns probability of classes[1], matching predict_proba(X)[:, 1].
    RF returns the mean of the single-output regression tree predictions.
    """

    algorithm: str
    n_features: int
    coefficients: tuple = ()
    intercept: float = 0.0
    trees: tuple = ()

    def predict(self, matrix):
        if not isinstance(matrix, (list, tuple)) or len(matrix) > MAX_BATCH_ROWS:
            raise ValueError('bounded list/tuple prediction batch required')
        scores = []
        for row in matrix:
            values = tuple(_finite(item) for item in
                           _sequence(row, self.n_features, 'prediction row'))
            try:
                if self.algorithm == 'lr':
                    margin = math.fsum(weight * item for weight, item in
                                       zip(self.coefficients, values)) + self.intercept
                    if not math.isfinite(margin):
                        raise ValueError('nonfinite LR margin')
                    if margin >= 0:
                        score = 1.0 / (1.0 + math.exp(-margin))
                    else:
                        exp_margin = math.exp(margin)
                        score = exp_margin / (1.0 + exp_margin)
                else:
                    values = tuple(_float32(item) for item in values)
                    # Divide first to avoid overflow when averaging finite values.
                    score = math.fsum(tree.predict(values) / len(self.trees)
                                      for tree in self.trees)
                if not math.isfinite(score):
                    raise ValueError('nonfinite prediction')
            except OverflowError as exc:
                raise ValueError('prediction exceeds numeric precision') from exc
            scores.append(score)
        return tuple(scores)


def model_from_dict(value, *, n_features):
    """Load only the formats emitted by train_experiment._save_model.

    RF artifacts do not contain n_features_in_; require the caller to bind the
    model to the validated transform's output width. Semantic schema identity
    cannot be recovered from these artifacts and is not claimed by this helper.
    """
    if type(n_features) is not int or not 1 <= n_features <= 2 * MAX_FEATURES:
        raise ValueError('bounded explicit input width required')
    if not isinstance(value, dict):
        raise ValueError('model object required')
    algorithm = value.get('algorithm')
    if algorithm == 'lr':
        _keys(value, ('algorithm', 'classes', 'coefficients', 'intercept'), 'LR model')
        classes = _sequence(value['classes'], 2, 'binary classes')
        # The exporter uses boolean classes for y >= 2; numeric binary labels are
        # also safe. Preserve sklearn's second-column meaning, not label guessing.
        labels = tuple(float(item) if type(item) is bool else _finite(item)
                       for item in classes)
        if not labels[0] < labels[1]:
            raise ValueError('ordered distinct binary classes required')
        coefficients = _sequence(value['coefficients'], 1, 'binary coefficients')[0]
        coefficients = tuple(_finite(item) for item in
                             _sequence(coefficients, n_features, 'coefficients'))
        intercept = _finite(_sequence(value['intercept'], 1, 'intercept')[0])
        return NumericPredictor('lr', n_features, coefficients, intercept)
    if algorithm == 'rf':
        _keys(value, ('algorithm', 'trees'), 'RF model')
        trees = value['trees']
        if not isinstance(trees, (list, tuple)) or not 1 <= len(trees) <= MAX_TREES:
            raise ValueError('bounded nonempty forest required')
        validated, total = [], 0
        for tree in trees:
            # Count before validating/allocating each additional tree.
            if not isinstance(tree, dict) or not isinstance(tree.get('children_left'), (list, tuple)):
                raise ValueError('invalid tree nodes')
            total += len(tree['children_left'])
            if total > MAX_TOTAL_NODES:
                raise ValueError('forest total node limit exceeded')
            validated.append(_tree_from_dict(tree, n_features))
        return NumericPredictor('rf', n_features, trees=tuple(validated))
    raise ValueError('unsupported artifact: only binary LR and scalar RF JSON are supported')


def load_model_json(path, *, n_features):
    return model_from_dict(_read_json(path), n_features=n_features)


def predict_artifact(model_path, transform_path, rows):
    """Return local parity scores for raw rows, without fitting or runtime wiring."""
    if not isinstance(rows, (list, tuple)) or len(rows) > MAX_BATCH_ROWS:
        raise ValueError('bounded list/tuple feature batch required')
    transform = load_transform_json(transform_path)
    model = load_model_json(model_path, n_features=2 * len(transform.feature_names))
    matrix = []
    for row in rows:
        if not isinstance(row, dict) or len(row) != len(transform.feature_names):
            raise ValueError('feature row keys must match schema exactly')
        # FittedTransform enforces exact raw feature keys and finite numbers/None.
        try:
            matrix.append(transform.transform(row))
        except (OverflowError, TypeError) as exc:
            raise ValueError('invalid raw feature values') from exc
    return model.predict(matrix)
