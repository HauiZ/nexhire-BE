"""Local fixture model sidecar reading fixed plans from trusted job-service."""

import asyncio

from app.clients.internal import InternalClient
from app.experimental.fixed_plan_shadow import FixedPlanShadowEngine
from app.experimental.hr_shadow_main import HrShadowEngine
from app.experimental.jd_requirement_plan import JobRequirementPlan
from app.schemas.jd_plan import content_digest, digest, snapshot_digest


class PlanAwareHrEngine:
    def __init__(self, encoder, verifier):
        self.encoder, self.verifier = encoder, verifier
        self.manifest, self.model_version = encoder.manifest, encoder.model_version

    def score(self, job, candidate):
        context = asyncio.run(InternalClient().get_job_requirement_plan(job))
        if context.confirmed_plan:
            plan = JobRequirementPlan.model_validate(context.confirmed_plan.model_dump(mode='json'))
            result = FixedPlanShadowEngine(self.encoder, self.verifier, [plan]).score(job, candidate)
        else:
            result = HrShadowEngine(self.encoder, self.verifier).score(job, candidate)
        return {**result, 'job_id': job.id, 'candidate_id': candidate.candidateId,
            'job_snapshot_sha256': snapshot_digest(job),
            'candidate_snapshot_sha256': digest(candidate.model_dump(mode='json')),
            'jd_plan_context': {'status': context.status,
                'content_sha256': content_digest(context.confirmed_plan) if context.confirmed_plan else None}}
