"""Opt-in fixed JD plans over existing shadow retrieval; no routes or HR writes."""

from types import MappingProxyType

from app.experimental.hr_shadow_main import HrShadowEngine
from app.experimental.jd_requirement_plan import content_digest, prepared_queries
from app.experimental.shadow_runtime import ShadowInputError


class FixedPlanShadowEngine:
    def __init__(self, encoder, verifier, plans, *, max_pairs=32, allow_assistant_offline=False):
        plans = tuple(plans)
        indexed = {p.job_id: p for p in plans}
        if len(indexed) != len(plans) or len(plans) > 256:
            raise ValueError('One bounded active plan per job required')
        self.plans = MappingProxyType(indexed)
        self.encoder, self.verifier = encoder, verifier
        self.manifest, self.model_version = encoder.manifest, encoder.model_version
        self.max_pairs, self.allow_assistant_offline = max_pairs, allow_assistant_offline

    def score(self, job, candidate):
        plan = self.plans.get(job.id)
        if plan is None:
            raise ShadowInputError('Confirmed JD plan required')
        try:
            queries = prepared_queries(plan, job, allow_assistant_offline=self.allow_assistant_offline)
        except ValueError as exc:
            raise ShadowInputError(str(exc)) from None
        result = HrShadowEngine(self.encoder, self.verifier, queries, max_pairs=self.max_pairs).score(job, candidate)
        # Keep fixed AND/OR structure distinct from unverified per-component argmax proposals.
        return {**result, 'fixed_jd_plan': {'schema': plan.schema_version,
            'content_sha256': content_digest(plan), 'job_snapshot_sha256': plan.job_snapshot_sha256,
            'revision': plan.revision, 'confirmation_origin': plan.approval.origin,
            'reused_across_candidates': True,
            'requirements': [r.model_dump(mode='json') for r in plan.requirements],
            'component_support_verified': False, 'logical_coverage_automatically_confirmed': False},
            'candidate_review_still_required': True}
