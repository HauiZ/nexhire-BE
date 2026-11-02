"""Explicit train-fitted median/scaling transform, independent of feature selection."""

from dataclasses import dataclass
import math
from numbers import Real
from statistics import median


def _number(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, Real) or not math.isfinite(value):
        raise ValueError('features must be finite numbers or None')
    return float(value)


def _row(row, names):
    if not isinstance(row, dict) or set(row) != set(names):
        raise ValueError('feature row keys must match schema exactly')
    return tuple(_number(row[name]) for name in names)


@dataclass(frozen=True)
class FittedTransform:
    feature_names: tuple[str, ...]
    medians: tuple[float, ...]
    means: tuple[float, ...]
    scales: tuple[float, ...]
    all_missing: tuple[bool, ...]
    standardize: bool
    version: str = 'ai2-median-indicators-v1'

    def transform(self, row):
        values = _row(row, self.feature_names)
        result = []
        for index, value in enumerate(values):
            imputed = self.medians[index] if value is None else value
            transformed = ((imputed - self.means[index]) / self.scales[index]
                           if self.standardize else imputed)
            if not math.isfinite(transformed):
                raise ValueError('nonfinite transformed value')
            result.extend((transformed, float(value is None)))
        return tuple(result)

    @property
    def output_names(self):
        return tuple(value for name in self.feature_names
                     for value in (name + '/value', name + '/missing'))


def fit_transform(rows, feature_names, *, split, standardize):
    """Fit on explicitly train-tagged records only; never split or infer labels.

    Entirely missing train columns use explicit constant 0 with an all_missing flag;
    every numeric value has a separate missing indicator. Source None remains in
    original observations. Constant columns scale=1. No automatic column dropping.
    Caller must validate immutable split lineage; a string is not proof of origin.
    """
    if split != 'train':
        raise ValueError('transform fitting restricted to train')
    names = tuple(feature_names)
    if (not names or any(not isinstance(name, str) or not name.strip() for name in names)
            or len(set(names)) != len(names) or type(standardize) is not bool):
        raise ValueError('unique nonempty feature names and explicit scaling policy required')
    matrix = [_row(row, names) for row in rows]
    if not matrix:
        raise ValueError('nonempty train rows required')
    medians, means, scales, missing = [], [], [], []
    for index in range(len(names)):
        observed = [row[index] for row in matrix if row[index] is not None]
        center = median(observed) if observed else 0.0
        values = [center if row[index] is None else row[index] for row in matrix]
        mean = math.fsum(value / len(values) for value in values)
        try:
            variance = math.fsum(((value - mean) ** 2) / len(values) for value in values)
            scale = math.sqrt(variance) or 1.0
        except OverflowError as exc:
            raise ValueError('numeric range exceeds transform precision') from exc
        if not all(math.isfinite(value) for value in (center, mean, scale)):
            raise ValueError('nonfinite fitted transform')
        medians.append(center)
        means.append(mean)
        scales.append(scale)
        missing.append(not observed)
    return FittedTransform(names, tuple(medians), tuple(means), tuple(scales),
                           tuple(missing), standardize)
