"""Default-off demo gates and pool isolation; no DB or model inference."""
from dataclasses import replace

import pytest

from app.ranking.demo_predictor import DemoPredictor, DemoScore, order_demo_pool


def score(identity='a', value=1):
    return DemoScore(identity, None, value, 'a' * 64, 'b' * 64, '2026-10-18')


def test_disabled_never_reads_artifacts(tmp_path):
    assert DemoPredictor.load(tmp_path / 'missing') is None


def test_production_refused_before_loading(tmp_path):
    with pytest.raises(ValueError, match='development/test'):
        DemoPredictor.load(tmp_path, enabled=True)


def test_same_pool_sort_and_lexical_ties():
    assert [s.candidate_id for s in order_demo_pool([score('b'), score('a'), score('c', 2)])] == ['c', 'a', 'b']


@pytest.mark.parametrize('changed', [
    {'job_snapshot_sha256': 'c' * 64}, {'reference_date': '2026-10-19'},
    {'model_version': 'other'}, {'feature_schema': 'other'},
    {'feature_extractor': 'other'}, {'score': float('nan')},
])
def test_incompatible_pool_refused(changed):
    with pytest.raises(ValueError):
        order_demo_pool([score('a'), replace(score('b'), **changed)])


def test_duplicate_and_empty_pool_refused():
    for values in ([], [score(), score()]):
        with pytest.raises(ValueError):
            order_demo_pool(values)


def test_tampered_artifact_refused(tmp_path):
    (tmp_path / 'model.json').write_text('{}')
    with pytest.raises(ValueError, match='checksum'):
        DemoPredictor.load(tmp_path, enabled=True, node_env='test')
