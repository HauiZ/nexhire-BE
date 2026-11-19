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


def test_frozen_xgb_native_prediction_parity_for_exact_whole_source_v2():
    """Check the frozen XGBoost on synthetic whole-source and v2 observations."""
    import hashlib
    import os
    from pathlib import Path
    from app.ranking.demo_predictor import AI1_PINS, MODEL_SHA256, TRANSFORM_SHA256
    from app.ranking.observed_features import extract_observed_features
    from ml.ai2.artifact_prediction import transform_from_dict
    from test_ai2_observed_features import bundle, query_bundle
    import json
    artifact_path = os.environ.get('MATCHING_AI2_DEMO_ARTIFACT_PATH')
    if not artifact_path:
        pytest.skip('Set MATCHING_AI2_DEMO_ARTIFACT_PATH to run native XGBoost artifact parity')
    directory = Path(artifact_path)
    def hashes():
        return {name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
                for name in ('model.json', 'transform.json')}
    before = hashes()
    assert before == {'model.json': MODEL_SHA256, 'transform.json': TRANSFORM_SHA256}
    assessment, job, candidate = bundle()
    assessment = assessment.model_copy(update={
        'modelVersion': AI1_PINS['model_version'], 'weightsSha256': AI1_PINS['weights_sha256'],
        'manifestSha256': AI1_PINS['manifest_sha256']})
    original = assessment, job, candidate
    updated = query_bundle(original)
    transform = transform_from_dict(json.loads((directory / 'transform.json').read_text(encoding='utf-8')))
    def vector(values):
        return transform.transform(extract_observed_features(*values,
            reference_date='2026-10-18', **AI1_PINS).numeric_row())
    assert vector(original) == vector(updated)
    predictor = DemoPredictor.load(directory, enabled=True, node_env='test')
    old_score = predictor.score(*original, reference_date='2026-10-18')
    new_score = predictor.score(*updated, reference_date='2026-10-18')
    assert old_score == new_score
    # Deliberately changed M1 query observations, not v1 value-invariance.
    from app.schemas.jd_plan import content_digest
    from app.schemas.ai1 import Ai1Requirement
    query_assessment, query_job, query_candidate = updated
    plan = query_assessment.fixedPlan
    source = plan.sources[0]
    first = source.components[0]
    components = (first.model_copy(update={'id': 'first', 'query': 'Py', 'source_quote': 'Py'}),
                  first.model_copy(update={'id': 'second', 'query': 'thon', 'source_quote': 'thon'}))
    plan = plan.model_copy(update={'sources': (source.model_copy(update={'components': components}),)})
    plan = plan.model_copy(update={'approval': plan.approval.model_copy(update={'content_sha256': content_digest(plan)})})
    hit = query_assessment.requirements[0].evidence[0]
    rows = tuple(Ai1Requirement(requirementId=f'{source.source_id}/{part.id}', text=part.query,
        retrievalStatus='CANDIDATE_EVIDENCE', evidence=(hit.model_copy(update={'similarityScore': score}),))
        for part, score in zip(components, (80., 40.)))
    query_assessment = query_assessment.model_copy(update={'fixedPlan': plan, 'requirements': rows})
    general = (query_assessment, query_job, query_candidate)
    features = extract_observed_features(*general, reference_date='2026-10-18', **AI1_PINS)
    assert features.values == pytest.approx((.6, .4, 0., 12., 0.))
    import math
    assert math.isfinite(predictor.score(*general, reference_date='2026-10-18').score)
    missing = query_assessment.model_copy(update={'requirements': tuple(row.model_copy(
        update={'retrievalStatus': 'NO_EVIDENCE', 'evidence': ()}) for row in rows)})
    missing_features = extract_observed_features(missing, query_job, query_candidate,
        reference_date='2026-10-18', **AI1_PINS)
    assert missing_features.values[:3] == (None, None, 1.)
    assert math.isfinite(predictor.score(missing, query_job, query_candidate, reference_date='2026-10-18').score)
    assert hashes() == before
