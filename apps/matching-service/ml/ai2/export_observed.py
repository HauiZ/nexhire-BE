"""Export scoped derived features from pinned assessments, never legacy scores.

Caller supplies previously computed M1 assessments. This CLI performs no model
inference, network access, training or source writes. Missing assessments fail the
whole export; rows cannot silently disappear or change split membership.
"""

import argparse
from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path

from app.ranking.observed_features import extract_observed_features, FEATURE_NAMES
from app.schemas.ai1 import Ai1Assessment
from app.schemas.snapshot_boundary import normalize_job_snapshot
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from ml.ai2.snapshot_fields import snapshot_digest


def export_records(rows, snapshots, assessments, *, split, pins, reference_date):
    if split not in {'train', 'validation', 'test'}:
        raise ValueError('explicit canonical split required')
    selected = [row for row in rows if row['split'] == split]
    if not selected:
        raise ValueError('nonempty selected split required')
    output, seen = [], set()
    for row in selected:
        key = (row['job_id'], row['candidate_id'])
        if key in seen:
            raise ValueError('duplicate source pair')
        seen.add(key)
        relevance = row['relevance']
        if type(relevance) is not int or not 0 <= relevance <= 3:
            raise ValueError('canonical ordinal target required')
        job_raw = snapshots['jobs'][key[0]]
        candidate_raw = snapshots['candidates'][key[1]]
        if (snapshot_digest(job_raw) != row['job_snapshot_hash']
                or snapshot_digest(candidate_raw) != row['candidate_snapshot_hash']):
            raise ValueError('canonical source digest mismatch')
        job = JobMatchingSnapshot.model_validate(normalize_job_snapshot(job_raw))
        candidate = CandidateMatchingSnapshot.model_validate(candidate_raw)
        if job.id != key[0] or candidate.candidateId != key[1]:
            raise ValueError('source identity mismatch')
        if key not in assessments:
            raise ValueError('missing pinned AI1 assessment')
        assessment = Ai1Assessment.model_validate(assessments[key])
        features = extract_observed_features(assessment, job, candidate,
            reference_date=reference_date, **pins)
        output.append({'job_id': key[0], 'candidate_id': key[1], 'split': split,
            'relevance': relevance, 'source_job_snapshot_sha256': row['job_snapshot_hash'],
            'source_candidate_snapshot_sha256': row['candidate_snapshot_hash'],
            'feature_record': asdict(features), 'features': features.numeric_row(),
            'feature_record_sha256': features.content_sha256()})
    if set(assessments) != seen:
        raise ValueError('assessment set must equal selected pair set exactly')
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--assessments', type=Path, required=True)
    parser.add_argument('--pins', type=Path, required=True)
    parser.add_argument('--split', choices=['train', 'validation', 'test'], required=True)
    parser.add_argument('--reference-date', required=True)
    parser.add_argument('--allow-heldout-export', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.split != 'train' and not args.allow_heldout_export:
        parser.error('held-out export requires explicit --allow-heldout-export; no evaluation performed')
    if args.output.exists():
        parser.error('output must not exist')
    rows = [json.loads(line) for line in (args.dataset / 'ranking.jsonl').read_text(encoding='utf-8').splitlines()]
    snapshots = json.loads((args.dataset / 'snapshots.json').read_text(encoding='utf-8'))
    pins = json.loads(args.pins.read_text(encoding='utf-8'))
    assessments = {}
    for line in args.assessments.read_text(encoding='utf-8').splitlines():
        assessment = json.loads(line)
        key = (assessment['jobId'], assessment['candidateId'])
        if key in assessments:
            raise ValueError('duplicate assessment pair')
        assessments[key] = assessment
    output = export_records(rows, snapshots, assessments, split=args.split,
                            pins=pins, reference_date=args.reference_date)
    payload = ''.join(json.dumps(row, ensure_ascii=False, sort_keys=True, allow_nan=False) + '\n'
                      for row in output)
    with args.output.open('x', encoding='utf-8') as stream:
        stream.write(payload)
    print(json.dumps({'rows': len(output), 'split': args.split, 'feature_names': FEATURE_NAMES,
                      'sha256': sha256(payload.encode('utf-8')).hexdigest()}))


if __name__ == '__main__':
    main()
