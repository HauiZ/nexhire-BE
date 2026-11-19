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


def query_bundle(values=None):
    """Source-preserving confirmed v2 fixture; no runtime/model calls."""
    from datetime import datetime, timezone
    from app.schemas.jd_plan import Approval, content_digest
    from app.schemas.jd_plan_v2 import draft_query_plan
    assessment, job, candidate = values or bundle()
    plan = draft_query_plan(job)
    plan = plan.model_copy(update={'approval': Approval(origin='authenticated_hr', reviewer_id='hr',
        authorization_event_id='event', job_id=job.id, content_sha256=content_digest(plan),
        approved_at=datetime(2026, 10, 18, tzinfo=timezone.utc))})
    requirements = tuple(row.model_copy(update={'requirementId': f'{source.source_id}/{component.id}'})
        for row, (source, component) in zip(assessment.requirements,
            [(s, c) for s in plan.sources if s.selected for c in s.components]))
    return assessment.model_copy(update={'fixedPlan': plan, 'planStatus': 'HR_CONFIRMED',
                                         'requirements': requirements}), job, candidate


def test_confirmed_whole_query_v2_is_value_and_feature_record_equivalent():
    from app.ranking.semantic_features import feature_input_metadata
    original = bundle()
    updated = query_bundle(original)
    assert asdict(extract(original)) == asdict(extract(updated))
    assert extract(original).content_sha256() == extract(updated).content_sha256()
    metadata = feature_input_metadata(updated[0], updated[1])
    assert metadata['inputContract'] == 'M1_REQUIREMENT_OBSERVATIONS_V1'
    assert metadata['planSchemaVersion'] == 'jd-source-query-v2'


def test_v2_equivalence_rejects_modified_approval_query_identity_and_untrusted_plan():
    from app.ranking.semantic_features import feature_input_metadata
    assessment, job, candidate = query_bundle()
    for changed in [assessment.model_copy(update={'planStatus': 'STALE'}),
                    assessment.model_copy(update={'fixedPlan': assessment.fixedPlan.model_copy(update={'approval': None})}),
                    assessment.model_copy(update={'requirements': ()})]:
        with pytest.raises(ValueError):
            feature_input_metadata(changed, job)
    with pytest.raises(ValueError):
        extract((assessment, job.model_copy(update={'title': 'Changed'}), candidate))


