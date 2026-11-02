"""Reviewed plans are source-bound logic, not dataset target annotations."""

from dataclasses import replace

import pytest

from app.ranking.conditions import Condition, Support
from app.ranking.review_plan import ReviewedAtom, ReviewedPlan, evaluate_reviewed_plan, validate_reviewed_plan
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import JobMatchingSnapshot


@pytest.fixture
def bundle():
    job = JobMatchingSnapshot(id='j', title='Role', requirements='Degree or experience',
        description='', skills=[], workingType='', experienceLevel='', location='')
    atoms = (ReviewedAtom('degree', 'requirements', 0, 6, 'Degree', 'education', 'required'),
             ReviewedAtom('work', 'requirements', 10, 20, 'experience', 'scoped_experience', 'required'))
    plan = ReviewedPlan('ai2-reviewed-conditions-v1', snapshot_digest(job), 'reviewer',
        'event', atoms, Condition('any', children=(Condition('atom', 'degree'), Condition('atom', 'work'))))
    return job, plan


def test_valid_alternative_retains_unknown_without_turning_into_all(bundle):
    job, plan = bundle
    assert validate_reviewed_plan(job, plan) == plan
    assert evaluate_reviewed_plan(job, plan, {}) == Support.UNKNOWN
    assert evaluate_reviewed_plan(job, plan, {'degree': Support.SUPPORTED}) == Support.SUPPORTED
    assert evaluate_reviewed_plan(job, plan, {'degree': Support.NOT_SUPPORTED}) == Support.UNKNOWN


@pytest.mark.parametrize('changes', [
    {'version': 'other'}, {'job_snapshot_sha256': '0' * 64},
    {'reviewer_id': ''}, {'review_event_id': ''}, {'atoms': ()},
    {'condition': Condition('atom', 'unreviewed')},
])
def test_invalid_plan_rejected(bundle, changes):
    with pytest.raises(ValueError):
        validate_reviewed_plan(bundle[0], replace(bundle[1], **changes))


@pytest.mark.parametrize('changes', [
    {'quote': 'degree'}, {'start': True}, {'end': 200}, {'field_path': 'title'},
    {'criterion': 'regulatory_license'}, {'priority': 'core'},
])
def test_invalid_source_or_criterion_rejected(bundle, changes):
    job, plan = bundle
    changed = replace(plan, atoms=(replace(plan.atoms[0], **changes), plan.atoms[1]))
    with pytest.raises(ValueError):
        validate_reviewed_plan(job, changed)


def test_missing_atom_and_unknown_observations_rejected(bundle):
    job, plan = bundle
    with pytest.raises(ValueError):
        validate_reviewed_plan(job, replace(plan, atoms=plan.atoms[:1]))
    with pytest.raises(ValueError):
        evaluate_reviewed_plan(job, plan, {'unknown': Support.SUPPORTED})
    with pytest.raises(ValueError):
        evaluate_reviewed_plan(job, plan, {'degree': True})
