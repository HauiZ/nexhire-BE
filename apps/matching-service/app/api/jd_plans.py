"""Internal, model-free JD plan validation. HR authorization belongs to job-service."""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.config import get_settings
from app.schemas.jd_plan import (
    JobRequirementPlan, content_digest, draft_plan, snapshot_digest, validate_plan,
)
from app.schemas.snapshots import JobMatchingSnapshot

router = APIRouter(prefix='/internal/jd-plans', tags=['internal-jd-plans'])


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


def require_plan_service(token: str | None = Header(default=None, alias='x-internal-service-token')):
    expected = get_settings().internal_service_token
    if not token or not expected or not secrets.compare_digest(token.encode('utf-8'), expected.encode('utf-8')):
        raise HTTPException(status_code=403, detail='Invalid internal service token')


class DraftRequest(StrictModel):
    job: JobMatchingSnapshot
    revision: int = Field(ge=1, strict=True)


class InspectRequest(StrictModel):
    job: JobMatchingSnapshot
    plan: JobRequirementPlan | None = None


class ValidateRequest(StrictModel):
    job: JobMatchingSnapshot
    plan: JobRequirementPlan


def response(job, plan=None):
    current = snapshot_digest(job)
    if plan is None:
        status = 'UNPREPARED'
    elif plan.job_id != job.id:
        raise HTTPException(status_code=422, detail='Plan belongs to another job')
    elif plan.job_snapshot_sha256 != current:
        status = 'STALE'
    else:
        try:
            validate_plan(plan, job)
        except ValueError:
            raise HTTPException(status_code=422, detail='Invalid source-bound plan') from None
        status = ('HR_CONFIRMED' if plan.approval and plan.approval.origin == 'authenticated_hr'
                  else 'ASSISTANT_REVIEWED' if plan.approval else 'DRAFT')
    return {'success': True, 'data': {'status': status,
        'current_job_snapshot_sha256': current,
        'content_sha256': content_digest(plan) if plan else None,
        'plan': plan.model_dump(mode='json') if plan else None,
        'publishing_blocked': False, 'candidate_support_verified': False,
        'matching_mode': 'FIXED_HR_PLAN_UNVERIFIED_EVIDENCE' if status == 'HR_CONFIRMED'
            else 'UNVERIFIED_DRAFT_OR_SOURCE_EVIDENCE'}}


@router.post('/draft', dependencies=[Depends(require_plan_service)])
def prepare_draft(dto: DraftRequest):
    try:
        return response(dto.job, draft_plan(dto.job, revision=dto.revision))
    except ValueError:
        raise HTTPException(status_code=422, detail='JD needs at least one valid bounded requirement') from None


@router.post('/inspect', dependencies=[Depends(require_plan_service)])
def inspect(dto: InspectRequest):
    return response(dto.job, dto.plan)


@router.post('/validate', dependencies=[Depends(require_plan_service)])
def validate(dto: ValidateRequest):
    try:
        validate_plan(dto.plan, dto.job)
    except ValueError:
        raise HTTPException(status_code=422, detail='Invalid or stale source-bound JD plan') from None
    return response(dto.job, dto.plan)
