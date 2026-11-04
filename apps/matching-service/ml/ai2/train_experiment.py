"""User-run experimental tabular comparison; held-out test never opened here."""

from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path

from app.ranking.observed_features import FEATURE_NAMES, AI1_FEATURE_NAMES
from ml.ai2.metrics import evaluate_ranking
from ml.ai2.preprocessing import fit_transform
from ml.ai2.uncertainty import paired_bootstrap


def _evaluate(rows, scores):
    if len(rows) != len(scores):
        raise ValueError('prediction count must match source rows')
    return evaluate_ranking([{'job_id': row['job_id'], 'candidate_id': row['candidate_id'],
        'relevance': row['relevance'], 'score': float(score)} for row, score in zip(rows, scores)])


def _primary(result):
    value = result['aggregate']['ndcg@3']['value']
    if value is None:
        raise ValueError('NDCG@3 undefined for complete evaluation')
    return value


def _save_model(model, algorithm, path):
    """Export numeric data only; loader/parity still required before activation."""
    if algorithm == 'lr':
        value = {'algorithm': 'lr', 'classes': model.classes_.tolist(),
                 'coefficients': model.coef_.tolist(), 'intercept': model.intercept_.tolist()}
    elif algorithm == 'rf':
        value = {'algorithm': 'rf', 'trees': []}
        for estimator in model.estimators_:
            tree = estimator.tree_
            value['trees'].append({name: getattr(tree, name).tolist() for name in (
                'children_left', 'children_right', 'feature', 'threshold', 'value')})
    else:
        model.save_model(str(path))
        return
    path.write_text(json.dumps(value, allow_nan=False), encoding='utf-8')


