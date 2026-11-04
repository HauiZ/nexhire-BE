"""Portable user-run extraction and training entry points; no test evaluation."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from types import SimpleNamespace


def extract(bundle, output):
    from app.matching.ai1 import assess_local
    from app.matching.m1_runtime import LocalM1Runtime
    from app.schemas.snapshot_boundary import normalize_job_snapshot
    from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
    from ml.ai2.export_observed import export_records
    pins = json.loads((bundle / 'pins.json').read_text(encoding='utf-8'))
    rows = [json.loads(line) for line in (bundle / 'dataset/ranking.jsonl').read_text(encoding='utf-8').splitlines()]
    snapshots = json.loads((bundle / 'dataset/snapshots.json').read_text(encoding='utf-8'))
    manifest = bundle / 'm1/shadow-ranking-retention.json'
    runtime = LocalM1Runtime.from_manifest(manifest, pins['manifest_sha256'])
    settings = SimpleNamespace(ai1_manifest_sha256=pins['manifest_sha256'])
    context = SimpleNamespace(status='UNPREPARED', confirmed_plan=None)
    output.mkdir(parents=True, exist_ok=True)
    for split in ('train', 'validation'):
        destination = output / (split + '_features.jsonl')
        if destination.exists():
            raise ValueError('feature output already exists; verify receipt before reusing manually')
        selected = sorted((row for row in rows if row['split'] == split),
                          key=lambda row: (row['job_id'], row['candidate_id']))
        assessments = {}
        for index, row in enumerate(selected):
            job = JobMatchingSnapshot.model_validate(normalize_job_snapshot(snapshots['jobs'][row['job_id']]))
            candidate = CandidateMatchingSnapshot.model_validate(snapshots['candidates'][row['candidate_id']])
            assessment = assess_local(runtime, settings, job, candidate, context)
            assessments[(row['job_id'], row['candidate_id'])] = assessment.model_dump(mode='json')
            if (index + 1) % 50 == 0:
                print(f'{split}: {index + 1}/{len(selected)} pairs', flush=True)
        features = export_records(rows, snapshots, assessments, split=split,
                                  pins=pins, reference_date='2026-10-18')
        with destination.open('x', encoding='utf-8') as stream:
            for row in features:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True, allow_nan=False) + '\n')
    receipt = {'status': 'derived_experimental_features', 'reference_date': '2026-10-18',
               'pins': pins, 'test_processed': False,
               'hashes': {path.name: sha256(path.read_bytes()).hexdigest()
                          for path in output.glob('*_features.jsonl')}}
    (output / 'feature_receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['extract', 'train'])
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--features', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.action == 'extract':
        extract(args.bundle, args.features)
    else:
        from ml.ai2.train_experiment import run_experiment
        receipt = json.loads((args.features / 'feature_receipt.json').read_text(encoding='utf-8'))
        inputs = []
        for split in ('train', 'validation'):
            path = args.features / (split + '_features.jsonl')
            if sha256(path.read_bytes()).hexdigest() != receipt['hashes'][path.name]:
                raise ValueError('feature file checksum mismatch')
            inputs.append([json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()])
        if args.output is None:
            parser.error('--output required for training')
        run_experiment(*inputs, args.output)


if __name__ == '__main__':
    main()
