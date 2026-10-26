"""Versioned JD-only plans. Authentication must come from a trusted service adapter."""

from datetime import datetime
import hashlib
import json
from typing import Callable, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.experimental.hr_shadow_main import ComponentQuery, PreparedPlan
from app.experimental.shadow_requirement_matcher import ShadowRequirementMatcher


class ImmutableModel(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)


class PlanComponent(ImmutableModel):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    query: str = Field(min_length=1, max_length=5000)
    source_quote: str = Field(min_length=1, max_length=5000)
    importance: Literal['core', 'supplementary', 'preferred', 'unknown']


class PlannedRequirement(ImmutableModel):
    requirement_id: str
    original_text: str
    components: tuple[PlanComponent, ...] = Field(min_length=1, max_length=8)
    all_of: tuple[tuple[str, ...], ...] = Field(min_length=1, max_length=8)
    joint_context_required: bool


class Approval(ImmutableModel):
    origin: Literal['authenticated_hr', 'assistant_offline']
    reviewer_id: str = Field(min_length=1)
    authorization_event_id: str = Field(min_length=1)
    job_id: str
    content_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    approved_at: datetime


class JobRequirementPlan(ImmutableModel):
    schema_version: Literal['jd-fixed-requirements-v1'] = 'jd-fixed-requirements-v1'
    job_id: str
    job_snapshot_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    revision: int = Field(ge=1, strict=True)
    requirements: tuple[PlannedRequirement, ...] = Field(min_length=1, max_length=64)
    approval: Approval | None = None


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def snapshot_digest(job):
    return digest(job.model_dump(mode='json'))


def content_digest(plan):
    return digest(plan.model_dump(mode='json', exclude={'approval'}))


def source_requirements(job):
    # The existing splitter preserves source blocks; it does not invent AND/OR parsing.
    return ShadowRequirementMatcher.build_requirements(None, job)


def validate_plan(plan, job):
    if plan.job_id != job.id or plan.job_snapshot_sha256 != snapshot_digest(job):
        raise ValueError('JD snapshot changed; confirm a new plan revision')
    expected = [(r.id, r.text) for r in source_requirements(job)]
    if [(r.requirement_id, r.original_text) for r in plan.requirements] != expected:
        raise ValueError('Every original requirement must remain exactly once in source order')
    for requirement in plan.requirements:
        ids = [c.id for c in requirement.components]
        queries = [c.query for c in requirement.components]
        if len(set(ids)) != len(ids) or len(set(queries)) != len(queries):
            raise ValueError('Unique component IDs and queries required within each requirement')
        groups = requirement.all_of
        if (any(not g or len(set(g)) != len(g) or not set(g) <= set(ids) for g in groups)
                or {i for g in groups for i in g} != set(ids)
                or len({frozenset(g) for g in groups}) != len(groups)):
            raise ValueError('Explicit AND groups of declared OR alternatives must use every component')
        for component in requirement.components:
            ComponentQuery(component.id, component.query, component.importance)
            if not component.source_quote.strip() or component.source_quote not in requirement.original_text:
                raise ValueError('Component must quote original JD source')
    if plan.approval:
        approval = plan.approval
        if (approval.job_id != job.id or approval.content_sha256 != content_digest(plan)
                or not approval.reviewer_id.strip() or not approval.authorization_event_id.strip()
                or approval.approved_at.utcoffset() is None):
            raise ValueError('Approval must bind exact plan content, job and timezone-aware event')
    return plan


def draft_plan(job, *, revision=1):
    requirements = tuple(PlannedRequirement(requirement_id=r.id, original_text=r.text,
        components=(PlanComponent(id='whole', query=r.text, source_quote=r.text, importance='unknown'),),
        all_of=(('whole',),), joint_context_required=False) for r in source_requirements(job))
    return validate_plan(JobRequirementPlan(job_id=job.id, job_snapshot_sha256=snapshot_digest(job),
        revision=revision, requirements=requirements), job)


def revise_plan(plan, job, requirements, *, expected_content_sha256):
    if content_digest(plan) != expected_content_sha256:
        raise ValueError('Stale edit: plan content changed')
    # Re-validate even already-constructed objects; no model_copy bypass of nested schemas.
    values = [r.model_dump(mode='json') if isinstance(r, PlannedRequirement) else r for r in requirements]
    edited = JobRequirementPlan(job_id=job.id, job_snapshot_sha256=snapshot_digest(job),
        revision=plan.revision + 1, requirements=values, approval=None)
    return validate_plan(edited, job)


def confirm_plan(plan, job, *, expected_content_sha256,
                 authorize: Callable[[str, str], Approval]):
    """authorize must be injected by server-side HR ownership/role checks, never request JSON."""
    validate_plan(plan, job)
    binding = content_digest(plan)
    if binding != expected_content_sha256 or plan.approval is not None:
        raise ValueError('Stale or already confirmed plan')
    approval = Approval.model_validate(authorize(job.id, binding))
    confirmed = JobRequirementPlan.model_validate({**plan.model_dump(mode='json'),
        'approval': approval.model_dump(mode='json')})
    return validate_plan(confirmed, job)


def prepared_queries(plan, job, *, allow_assistant_offline=False):
    validate_plan(plan, job)
    if plan.approval is None:
        raise ValueError('JD plan is a draft; HR confirmation required')
    if plan.approval.origin != 'authenticated_hr' and not allow_assistant_offline:
        raise ValueError('Offline assistant review is not authenticated HR confirmation')
    origin = 'hr_jd_plan' if plan.approval.origin == 'authenticated_hr' else 'assistant_jd_plan'
    return tuple(PreparedPlan(plan.job_id, r.requirement_id, r.original_text,
        tuple(ComponentQuery(c.id, c.query, c.importance) for c in r.components), origin)
        for r in plan.requirements)
