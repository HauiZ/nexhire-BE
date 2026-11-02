"""Seven-feature assembly parity, not model quality."""

from dataclasses import asdict

import pytest

from test_ai2_observed_features import bundle, PIN
from app.ranking.observed_features import FEATURE_NAMES as OLD_NAMES
from app.ranking.source_features import (
    FEATURE_NAMES, AI1_FEATURE_NAMES, extract_source_features,
)
from app.schemas.jd_plan import snapshot_digest


def extract(values):
    return extract_source_features(*values, reference_date='2026-10-18', **PIN)


def test_order_old_values_and_no_ai1_information_set():
    result = extract(bundle())
    assert tuple(result.numeric_row()) == FEATURE_NAMES
    assert tuple(result.numeric_row())[0:5] == OLD_NAMES
    assert result.numeric_row()['experience_top1_fraction'] == 0
    assert result.numeric_row()['experience_missing_from_top3_fraction'] == 1
    assert tuple(n for n in FEATURE_NAMES if n not in AI1_FEATURE_NAMES) == (
        'chronology_known_months', 'chronology_incomplete')
    assert result.schema_version == 'candidate-job-source-v2'


def test_transport_and_hash_parity():
    values = bundle()
    restored = tuple(type(v).model_validate_json(v.model_dump_json()) for v in values)
    assert asdict(extract(values)) == asdict(extract(restored))
    assert extract(values).content_sha256() == extract(restored).content_sha256()


def test_empty_requirements_missing_not_zero():
    assessment, job, candidate = bundle()
    job = job.model_copy(update={'requirements': ''})
    assessment = assessment.model_copy(update={'requirements': (), 'jobSnapshotSha256': snapshot_digest(job)})
    result = extract((assessment, job, candidate))
    assert result.experience_top1_fraction is None
    assert result.experience_missing_from_top3_fraction is None


def test_unavailable_fails_closed():
    assessment, job, candidate = bundle()
    with pytest.raises(ValueError):
        extract((assessment.model_copy(update={'status': 'UNAVAILABLE'}), job, candidate))