def run_experiment(train, validation, output_dir, *, seed=42):
    """Bounded group-CV selection then validation comparison, never test selection.

    Requires precomputed versioned feature export. No input pickle/model loading.
    All model families see same information. Separate noAI1 experiments remove
    every semantic feature and its missing indicator, not just the mean column.
    """
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import GroupKFold
    from xgboost import XGBRanker

    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=False)
    for rows, split in ((train, 'train'), (validation, 'validation')):
        if not rows or any(row['split'] != split for row in rows):
            raise ValueError('nonempty canonical train and validation inputs required')
        seen = set()
        for row in rows:
            key = (row['job_id'], row['candidate_id'])
            if key in seen or type(row['relevance']) is not int or not 0 <= row['relevance'] <= 3:
                raise ValueError('duplicate pair or invalid target')
            seen.add(key)
            if set(row['features']) != set(FEATURE_NAMES):
                raise ValueError('exact observed feature schema required')
    if ({r['job_id'] for r in train} & {r['job_id'] for r in validation}
            or {r['candidate_id'] for r in train} & {r['candidate_id'] for r in validation}):
        raise ValueError('cross-split identity conflict')
    groups = np.array([r['job_id'] for r in train])
    if len(set(groups)) < 3:
        raise ValueError('at least3train job groups required')
    configs = {
        'lr': [{'C': 0.1}, {'C': 1.0}, {'C': 10.0}],
        'rf': [{'max_depth': 3, 'min_samples_leaf': 4},
               {'max_depth': 6, 'min_samples_leaf': 4}],
        'xgb': [{'max_depth': 2, 'learning_rate': 0.05},
                {'max_depth': 3, 'learning_rate': 0.05}],
    }

    def fit(rows, names, algorithm, config):
        transform = fit_transform([{name: r['features'][name] for name in names} for r in rows],
                                  names, split='train', standardize=algorithm == 'lr')
        ordered = sorted(rows, key=lambda r: (r['job_id'], r['candidate_id']))
        x = np.array([transform.transform({name: r['features'][name] for name in names}) for r in ordered])
        y = np.array([r['relevance'] for r in ordered])
        if algorithm == 'lr':
            if len(set(y >= 2)) != 2:
                raise ValueError('LR train fold requires both binary classes')
            model = LogisticRegression(max_iter=2000, random_state=seed, **config)
            model.fit(x, y >= 2)
        elif algorithm == 'rf':
            model = RandomForestRegressor(n_estimators=100, n_jobs=2, random_state=seed, **config)
            model.fit(x, y)
        else:
            model = XGBRanker(objective='rank:ndcg', n_estimators=100, n_jobs=2,
                              random_state=seed, tree_method='hist', **config)
            from itertools import groupby
            group_sizes = [len(list(group)) for _, group in groupby(ordered, key=lambda row: row['job_id'])]
            model.fit(x, y, group=group_sizes)
        return model, transform

    def predict(model, transform, rows, algorithm):
        x = np.array([transform.transform({name: r['features'][name] for name in transform.feature_names}) for r in rows])
        return model.predict_proba(x)[:, 1] if algorithm == 'lr' else model.predict(x)

    results, search = {}, {}
    for mode in ('full', 'no_ai1'):
        names = FEATURE_NAMES if mode == 'full' else tuple(n for n in FEATURE_NAMES if n not in AI1_FEATURE_NAMES)
        for algorithm, options in configs.items():
            key = mode + '/' + algorithm
            trials = []
            for config in options:
                fold_scores = []
                for fit_indices, held_indices in GroupKFold(n_splits=3).split(train, groups=groups):
                    fit_rows = [train[i] for i in fit_indices]
                    held_rows = [train[i] for i in held_indices]
                    model, transform = fit(fit_rows, names, algorithm, config)
                    fold_scores.append(_primary(_evaluate(held_rows, predict(model, transform, held_rows, algorithm))))
                trials.append({'config': config, 'fold_ndcg3': fold_scores,
                               'mean_ndcg3': float(np.mean(fold_scores))})
            # Stable config-order tie break, not validation-driven search.
            selected = max(range(len(trials)), key=lambda i: trials[i]['mean_ndcg3'])
            model, transform = fit(train, names, algorithm, trials[selected]['config'])
            predictions = predict(model, transform, validation, algorithm)
            evaluation = _evaluate(validation, predictions)
            folder = output / mode / algorithm
            folder.mkdir(parents=True)
            _save_model(model, algorithm, folder / 'model.json')
            (folder / 'transform.json').write_text(json.dumps(asdict(transform)), encoding='utf-8')
            if algorithm in {'lr', 'rf'}:
                from ml.ai2.artifact_prediction import predict_artifact
                restored = predict_artifact(folder / 'model.json', folder / 'transform.json',
                    [{name: row['features'][name] for name in names} for row in validation])
                if not np.allclose(restored, predictions, rtol=1e-10, atol=1e-10):
                    raise ValueError('exported numeric artifact prediction parity failed')
            else:
                restored_model = XGBRanker()
                restored_model.load_model(str(folder / 'model.json'))
                if not np.allclose(predict(restored_model, transform, validation, algorithm),
                                   predictions, rtol=1e-7, atol=1e-7):
                    raise ValueError('native XGB JSON prediction parity failed')
            evaluation['artifact_prediction_parity_verified'] = True
            evaluation['artifact_pairing_note'] = 'Same-run verification only; use receipt hashes to bind model and transform'
            (folder / 'validation_predictions.json').write_text(json.dumps([
                {'job_id': row['job_id'], 'candidate_id': row['candidate_id'],
                 'relevance': row['relevance'], 'score': float(score)}
                for row, score in zip(validation, predictions)], allow_nan=False), encoding='utf-8')
            results[key] = evaluation
            search[key] = {'trials': trials, 'selected_config_index': selected}
    baselines = {}
    for name, feature in (('semantic_only', 'semantic_mean_top1'), ('chronology_only', 'chronology_known_months')):
        transform = fit_transform([{feature: r['features'][feature]} for r in train],
                                  [feature], split='train', standardize=False)
        baselines[name] = _evaluate(validation, [transform.transform({feature: r['features'][feature]})[0] for r in validation])
    random_results = []
    for random_seed in range(20):
        import random
        rng = random.Random(random_seed)
        ordered = sorted(validation, key=lambda r: (r['job_id'], r['candidate_id']))
        random_results.append(_evaluate(ordered, [rng.random() for _ in ordered]))
    # Average fixed random seeds per job; never pick the luckiest random seed.
    random_per_job = {job: float(np.mean([result['per_job'][job]['metrics']['ndcg@3']
                      for result in random_results]))
                      if random_results[0]['per_job'][job]['metrics']['ndcg@3'] is not None else None
                      for job in random_results[0]['per_job']}
    eligible_random = [value for value in random_per_job.values() if value is not None]
    random_primary = float(np.mean(eligible_random)) if eligible_random else None
    report = {'status': 'experimental_validation_only_not_production_approved',
              'seed': seed, 'results': results, 'search': search, 'baselines': baselines,
              'random_baselines': random_results, 'test_evaluated': False,
              'scope': 'observable_signals_not_full_rubric', 'model_loader_parity_verified': False}
    comparator_scores = {name: _primary(value) for name, value in baselines.items()}
    if random_primary is not None:
        comparator_scores['random_mean_20_seeds'] = random_primary
    comparator = max(comparator_scores, key=comparator_scores.get)
    baseline_jobs = (random_per_job if comparator == 'random_mean_20_seeds' else
                     {j: value['metrics']['ndcg@3'] for j, value in baselines[comparator]['per_job'].items()})
    report['random_mean_ndcg3'] = random_primary
    report['acceptance'] = {'production_approved': False,
        'family_gate': 'not_evaluated_missing_family_metadata',
        'selection_frozen': False, 'test_evaluation_allowed': False}
    for key, result in results.items():
        uncertainty = paired_bootstrap(
            {j: value['metrics']['ndcg@3'] for j, value in result['per_job'].items()}, baseline_jobs)
        result['comparison_to_strongest_baseline'] = {'name': comparator, 'uncertainty': uncertainty,
            'point_gain_gate': uncertainty['difference'] is not None and uncertainty['difference'] >= 0.02,
            'positive_ci': uncertainty['ci_lower'] is not None and uncertainty['ci_lower'] > 0}
    (output / 'report.json').write_text(json.dumps(report, allow_nan=False, indent=2), encoding='utf-8')
    hashes = {path.relative_to(output).as_posix(): sha256(path.read_bytes()).hexdigest()
              for path in sorted(output.rglob('*.json'))}
    (output / 'checksums.json').write_text(json.dumps(hashes, indent=2), encoding='utf-8')
    return report