def test_general_query_source_balancing_is_distinct_and_never_fed_legacy_weights():
    from datetime import datetime, timezone
    from app.schemas.jd_plan import Approval, PlanComponent, content_digest
    from app.schemas.jd_plan_v2 import draft_query_plan
    from app.ranking.observed_features import QUERY_SCHEMA_VERSION, QUERY_FEATURE_NAMES
    from app.ranking.semantic_features import UnsupportedFeatureInput
    assessment, job, candidate = bundle()
    job = job.model_copy(update={'requirements': 'Python and SQL\nDocker'})
    plan = draft_query_plan(job)
    sources = list(plan.sources)
    sources[0] = sources[0].model_copy(update={'components': (
        PlanComponent(id='python', query='Python', source_quote='Python', importance='core'),
        PlanComponent(id='sql', query='SQL', source_quote='SQL', importance='core'))})
    plan = plan.model_copy(update={'sources': tuple(sources)})
    plan = plan.model_copy(update={'approval': Approval(origin='authenticated_hr', reviewer_id='hr',
        authorization_event_id='event', job_id=job.id, content_sha256=content_digest(plan),
        approved_at=datetime(2026, 10, 18, tzinfo=timezone.utc))})
    hit = assessment.requirements[0].evidence[0]
    requirements = tuple(Ai1Requirement(requirementId=f'{s.source_id}/{c.id}', text=c.query,
        retrievalStatus='CANDIDATE_EVIDENCE' if score is not None else 'NO_EVIDENCE',
        evidence=(hit.model_copy(update={'similarityScore': score}),) if score is not None else ())
        for (s, c), score in zip([(s, c) for s in plan.sources if s.selected for c in s.components], (.8 * 100, .4 * 100, None)))
    assessment = assessment.model_copy(update={'fixedPlan': plan, 'planStatus': 'HR_CONFIRMED',
        'jobSnapshotSha256': snapshot_digest(job), 'requirements': requirements})
    primary = extract((assessment, job, candidate))
    assert primary.values == pytest.approx((.6, .4, 1 / 3, 12., 0.))
    assert tuple(primary.numeric_row()) == FEATURE_NAMES
    general = extract_observed_features(assessment, job, candidate, reference_date='2026-10-18',
        query_source_balanced=True, **PIN)
    assert general.schema_version == QUERY_SCHEMA_VERSION
    assert tuple(general.numeric_row()) == QUERY_FEATURE_NAMES
    assert general.values == pytest.approx((.6, .6, .5, 12., 0.))
    from ml.ai2.export_observed import export_records
    from ml.ai2.snapshot_fields import snapshot_digest as object_digest
    snapshots = {'jobs': {'j': job.model_dump(mode='json')}, 'candidates': {'c': candidate.model_dump(mode='json')}}
    row = dict(job_id='j', candidate_id='c', split='train', relevance=2, label_source='SYNTHETIC_TEST_ONLY',
        label_exposure='EXPOSED_UNIT_FIXTURE', target_policy_version='synthetic-unit-rubric-v1',
        label_plan_content_sha256=content_digest(plan),
        job_snapshot_hash=object_digest(snapshots['jobs']['j']), candidate_snapshot_hash=object_digest(snapshots['candidates']['c']))
    assessments = {('j', 'c'): assessment.model_dump(mode='json')}
    with pytest.raises(ValueError, match='require the jd_query training contract'):
        export_records([row], snapshots, assessments, split='train', pins=PIN, reference_date='2026-10-18')
    exported = export_records([row], snapshots, assessments,
        split='train', pins=PIN, reference_date='2026-10-18', feature_contract='jd_query')[0]
    assert exported['features'] == general.numeric_row()
    assert exported['feature_record_sha256'] == general.content_sha256()
    from ml.ai2.train_experiment import validate_feature_contract
    assert validate_feature_contract([exported], [], 'jd_query')[0] == QUERY_FEATURE_NAMES
    with pytest.raises(ValueError, match='require the jd_query training contract'):
        validate_feature_contract([{**exported, 'featureContract': 'whole_source', 'features': primary.numeric_row()}],
                                  [], 'whole_source')
    with pytest.raises(ValueError, match='one explicit target policy'):
        validate_feature_contract([exported], [{**exported, 'targetPolicyVersion': 'different-policy'}], 'jd_query')
    for changed in ({**exported, 'targetPolicyVersion': ''},
                    {**exported, 'labelPlanContentSha256': '0' * 64},
                    {**exported, 'featureContract': 'whole_source'},
                    {**exported, 'feature_record_sha256': '0' * 64},
                    {**exported, 'features': dict(zip(FEATURE_NAMES, general.values))}):
        with pytest.raises(ValueError):
            validate_feature_contract([changed], [], 'jd_query')


def test_order_formula_and_deterministic_transport_parity():
    values = bundle()
    result = extract(values)
    assert result.values == (0.8, 0.8, 0, 12, 0)
    assert tuple(result.numeric_row()) == FEATURE_NAMES
    restored = tuple(type(value).model_validate_json(value.model_dump_json()) for value in values)
    assert asdict(result) == asdict(extract(restored))
    assert result.content_sha256() == extract(restored).content_sha256()


def test_reading_span_keeps_feature_values_and_content_hash():
    values = bundle()
    baseline = extract(values)
    assessment, job, candidate = values
    raw = assessment.model_dump(mode='json')
    hit = raw['requirements'][0]['evidence'][0]
    hit['relevantSpan'] = hit['text']
    restored = Ai1Assessment.model_validate(raw)
    updated = extract((restored, job, candidate))
    assert updated.values == baseline.values
    assert updated.content_sha256() == baseline.content_sha256()
    assert asdict(updated) == asdict(baseline)


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
