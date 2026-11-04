"""Synthetic contracts only: no encoder, datasets, services or network."""

from dataclasses import FrozenInstanceError

import pytest

from app.ranking.semantic_features import summarize_semantics
from app.schemas.ai1 import Ai1Assessment, Ai1Component, Ai1Hit, Ai1Requirement
from app.schemas.jd_plan import snapshot_digest, source_requirements
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


PIN = dict(model_version='synthetic-m1', weights_sha256='a' * 64,
           manifest_sha256='b' * 64)


@pytest.fixture
def bundle():
    job = JobMatchingSnapshot(id='job', title='Engineer', description='Not an extra requirement',
        requirements='<p>Build APIs</p>', skills=[' Python '], workingType='FULL_TIME',
        experienceLevel='MID', location='Remote')
    candidate = CandidateMatchingSnapshot(candidateId='candidate', candidateCvId='cv',
        skills=[{'id': 'python', 'name': 'Python'}, {'id': 'api', 'name': 'Build APIs'},
                {'id': 'sql', 'name': 'SQL'}, {'id': 'git', 'name': 'Git'}])
    hits = (Ai1Hit(evidenceId='python', source='skill', text='Python', similarityScore=80),
            Ai1Hit(evidenceId='api', source='skill', text='Build APIs', similarityScore=40))
    assessment = Ai1Assessment(status='READY', backend='local_m1', reason='synthetic',
        jobId=job.id, candidateId=candidate.candidateId, candidateCvId=candidate.candidateCvId,
        jobSnapshotSha256=snapshot_digest(job), candidateSnapshotSha256=snapshot_digest(candidate),
        modelVersion=PIN['model_version'], weightsSha256=PIN['weights_sha256'],
        manifestSha256=PIN['manifest_sha256'], planStatus='UNPREPARED', truncatedTexts=2,
        requirements=tuple(Ai1Requirement(requirementId=r.id, text=r.text,
            retrievalStatus='CANDIDATE_EVIDENCE', evidence=(hit,))
            for r, hit in zip(source_requirements(job), hits)))
    return assessment, job, candidate


def summarize(bundle, **updates):
    assessment, job, candidate = bundle
    return summarize_semantics(assessment.model_copy(update=updates), job, candidate, **PIN)


def replace_first(bundle, **updates):
    assessment, _, _ = bundle
    return (assessment.requirements[0].model_copy(update=updates), assessment.requirements[1])


def test_observed_shifted_cosine_and_frozen_result(bundle):
    result = summarize(bundle)
    assert result.mean_top1 == pytest.approx(0.6)
    assert result.min_top1 == 0.4
    assert (result.expected_count, result.observed_count) == (2, 2)
    assert result.no_evidence_fraction == 0
    assert result.truncated_texts == 2
    with pytest.raises(FrozenInstanceError):
        result.mean_top1 = 0


def test_reading_span_metadata_does_not_change_ai2_features(bundle):
    baseline = summarize(bundle)
    assessment, job, candidate = bundle
    requirements = tuple(item.model_copy(update={
        'evidence': tuple(hit.model_copy(update={'relevantSpan': hit.text})
                          for hit in item.evidence)
    }) for item in assessment.requirements)
    updated = assessment.model_copy(update={'requirements': requirements})
    updated = Ai1Assessment.model_validate(updated.model_dump(mode='json'))
    assert updated.requirements[0].evidence[0].relevantSpan == 'Python'
    assert summarize_semantics(updated, job, candidate, **PIN) == baseline


def test_partial_missing_uses_only_observed_values(bundle):
    result = summarize(bundle, requirements=replace_first(bundle,
        retrievalStatus='NO_EVIDENCE', evidence=()))
    assert result.mean_top1 == result.min_top1 == 0.4
    assert result.no_evidence_fraction == 0.5
    assert result.observed_count == 1


def test_all_missing_is_none_not_zero(bundle):
    assessment = bundle[0]
    result = summarize(bundle, requirements=tuple(r.model_copy(update={
        'retrievalStatus': 'NO_EVIDENCE', 'evidence': ()}) for r in assessment.requirements))
    assert result.mean_top1 is result.min_top1 is None
    assert result.no_evidence_fraction == 1
    assert result.observed_count == 0


def test_empty_requirements_has_undefined_missing_fraction(bundle):
    assessment, job, candidate = bundle
    job = job.model_copy(update={'requirements': '', 'skills': [], 'description': ''})
    assessment = assessment.model_copy(update={'jobSnapshotSha256': snapshot_digest(job),
                                             'requirements': ()})
    result = summarize_semantics(assessment, job, candidate, **PIN)
    assert result.mean_top1 is result.min_top1 is result.no_evidence_fraction is None
    assert result.expected_count == result.observed_count == 0


def test_unavailable_or_wrong_backend_fails_closed(bundle):
    for updates in ({'status': 'UNAVAILABLE'}, {'status': 'DISABLED'}, {'backend': 'disabled'}):
        with pytest.raises(ValueError, match='unavailable'):
            summarize(bundle, **updates)


def test_exact_identity_cv_and_hash_binding(bundle):
    for field in ('jobId', 'candidateId', 'candidateCvId',
                  'jobSnapshotSha256', 'candidateSnapshotSha256'):
        with pytest.raises(ValueError, match='binding'):
            summarize(bundle, **{field: 'different'})
    with pytest.raises(ValueError, match='binding'):
        summarize(bundle, candidateCvId=None)
    assessment, job, candidate = bundle
    for changed_job, changed_candidate in (
        (job.model_copy(update={'title': 'Changed'}), candidate),
        (job, candidate.model_copy(update={'summary': 'Changed'})),
    ):
        with pytest.raises(ValueError, match='binding'):
            summarize_semantics(assessment, changed_job, changed_candidate, **PIN)


