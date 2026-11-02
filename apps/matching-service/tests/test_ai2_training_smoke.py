"""Tiny synthetic training checks execution, never real ranking quality."""

import json

from ml.ai2.train_experiment import run_experiment


def rows(split, jobs):
    output = []
    for job in range(jobs):
        for candidate in range(4):
            output.append({'split': split, 'job_id': f'{split}-j{job}',
                'candidate_id': f'{split}-j{job}-c{candidate}', 'relevance': candidate,
                'features': {'semantic_mean_top1': candidate / 4,
                    'semantic_min_top1': candidate / 5, 'semantic_no_evidence_fraction': 0,
                    'chronology_known_months': candidate * 12,
                    'chronology_incomplete': 0}})
    return output


def test_tiny_training_artifacts_and_ablation(tmp_path):
    output = tmp_path / 'experiment'
    report = run_experiment(rows('train', 3), rows('validation', 2), output)
    assert len(report['results']) == 6
    assert report['test_evaluated'] is False
    assert len(report['random_baselines']) == 20
    for algorithm in ('lr', 'rf', 'xgb'):
        transform = json.loads((output / 'no_ai1' / algorithm / 'transform.json').read_text())
        assert not any(name.startswith('semantic') for name in transform['feature_names'])
        assert (output / 'full' / algorithm / 'model.json').is_file()
    assert (output / 'checksums.json').is_file()
