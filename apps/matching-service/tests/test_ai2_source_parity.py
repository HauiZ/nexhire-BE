"""Shared normalized snapshot parity; raw-PDF fidelity is outside this contract."""

from dataclasses import asdict
import json

from app.ranking.source_extractor import extract_tools
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot
from ml.ai2.provenance import bind_extraction
from ml.ai2.snapshot_fields import snapshot_digest, walk_snapshot_fields
from ml.ai2.timeline import summarize_timeline


def test_candidate_json_transport_preserves_exact_features_and_source_bindings():
    candidate = CandidateMatchingSnapshot(candidateId='c', candidateCvId='cv',
        summary='  Python\n🙂 APIs  ',
        skills=[{'id': 's', 'name': 'Python'}],
        experiences=[{'id': 'e', 'description': 'Python APIs', 'startYear': 2023,
                      'startMonth': 1, 'endYear': 2024, 'endMonth': 1, 'isCurrent': False}],
        projects=[{'id': 'p', 'description': 'Python', 'technologies': ['Python']}])
    offline = candidate.model_dump(mode='json')
    online = CandidateMatchingSnapshot.model_validate_json(candidate.model_dump_json()).model_dump(mode='json')
    digest = snapshot_digest(offline)
    assert snapshot_digest(online) == digest
    outputs = []
    for snapshot in (offline, online):
        observations = []
        for field in walk_snapshot_fields(snapshot, 'candidate', expected_sha256=digest):
            result = extract_tools(field.text, field.field_path, {'Python': ['Python']})
            observations.append(asdict(bind_extraction(snapshot, 'candidate',
                expected_sha256=digest, field_path=field.field_path, result=result)))
        outputs.append(json.dumps(observations, ensure_ascii=False, sort_keys=True))
    assert outputs[0] == outputs[1]
    assert summarize_timeline(offline['experiences'], '2026-10-18') == summarize_timeline(
        online['experiences'], '2026-10-18')
    assert offline['summary'] == '  Python\n🙂 APIs  '


def test_job_transport_preserves_whitespace_and_hash():
    job = JobMatchingSnapshot(id='j', title='Engineer', description='  APIs\n',
        requirements='Python required.', skills=[], workingType='FULL_TIME',
        experienceLevel='MID', location='')
    offline = job.model_dump(mode='json')
    online = JobMatchingSnapshot.model_validate_json(job.model_dump_json()).model_dump(mode='json')
    digest = snapshot_digest(offline)
    assert walk_snapshot_fields(offline, 'job', expected_sha256=digest) == walk_snapshot_fields(
        online, 'job', expected_sha256=digest)
