"""Validate optional trusted job-service plans without changing candidate scoring."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.jd_plan import JobRequirementPlan, content_digest, snapshot_digest, validate_plan


class JobPlanContext(BaseModel):
    model_config = ConfigDict(frozen=True, extra='forbid')
    status: Literal['UNPREPARED', 'DRAFT', 'HR_CONFIRMED', 'ASSISTANT_REVIEWED', 'STALE', 'UNAVAILABLE', 'INVALID']
    plan: JobRequirementPlan | None = None
    reason: str
    candidate_support_verified: Literal[False] = False
    publishing_blocked: Literal[False] = False

    @property
    def confirmed_plan(self):
        return self.plan if self.status == 'HR_CONFIRMED' else None


def inspect_trusted_plan(value, job):
    if (not isinstance(value, dict) or value.get('publishing_blocked') is not False
            or value.get('candidate_support_verified') is not False):
        return JobPlanContext(status='INVALID', reason='UNSAFE_PLAN_ENVELOPE')
    current = snapshot_digest(job)
    if value.get('current_job_snapshot_sha256') != current:
        return JobPlanContext(status='STALE', reason='JD_CHANGED_BETWEEN_SNAPSHOT_AND_PLAN_READ')
    state = value.get('status')
    if state == 'UNPREPARED' and value.get('plan') is None and value.get('content_sha256') is None:
        return JobPlanContext(status='UNPREPARED', reason='NO_PLAN_PREPARED')
    if state == 'STALE':
        return JobPlanContext(status='STALE', reason='PLAN_SNAPSHOT_IS_STALE')
    if state not in {'DRAFT', 'HR_CONFIRMED', 'ASSISTANT_REVIEWED'}:
        return JobPlanContext(status='INVALID', reason='UNEXPECTED_PLAN_STATE')
    try:
        plan = JobRequirementPlan.model_validate(value.get('plan'))
        validate_plan(plan, job)
        if value.get('content_sha256') != content_digest(plan):
            raise ValueError('Content binding mismatch')
        expected = ('HR_CONFIRMED' if plan.approval and plan.approval.origin == 'authenticated_hr'
                    else 'ASSISTANT_REVIEWED' if plan.approval else 'DRAFT')
        if expected != state:
            raise ValueError('Approval state mismatch')
    except ValueError:
        return JobPlanContext(status='INVALID', reason='PLAN_SOURCE_OR_APPROVAL_BINDING_INVALID')
    return JobPlanContext(status=state, plan=plan, reason='TRUSTED_JOB_SERVICE_SOURCE_BOUND_PLAN')
