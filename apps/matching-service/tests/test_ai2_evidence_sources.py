"""Top3-censored source diagnostics; no inference or dataset access."""

import pytest

from app.ranking.evidence_source_features import summarize_evidence_sources
from app.schemas.ai1 import Ai1Assessment, Ai1Requirement, Ai1Hit
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import JobMatchingSnapshot, CandidateMatchingSnapshot

PIN = dict(model_version='synthetic', weights_sha256='a' * 64, manifest_sha256='b' * 64)


def bundle():
    job = JobMatchingSnapshot(id='j', title='', description='', requirements='Python\nKafka',
        skills=[], workingType='', experienceLevel='', location='')
    candidate = CandidateMatchingSnapshot(candidateId='c', experiences=[{'id': 'e', 'description': 'Python'}],
        skills=[{'id': 's', 'name': 'Python'}], projects=[{'id': 'p', 'description': 'Kafka'}])
    assessment = Ai1Assessment(status='READY', backend='local_m1', reason='fixture',
        jobId='j', candidateId='c', jobSnapshotSha256=snapshot_digest(job),
        candidateSnapshotSha256=snapshot_digest(candidate), modelVersion=PIN['model_version'],
        weightsSha256=PIN['weights_sha256'], manifestSha256=PIN['manifest_sha256'],
        planStatus='UNPREPARED', requirements=(
            Ai1Requirement(requirementId='requirements/0', text='Python', retrievalStatus='CANDIDATE_EVIDENCE',
                evidence=(Ai1Hit(evidenceId='s', source='skill', text='Python', similarityScore=90),
                          Ai1Hit(evidenceId='e', source='experience', text='Python', similarityScore=80))),
            Ai1Requirement(requirementId='requirements/1', text='Kafka', retrievalStatus='CANDIDATE_EVIDENCE',
                evidence=(Ai1Hit(evidenceId='p', source='project', text='Kafka', similarityScore=70),))))
    return assessment, job, candidate


def test_source_means_and_all_requirement_denominators():
    result = summarize_evidence_sources(*bundle(), **PIN)
    assert result.experience_best_mean == 0.8
    assert result.project_best_mean == 0.7
    assert result.experience_top1_fraction == 0
    assert result.project_top1_fraction == 0.5
    assert result.experience_missing_from_top3_fraction == 0.5
    assert result.project_missing_from_top3_fraction == 0.5


def test_source_missing_from_retrieval_is_not_zero_similarity():
    assessment, job, candidate = bundle()
    requirements = tuple(r.model_copy(update={'retrievalStatus': 'NO_EVIDENCE', 'evidence': ()})
                         for r in assessment.requirements)
    result = summarize_evidence_sources(assessment.model_copy(update={'requirements': requirements}), job, candidate, **PIN)
    assert result.experience_best_mean is result.project_best_mean is None
    assert result.experience_missing_from_top3_fraction == 1
    assert result.experience_top1_fraction == 0


def test_empty_requirements_undefined():
    assessment, job, candidate = bundle()
    job = job.model_copy(update={'requirements': ''})
    assessment = assessment.model_copy(update={'requirements': (), 'jobSnapshotSha256': snapshot_digest(job)})
    result = summarize_evidence_sources(assessment, job, candidate, **PIN)
    assert result.experience_top1_fraction is result.project_missing_from_top3_fraction is None


def test_binding_rejects_wrong_source_type():
    assessment, job, candidate = bundle()
    first = assessment.requirements[0]
    wrong = first.evidence[1].model_copy(update={'source': 'project'})
    first = first.model_copy(update={'evidence': (first.evidence[0], wrong)})
    with pytest.raises(ValueError, match='ID/text/source'):
        summarize_evidence_sources(assessment.model_copy(update={'requirements': (first, assessment.requirements[1])}),
                                   job, candidate, **PIN)