def test_exact_model_tuple_and_required_pins(bundle):
    for field in ('modelVersion', 'weightsSha256', 'manifestSha256'):
        with pytest.raises(ValueError, match='provenance'):
            summarize(bundle, **{field: 'different'})
    for field in PIN:
        for value in ('', 'different'):
            with pytest.raises(ValueError, match='provenance'):
                summarize_semantics(*bundle, **{**PIN, field: value})


def test_original_requirement_id_text_and_order(bundle):
    requirements = bundle[0].requirements
    variants = (requirements[::-1], requirements[:1], requirements + requirements[:1],
        replace_first(bundle, requirementId='wrong'), replace_first(bundle, text='Python!'))
    for changed in variants:
        with pytest.raises(ValueError, match='source order'):
            summarize(bundle, requirements=changed)


def test_evidence_id_text_and_source_are_exact(bundle):
    hit = bundle[0].requirements[0].evidence[0]
    for field, value in (('evidenceId', 'missing'), ('text', 'python'), ('source', 'project')):
        with pytest.raises(ValueError, match='ID/text/source'):
            summarize(bundle, requirements=replace_first(bundle,
                evidence=(hit.model_copy(update={field: value}),)))


def test_top3_unique_and_descending(bundle):
    first = bundle[0].requirements[0].evidence[0]
    second = bundle[0].requirements[1].evidence[0]
    third = Ai1Hit(evidenceId='sql', text='SQL', source='skill', similarityScore=20)
    fourth = Ai1Hit(evidenceId='git', text='Git', source='skill', similarityScore=10)
    for hits in ((first, first), (first, second, third, fourth), (second, first)):
        with pytest.raises(ValueError):
            summarize(bundle, requirements=replace_first(bundle, evidence=hits))
    result = summarize(bundle, requirements=replace_first(bundle, evidence=(first, second, third)))
    assert result.mean_top1 == pytest.approx(0.6)


def test_finite_bounded_scores_even_if_pydantic_copy_bypasses_validation(bundle):
    hit = bundle[0].requirements[0].evidence[0]
    for score in (True, False, '80', None, float('nan'), float('inf'), -float('inf'), -1, 101):
        with pytest.raises(ValueError, match='scores'):
            summarize(bundle, requirements=replace_first(bundle,
                evidence=(hit.model_copy(update={'similarityScore': score}),)))
    for score in (0, 100):
        result = summarize(bundle, requirements=replace_first(bundle,
            evidence=(hit.model_copy(update={'similarityScore': score}),)))
        assert result.mean_top1 == pytest.approx((score / 100 + 0.4) / 2)
        assert result.observed_count == 2


def test_retrieval_status_must_agree_with_presence_of_hits(bundle):
    for status in ('CANDIDATE_EVIDENCE', 'REVIEW_REQUIRED', 'INSUFFICIENT_SIGNAL'):
        with pytest.raises(ValueError, match='requires hits'):
            summarize(bundle, requirements=replace_first(bundle, retrievalStatus=status, evidence=()))
        assert summarize(bundle, requirements=replace_first(bundle,
            retrievalStatus=status)).observed_count == 2
    with pytest.raises(ValueError, match='must not carry hits'):
        summarize(bundle, requirements=replace_first(bundle, retrievalStatus='NO_EVIDENCE'))


def test_scorer_unavailable_at_any_requirement_or_component(bundle):
    for index in range(2):
        requirements = list(bundle[0].requirements)
        requirements[index] = requirements[index].model_copy(update={
            'retrievalStatus': 'SCORER_UNAVAILABLE', 'evidence': ()})
        with pytest.raises(ValueError, match='scorer unavailable'):
            summarize(bundle, requirements=tuple(requirements))
    component = Ai1Component(componentId='part', text='Python', importance='core',
                             retrievalStatus='SCORER_UNAVAILABLE')
    with pytest.raises(ValueError, match='scorer unavailable'):
        summarize(bundle, requirements=replace_first(bundle, components=(component,)))


def test_components_do_not_change_whole_requirement_metrics(bundle):
    component = Ai1Component(componentId='part', text='Python', importance='core',
        retrievalStatus='INSUFFICIENT_SIGNAL', evidence=(Ai1Hit(evidenceId='python',
            source='skill', text='Python', similarityScore=0),))
    assert summarize(bundle) == summarize(bundle, requirements=replace_first(bundle,
        components=(component, component.model_copy(update={'componentId': 'part2'}))))
    result = summarize(bundle, requirements=replace_first(bundle, retrievalStatus='NO_EVIDENCE',
        evidence=(), components=(component,)))
    assert result.observed_count == 1
    assert result.mean_top1 == 0.4


def test_component_evidence_is_validated_even_though_not_aggregated(bundle):
    component = Ai1Component(componentId='part', text='Python', importance='core',
        retrievalStatus='CANDIDATE_EVIDENCE', evidence=(Ai1Hit(evidenceId='missing',
            source='skill', text='Python', similarityScore=50),))
    with pytest.raises(ValueError, match='ID/text/source'):
        summarize(bundle, requirements=replace_first(bundle, components=(component,)))


def test_duplicate_source_evidence_ids_are_ambiguous(bundle):
    assessment, job, candidate = bundle
    candidate = candidate.model_copy(update={'skills': [candidate.skills[0], candidate.skills[0]]})
    assessment = assessment.model_copy(update={'candidateSnapshotSha256': snapshot_digest(candidate)})
    with pytest.raises(ValueError, match='Ambiguous'):
        summarize_semantics(assessment, job, candidate, **PIN)
