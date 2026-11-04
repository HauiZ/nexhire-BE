"""Matched train-only grouped CV for five versus seven observable signals.

Exploratory experiment only: original held-out sets are not opened here.
"""

from dataclasses import asdict
import json
from pathlib import Path

from app.ranking.observed_features import FEATURE_NAMES as V1_NAMES
from app.ranking.source_features import FEATURE_NAMES as V2_NAMES, AI1_FEATURE_NAMES
from ml.ai2.metrics import evaluate_ranking
from ml.ai2.preprocessing import fit_transform
from ml.ai2.uncertainty import paired_bootstrap


def compare_source_cv(rows, output, *, seed=42):
    """Same group folds/configurations, preprocessing fit separately per fold.

    OOF results are development diagnostics, not independent confirmation. Model
    selection uses these folds so bootstrap intervals are descriptive, not unbiased
    post-selection significance. No final fitted model or production activation.
    """
    import numpy as np
    from itertools import groupby
    from sklearn.model_selection import GroupKFold
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import RandomForestRegressor
    from xgboost import XGBRanker

    if not rows or any(r['split'] != 'train' for r in rows):
        raise ValueError('train-only nonempty rows required')
    seen = set()
    for row in rows:
        key = (row['job_id'], row['candidate_id'])
        if (any(not isinstance(v, str) or not v.strip() for v in key) or key in seen
                or type(row['relevance']) is not int or not 0 <= row['relevance'] <= 3
                or set(row['features']) != set(V2_NAMES)):
            raise ValueError('invalid identity, target or seven-feature schema')
        seen.add(key)
    ordered = sorted(rows, key=lambda r: (r['job_id'], r['candidate_id']))
    groups = [r['job_id'] for r in ordered]
    sizes = [len(list(g)) for _, g in groupby(groups)]
    if len(sizes) < 3 or any(n != 4 for n in sizes):
        raise ValueError('at least three train jobs, exactly four candidates per job required')
    folds = list(GroupKFold(n_splits=3).split(ordered, groups=groups))
    configs = {
        'lr': [{'C': 0.1}, {'C': 1.0}, {'C': 10.0}],
        'rf': [{'max_depth': 3, 'min_samples_leaf': 4}, {'max_depth': 6, 'min_samples_leaf': 4}],
        'xgb': [{'max_depth': 2, 'learning_rate': 0.05}, {'max_depth': 3, 'learning_rate': 0.05}],
    }
    modes = {'v1': V1_NAMES, 'v2': V2_NAMES,
             'no_ai1': tuple(n for n in V2_NAMES if n not in AI1_FEATURE_NAMES)}
    results = {}
    for mode, names in modes.items():
        for algorithm, options in configs.items():
            trials = []
            for config in options:
                predictions, fold_scores = [], []
                for train_indices, held_indices in folds:
                    train = [ordered[i] for i in train_indices]
                    held = [ordered[i] for i in held_indices]
                    transform = fit_transform([{n: r['features'][n] for n in names} for r in train],
                        names, split='train', standardize=algorithm == 'lr')
                    def matrix(values):
                        return np.array([transform.transform({n: r['features'][n] for n in names}) for r in values])
                    y = np.array([r['relevance'] for r in train])
                    if algorithm == 'lr':
                        if len(set(y >= 2)) != 2:
                            raise ValueError('LR train fold lacks both classes')
                        model = LogisticRegression(max_iter=2000, random_state=seed, **config)
                        model.fit(matrix(train), y >= 2)
                        scores = model.predict_proba(matrix(held))[:, 1]
                    elif algorithm == 'rf':
                        model = RandomForestRegressor(n_estimators=100, n_jobs=2, random_state=seed, **config)
                        model.fit(matrix(train), y)
                        scores = model.predict(matrix(held))
                    else:
                        model = XGBRanker(objective='rank:ndcg', tree_method='hist',
                            n_estimators=100, n_jobs=2, random_state=seed, **config)
                        group_sizes = [len(list(g)) for _, g in groupby(train, key=lambda r: r['job_id'])]
                        model.fit(matrix(train), y, group=group_sizes)
                        scores = model.predict(matrix(held))
                    scored = [dict(job_id=r['job_id'], candidate_id=r['candidate_id'],
                        relevance=r['relevance'], score=float(score)) for r, score in zip(held, scores)]
                    fold_scores.append(evaluate_ranking(scored)['aggregate']['ndcg@3']['value'])
                    predictions.extend(scored)
                if any(value is None for value in fold_scores):
                    raise ValueError('undefined primary fold metric')
                trials.append({'config': config, 'fold_ndcg3': fold_scores,
                    'mean_fold_ndcg3': sum(fold_scores) / len(fold_scores),
                    'oof_metrics': evaluate_ranking(predictions), 'oof_predictions': predictions})
            selected = max(range(len(trials)), key=lambda i: trials[i]['mean_fold_ndcg3'])
            results[mode + '/' + algorithm] = {'selected_index': selected, 'trials': trials}
    comparisons = {}
    for algorithm in configs:
        def selected_metrics(mode):
            result = results[mode + '/' + algorithm]
            return result['trials'][result['selected_index']]['oof_metrics']
        old, new = selected_metrics('v1'), selected_metrics('v2')
        comparisons[algorithm] = paired_bootstrap(
            {j: v['metrics']['ndcg@3'] for j, v in new['per_job'].items()},
            {j: v['metrics']['ndcg@3'] for j, v in old['per_job'].items()})
    fold_membership = [{'fold': i, 'held_job_ids': sorted({groups[j] for j in held})}
                       for i, (_, held) in enumerate(folds)]
    report = {'status': 'train_cv_exploratory_not_confirmation', 'seed': seed,
        'rows': len(rows), 'jobs': len(sizes), 'folds': fold_membership,
        'feature_information': {k: list(v) for k, v in modes.items()},
        'results': results, 'v2_minus_v1': comparisons,
        'test_opened': False, 'validation_opened': False, 'production_approved': False,
        'limitations': ['Same folds select configs and report OOF scores; not nested unbiased evaluation',
                       'Intervals descriptive after selection; no superiority or promotion decision']}
    with Path(output).open('x', encoding='utf-8') as stream:
        json.dump(report, stream, allow_nan=False, indent=2)
    return report
