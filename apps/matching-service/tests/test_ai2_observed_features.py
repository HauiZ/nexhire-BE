"""Experimental shared feature parity; no actual M1 inference or held-out data."""

from dataclasses import asdict

import pytest

from app.ranking.observed_features import FEATURE_NAMES, extract_observed_features
from app.schemas.ai1 import Ai1Assessment, Ai1Hit, Ai1Requirement
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot

PIN = dict(model_version='synthetic', weights_sha256='a' * 64, manifest_sha256='b' * 64)


def bundle():
    job = JobMatchingSnapshot(id='j', title='Role', description='', requirements='Python',
        skills=[], workingType='', experienceLevel='', location='')
    candidate = CandidateMatchingSnapshot(candidateId='c', candidateCvId='cv',
        skills=[{'id': 's', 'name': 'Python'}], experiences=[{
            'startYear': 2020, 'startMonth': 1, 'endYear': 2021, 'endMonth': 1,
            'isCurrent': False}])
    assessment = Ai1Assessment(status='READY', backend='local_m1', reason='synthetic',
        jobId='j', candidateId='c', candidateCvId='cv',
        jobSnapshotSha256=snapshot_digest(job), candidateSnapshotSha256=snapshot_digest(candidate),
        modelVersion=PIN['model_version'], weightsSha256=PIN['weights_sha256'],
        manifestSha256=PIN['manifest_sha256'], planStatus='UNPREPARED', requirements=(
            Ai1Requirement(requirementId='requirements/0', text='Python',
                retrievalStatus='CANDIDATE_EVIDENCE', evidence=(Ai1Hit(
                    evidenceId='s', text='Python', source='skill', similarityScore=80),)),))
    return assessment, job, candidate


def extract(values):
    return extract_observed_features(*values, reference_date='2026-10-18', **PIN)


def test_order_formula_and_deterministic_transport_parity():
    values = bundle()
    result = extract(values)
    assert result.values == (0.8, 0.8, 0, 12, 0)
    assert tuple(result.numeric_row()) == FEATURE_NAMES
    restored = tuple(type(value).model_validate_json(value.model_dump_json()) for value in values)
    assert asdict(result) == asdict(extract(restored))
    assert result.content_sha256() == extract(restored).content_sha256()


def test_missing_chronology_is_not_zero_lifetime_experience():
    assessment, job, candidate = bundle()
    candidate = candidate.model_copy(update={'experiences': []})
    assessment = assessment.model_copy(update={'candidateSnapshotSha256': snapshot_digest(candidate)})
    result = extract((assessment, job, candidate))
    assert result.numeric_row()['chronology_known_months'] is None
    assert result.numeric_row()['chronology_incomplete'] == 1


def test_export_preserves_labels_hashes_and_rejects_missing_assessments():
    from ml.ai2.export_observed import export_records
    from ml.ai2.snapshot_fields import snapshot_digest as object_digest
    assessment, job, candidate = bundle()
    snapshots = {'jobs': {'j': job.model_dump(mode='json')},
                 'candidates': {'c': candidate.model_dump(mode='json')}}
    rows = [{'job_id': 'j', 'candidate_id': 'c', 'split': 'train', 'relevance': 2,
             'job_snapshot_hash': object_digest(snapshots['jobs']['j']),
             'candidate_snapshot_hash': object_digest(snapshots['candidates']['c'])}]
    assessments = {('j', 'c'): assessment.model_dump(mode='json')}
    result = export_records(rows, snapshots, assessments, split='train', pins=PIN,
                            reference_date='2026-10-18')
    assert result[0]['relevance'] == 2
    assert result[0]['features'] == extract((assessment, job, candidate)).numeric_row()
    for invalid in ({}, {**assessments, ('other', 'c'): assessment.model_dump(mode='json')}):
        with pytest.raises(ValueError):
            export_records(rows, snapshots, invalid, split='train', pins=PIN,
                           reference_date='2026-10-18')


def test_unavailable_semantic_never_falls_back():
    assessment, job, candidate = bundle()
    with pytest.raises(ValueError, match='unavailable'):
        extract((assessment.model_copy(update={'status': 'UNAVAILABLE'}), job, candidate))
