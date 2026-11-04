"""Explicit local/demo predictor; no automatic runtime activation or DB writes."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

from app.ranking.observed_features import FEATURE_NAMES, SCHEMA_VERSION, EXTRACTOR_VERSION
from app.ranking.observed_features import extract_observed_features
from ml.ai2.artifact_prediction import transform_from_dict

MODEL_SHA256 = '5c0c5e3d4e81af28ef40086b5517d6e53c720f266b8ffb2663d64b866f518cd6'
TRANSFORM_SHA256 = '171d6b0af42c01620cf035ab9f6f46fa6756e0e90019e6f13e17829dada39a4c'
AI1_PINS = {
    'model_version': 'ai1-shadow:ranking-retention:871aeef8a305',
    'weights_sha256': '871aeef8a305b0336b443ce8ed1c275e0a656eee6760d87d8cab1b6665c829df',
    'manifest_sha256': 'bdfc4c0aef381cc73de2447251a27d4f1381f3787606833f79657931190620d4',
}
MODEL_VERSION = 'ai2-demo-xgb-observed-v1:' + MODEL_SHA256[:12]


@dataclass(frozen=True)
class DemoScore:
    candidate_id: str
    candidate_cv_id: str | None
    score: float
    job_snapshot_sha256: str
    candidate_snapshot_sha256: str
    reference_date: str
    model_version: str = MODEL_VERSION
    score_meaning: str = 'RELATIVE_RANKING_SCORE'
    feature_schema: str = SCHEMA_VERSION
    feature_extractor: str = EXTRACTOR_VERSION
    experimental: bool = True
    attribution_status: str = 'UNAVAILABLE'


class DemoPredictor:
    """Opt-in verified XGB native JSON only; caller enforces pool ownership.

    No historical score rewrite, probability/fit conversion or silent AI1 fallback.
    Reference date is explicit per assessment; training used2026-10-18. Online-date
    behavior has not been independently evaluated and is disclosed in demo scope.
    """

    @classmethod
    def load(cls, directory, *, enabled=False, node_env='production'):
        if not enabled:
            return None
        if node_env not in {'development', 'test'}:
            raise ValueError('AI2 demo is restricted to development/test')
        directory = Path(directory).absolute()
        for name, expected in (('model.json', MODEL_SHA256), ('transform.json', TRANSFORM_SHA256)):
            path = directory / name
            if any(p.is_symlink() or getattr(p, 'is_junction', lambda: False)()
                   for p in (path, *path.parents)):
                raise ValueError('artifact links forbidden')
            if path.stat().st_size > 16 * 1024 * 1024:
                raise ValueError('artifact size limit exceeded')
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError('frozen AI2 artifact checksum mismatch')
        transform = transform_from_dict(json.loads((directory / 'transform.json').read_text(encoding='utf-8')))
        if tuple(transform.feature_names) != FEATURE_NAMES or transform.standardize:
            raise ValueError('frozen feature transform mismatch')
        from xgboost import XGBRanker
        model = XGBRanker()
        model.load_model(str(directory / 'model.json'))
        if model.n_features_in_ != len(transform.output_names):
            raise ValueError('model input width mismatch')
        instance = cls()
        instance._model = model
        instance._transform = transform
        return instance

    def score(self, assessment, job, candidate, *, reference_date):
        import math
        import numpy as np
        features = extract_observed_features(assessment, job, candidate,
            reference_date=reference_date, **AI1_PINS)
        vector = self._transform.transform(features.numeric_row())
        value = float(self._model.predict(np.array([vector]))[0])
        if not math.isfinite(value):
            raise ValueError('nonfinite AI2 score')
        return DemoScore(candidate.candidateId, candidate.candidateCvId, value,
            features.job_snapshot_sha256, features.candidate_snapshot_sha256, reference_date)


def order_demo_pool(scores):
    """Sort a caller-authorized, bounded same-JD pool; never mixed/stale versions.

    Rank only within the supplied pool. A changed pool can change rank without
    changing the score. Authorization is NOT established by snapshot hashes.
    """
    import math
    if not isinstance(scores, (list, tuple)) or not 1 <= len(scores) <= 500:
        raise ValueError('bounded nonempty pool required')
    identities, bindings = set(), set()
    for item in scores:
        if not isinstance(item, DemoScore) or not isinstance(item.candidate_id, str) or not item.candidate_id.strip():
            raise ValueError('typed candidate scores required')
        if item.candidate_id in identities or not math.isfinite(item.score):
            raise ValueError('duplicate candidate or nonfinite score')
        identities.add(item.candidate_id)
        bindings.add((item.job_snapshot_sha256, item.reference_date, item.model_version,
                      item.feature_schema, item.feature_extractor))
        if item.model_version != MODEL_VERSION or item.feature_schema != SCHEMA_VERSION or item.feature_extractor != EXTRACTOR_VERSION:
            raise ValueError('incompatible score version')
    if len(bindings) != 1:
        raise ValueError('mixed job/date/version pool')
    return tuple(sorted(scores, key=lambda item: (-item.score, item.candidate_id)))
