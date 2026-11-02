"""Bounded local pinned-M1 assessment preparation; no training or services."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from types import SimpleNamespace
import time

from app.matching.ai1 import assess_local
from app.matching.m1_runtime import LocalM1Runtime
from app.schemas.snapshot_boundary import normalize_job_snapshot
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from ml.ai2.snapshot_fields import snapshot_digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--limit', type=int, default=2)
    args = parser.parse_args()
    if not 1 <= args.limit <= 8:
        parser.error('bounded smoke only: limit must be1..8 train pairs')
    if args.output.exists():
        parser.error('output must not exist')
    rows = [json.loads(line) for line in (args.dataset / 'ranking.jsonl').read_text(encoding='utf-8').splitlines()]
    selected = sorted((row for row in rows if row['split'] == 'train'),
                      key=lambda row: (row['job_id'], row['candidate_id']))[:args.limit]
    snapshots = json.loads((args.dataset / 'snapshots.json').read_text(encoding='utf-8'))
    started = time.perf_counter()
    runtime = LocalM1Runtime.from_manifest(args.manifest, args.manifest_sha256)
    loaded = time.perf_counter()
    settings = SimpleNamespace(ai1_manifest_sha256=args.manifest_sha256)
    context = SimpleNamespace(status='UNPREPARED', confirmed_plan=None)
    assessments, durations = [], []
    for row in selected:
        job_raw = snapshots['jobs'][row['job_id']]
        candidate_raw = snapshots['candidates'][row['candidate_id']]
        if (snapshot_digest(job_raw) != row['job_snapshot_hash']
                or snapshot_digest(candidate_raw) != row['candidate_snapshot_hash']):
            raise ValueError('canonical source digest mismatch')
        job = JobMatchingSnapshot.model_validate(normalize_job_snapshot(job_raw))
        candidate = CandidateMatchingSnapshot.model_validate(candidate_raw)
        before = time.perf_counter()
        assessments.append(assess_local(runtime, settings, job, candidate, context).model_dump(mode='json'))
        durations.append(time.perf_counter() - before)
    payload = ''.join(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n' for value in assessments)
    with args.output.open('x', encoding='utf-8') as stream:
        stream.write(payload)
    print(json.dumps({'status': 'train_smoke_only', 'pairs': len(assessments),
        'model_load_seconds': loaded - started, 'pair_seconds': durations,
        'sha256': sha256(payload.encode('utf-8')).hexdigest(),
        'full_export_executed': False, 'model_version': runtime.model_version}))


if __name__ == '__main__':
    main()
