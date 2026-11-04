"""Literal shared-vocabulary overlap, not requirement satisfaction."""

from dataclasses import asdict

import pytest

from app.ranking.tool_overlap import extract_tool_overlap
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot

VOCAB = {'Python': [], 'Kafka': [], 'Microsoft Office': []}


def job(text='Python and Kafka required.'):
    return JobMatchingSnapshot(id='j', title='Python', description='', requirements=text,
        skills=[], workingType='', experienceLevel='', location='')


def extract(j, c):
    return extract_tool_overlap(j, c, vocabulary=VOCAB,
        job_sha256=snapshot_digest(j), candidate_sha256=snapshot_digest(c))


def test_source_separation_and_exact_spans():
    j = job()
    c = CandidateMatchingSnapshot(candidateId='c', skills=[{'name': 'Python'}],
        projects=[{'description': 'Kafka project'}])
    r = extract(j, c)
    assert r.skill_profile_overlap == r.project_overlap == 0.5
    assert r.employment_overlap is None
    assert r.any_source_overlap == 1
    assert r.shared_project == ('Kafka',)
    for obs in r.observations:
        assert all(a.snapshot_hash == obs.snapshot_sha256 for a in obs.anchors)
    assert asdict(r) == asdict(extract(JobMatchingSnapshot.model_validate_json(j.model_dump_json()),
        CandidateMatchingSnapshot.model_validate_json(c.model_dump_json())))


def test_missing_denominator_and_suite_no_component_inference():
    c = CandidateMatchingSnapshot(candidateId='c', skills=[{'name': 'Microsoft Office'}])
    assert extract(job('Excel required'), c).any_source_overlap is None
    result = extract(job('Python required'), c)
    assert result.skill_profile_overlap == 0
    assert result.any_source_overlap is None
    assert extract(job('General communication'), c).job_concepts == ()


@pytest.mark.parametrize('text', ["Python isn't required", 'Python or Kafka', '<p>Python required</p>'])
def test_ambiguous_requirement_abstains(text):
    r = extract(job(text), CandidateMatchingSnapshot(candidateId='c', summary='Python Kafka'))
    assert r.any_source_overlap is None
    assert r.issues


def test_candidate_negation_does_not_become_positive_mention():
    r = extract(job('Python required'), CandidateMatchingSnapshot(candidateId='c', summary="Never used Python"))
    assert not r.shared_skill_profile
    assert r.any_source_overlap is None
    assert any(a.unknown_reason for o in r.observations for a in o.anchors if o.record_kind == 'profile')


def test_empty_sources_never_become_zero_overlap():
    result = extract(job('Python required'), CandidateMatchingSnapshot(candidateId='c'))
    assert result.skill_profile_overlap is result.employment_overlap is result.project_overlap is None
    assert result.any_source_overlap is None


def test_stale_hash_rejected():
    with pytest.raises(ValueError):
        extract_tool_overlap(job(), CandidateMatchingSnapshot(candidateId='c'), vocabulary=VOCAB,
            job_sha256='0' * 64, candidate_sha256='0' * 64)
