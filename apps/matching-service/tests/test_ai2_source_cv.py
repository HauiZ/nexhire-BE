"""Tiny train-only grouped CV execution, not ranking quality evidence."""

import pytest

from ml.ai2.source_cv import compare_source_cv
from test_ai2_training_smoke import rows


def source_rows():
    values = rows('train', 3)
    for value in values:
        rel = value['relevance']
        value['features'].update(experience_top1_fraction=rel / 4,
                                 experience_missing_from_top3_fraction=1 - rel / 4)
    return values


def test_matched_cv_ablation_and_group_integrity(tmp_path):
    result = compare_source_cv(source_rows(), tmp_path / 'report.json')
    assert len(result['results']) == 9
    assert result['test_opened'] is result['validation_opened'] is False
    assert len(result['feature_information']['v2']) == 7
    assert len(result['feature_information']['v1']) == 5
    assert result['feature_information']['no_ai1'] == ['chronology_known_months', 'chronology_incomplete']
    jobs = [j for fold in result['folds'] for j in fold['held_job_ids']]
    assert len(jobs) == len(set(jobs)) == 3
    assert all(len(trial['oof_predictions']) == 12 for value in result['results'].values()
               for trial in value['trials'])


def test_heldout_input_rejected(tmp_path):
    values = source_rows()
    values[0]['split'] = 'test'
    with pytest.raises(ValueError, match='train-only'):
        compare_source_cv(values, tmp_path / 'report.json')
