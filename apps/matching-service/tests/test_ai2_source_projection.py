"""Source projection boundaries, not rubric satisfaction or skill tenure."""

from dataclasses import asdict

import pytest

from app.ranking.source_projection import project_candidate, project_job
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


def candidate(text):
    return CandidateMatchingSnapshot(candidateId='c', experiences=[{
        'id': 'merged', 'description': text, 'startYear': 2017, 'startMonth': 6,
        'endYear': 2021, 'endMonth': 8, 'isCurrent': False}])


def project(value):
    return project_candidate(value, expected_sha256=snapshot_digest(value), reference_date='2026-10-18')


def test_merged_roles_use_explicit_headers_not_outer_dates():
    text = ('Manager | 2025-01 to present. Payroll.\n'
            'Generalist | 2021-09 to 2024-12. Benefits.\n'
            'Coordinator | 2017-06 to 2021-08. Records.')
    value = candidate(text)
    result = project(value)
    assert len(result.roles) == 3
    assert [r.start_month for r in result.roles] == ['2025-01', '2021-09', '2017-06']
    assert result.roles[0].end_month == '2026-10'
    assert result.roles[0].is_current is True
    for role in result.roles:
        assert text[role.source.start:role.source.end] == role.source.quote
        assert role.attachment == 'explicit_header'
        assert role.record_id == 'merged'
    assert value.experiences[0].startYear == 2017


@pytest.mark.parametrize('text', [
    'Python developer for multiple employers.',
    'Manager | January 2025 to present. Payroll.',
    'Manager | 2025/01 to present. Payroll.',
])
def test_unrecognized_headers_never_inherit_structured_dates(text):
    role = project(candidate(text)).roles[0]
    assert role.attachment == 'unknown'
    assert role.start_month is role.end_month is role.is_current is None


@pytest.mark.parametrize('header', [
    'Role | 2025-13 to present.', 'Role | 2028-01 to present.',
    'Role | 2025-01 to 2024-01.', 'Role | 2025-01 to 2028-01.',
])
def test_invalid_dates_abstain(header):
    role = project(candidate(header)).roles[0]
    assert role.attachment == 'unknown'
    assert role.start_month is role.end_month is None


def test_nested_unrecognized_date_and_preamble_stay_unknown():
    result = project(candidate('🙂 Profile\nRole | 2020-01 to 2021-01. Work.\nOther 2022/01 to now'))
    assert result.roles[0].reasons == ('unattached_preamble',)
    assert result.roles[1].reasons == ('additional_date_cue_in_role_body',)
    assert result.roles[1].start_month is None


def test_blank_record_stays_chronology_only():
    result = project(candidate(None))
    assert not result.roles
    assert result.issues == ('experiences[0]:no_role_text',)


def test_transport_parity_and_stale_hash():
    value = candidate('Developer | 2020-01 to 2022-01. Python.')
    restored = CandidateMatchingSnapshot.model_validate_json(value.model_dump_json())
    assert asdict(project(value)) == asdict(project(restored))
    with pytest.raises(ValueError, match='digest'):
        project_candidate(value, expected_sha256='0' * 64, reference_date='2026-10-18')


def job(text):
    return JobMatchingSnapshot(id='j', title='Role', description='', requirements=text,
        skills=[], workingType='', experienceLevel='', location='')


@pytest.mark.parametrize('text,priority,reason', [
    ('Python required.', 'required', None),
    ('Python is a bonus.', 'preferred', None),
    ('Python is a plus.', 'preferred', None),
    ('Degree or equivalent experience required.', 'unknown', 'alternative_or_equivalence_unresolved'),
    ('Required: Python preferred.', 'unknown', 'mixed_priority'),
    ('Python not required.', 'unknown', 'negation_attachment_unresolved'),
    ('<p>Python required.</p>', 'unknown', 'html_structure_unresolved'),
])
def test_conditions_never_flatten_alternatives(text, priority, reason):
    value = job(text)
    result = project_job(value, expected_sha256=snapshot_digest(value), reference_date='2026-10-18')
    clause = result.clauses[0]
    assert clause.priority == priority
    assert clause.source.quote == text
    if reason:
        assert reason in clause.reasons
        assert clause.condition_structure == 'unresolved'


@pytest.mark.parametrize('suffix', [
    '\nOther | January 2022 to December 2023. Other duties.',
    '\nOther | 2022 to 2023. Other duties.',
])
def test_unsupported_nested_header_cannot_inherit_dates(suffix):
    role = project(candidate('Role | 2020-01 to 2021-01. Work.' + suffix)).roles[0]
    assert role.attachment == 'unknown'
    assert role.start_month is role.end_month is None


def test_candidate_html_is_unresolved():
    role = project(candidate('<p>Role | 2020-01 to 2021-01. Work.</p>')).roles[0]
    assert role.reasons == ('html_structure_unresolved',)
    assert role.start_month is role.end_month is None


@pytest.mark.parametrize('text', ["Python isn't required.", "Python mustn't be used.",
                                  'Python isn’t required.'])
def test_contracted_negation_never_claims_required(text):
    value = job(text)
    clause = project_job(value, expected_sha256=snapshot_digest(value),
                         reference_date='2026-10-18').clauses[0]
    assert clause.priority == 'unknown'
    assert 'negation_attachment_unresolved' in clause.reasons


def test_credential_mentions_keep_exact_education_source_without_graduation_claim():
    value = CandidateMatchingSnapshot(candidateId='c', educations=[
        {'id': 'edu', 'degree': 'B.S. in Computing', 'description': 'MS expected'}])
    result = project(value)
    assert [item.credential for item in result.credentials] == ['bachelor', 'master']
    assert [item.source.quote for item in result.credentials] == ['B.S.', 'MS']
    assert all(item.record_id == 'edu' for item in result.credentials)
    assert all(item.completion == 'unknown' and item.discipline is None
               for item in result.credentials)
    restored = CandidateMatchingSnapshot.model_validate_json(value.model_dump_json())
    assert result == project(restored)


@pytest.mark.parametrize('reference', ['2026-13-01', '20261018', None])
def test_reference_date_validation(reference):
    value = candidate('Role')
    with pytest.raises(ValueError):
        project_candidate(value, expected_sha256=snapshot_digest(value), reference_date=reference)
