"""Read-only HR shadow composition, isolated from production and old shadow app."""

from dataclasses import asdict, dataclass
import json
import math
import os
from pathlib import Path
import re

from pydantic import TypeAdapter

from app.experimental.evidence_assessment import AssessmentContext, retrieval_binding
from app.experimental.recruitment_verifier_runtime import LABELS, RecruitmentVerifier
from app.experimental.shadow_main import create_shadow_app
from app.experimental.shadow_requirement_matcher import AtomicRequirement, ShadowMatch, requirement_blocks
from app.experimental.shadow_runtime import ShadowEncoder, ShadowInputError


@dataclass(frozen=True)
class ComponentQuery:
    id: str
    query: str
    importance: str

    def __post_init__(self):
        if (not re.fullmatch('[a-zA-Z0-9_-]{1,64}', self.id)
                or not self.query.strip() or len(self.query) > 5000
                or requirement_blocks(self.query) != [self.query]
                or self.importance not in {'core', 'supplementary', 'preferred', 'unknown'}):
            raise ValueError('Literal bounded JD component query and importance required')


@dataclass(frozen=True)
class PreparedPlan:
    job_id: str
    requirement_id: str
    requirement_text: str
    groups: tuple[ComponentQuery, ...]
    origin: str

    def __post_init__(self):
        if (not self.job_id.strip() or not self.requirement_id.strip() or not self.requirement_text.strip()
                or not 1 <= len(self.groups) <= 8
                or len({g.id for g in self.groups}) != len(self.groups)
                or len({g.query for g in self.groups}) != len(self.groups)
                or self.origin not in {'assistant_jd_plan', 'hr_jd_plan'}):
            raise ValueError('Exact source-bound JD plan with unique groups required')


def load_plans(path):
    if not path:
        return ()
    value = json.loads(Path(path).read_text(encoding='utf-8'))
    if value['schema'] != 'nexhire-hr-shadow-plans-v1':
        raise ValueError('Explicit HR shadow JD-plan schema required')
    return tuple(PreparedPlan(p['job_id'], p['requirement_id'], p['requirement_text'],
        tuple(ComponentQuery(**g) for g in p['groups']), p['origin']) for p in value['plans'])


class HrShadowEngine:
    def __init__(self, encoder, verifier, plans=(), *, max_pairs=32):
        if type(max_pairs) is not int or not 1 <= max_pairs <= 64 or len(plans) > 256:
            raise ValueError('Bounded verifier workload and JD configuration required')
        self.encoder, self.verifier = encoder, verifier
        self.manifest, self.model_version = encoder.manifest, encoder.model_version
        self.max_pairs = max_pairs
        self.plans = {(p.job_id, p.requirement_id): p for p in plans}
        if len(self.plans) != len(plans):
            raise ValueError('Duplicate source requirement plans')

    def _matches(self, result):
        if (result['model_version'] != self.model_version
                or result['weights_sha256'] != self.manifest['weights_sha256']
                or result['production_changed'] is not False
                or result['automatically_supported'] is not False or result['candidate_rejected'] is not False):
            raise ValueError('Retriever identity or safety contract changed')
        matches = TypeAdapter(list[ShadowMatch]).validate_python(result['requirements'])
        if len({m.requirement.id for m in matches}) != len(matches):
            raise ValueError('Unique requirement identities required')
        for match in matches:
            ids = tuple(h.id for h in match.hits)
            if (ids != match.ranked_evidence_ids[:len(ids)] or len(ids) != len(set(ids))
                    or len(set(match.ranked_evidence_ids)) != len(match.ranked_evidence_ids)
                    or match.automatically_supported or match.candidate_rejected or not match.requires_manual_review):
                raise ValueError('Retrieval evidence window or review flags changed')
        return matches

    def _suggest(self, match, context):
        if match.hits:
            output = self.verifier.suggest(match.requirement.text, '\n'.join(h.text for h in match.hits))
        else:
            output = {'model_version': self.verifier.model_version,
                'weights_sha256': self.verifier.weights_sha256, 'results_sha256': self.verifier.results_sha256,
                'assessment_status': 'PENDING_REVIEW', 'verified_support': False,
                'decision_threshold_applied': False, 'probabilities_are_calibrated': False,
                'model_suggestion': None, 'probabilities': None, 'reason': 'NO_RETRIEVED_EVIDENCE'}
        if (output['model_version'] != self.verifier.model_version
                or output['weights_sha256'] != self.verifier.weights_sha256
                or output['results_sha256'] != self.verifier.results_sha256
                or output['assessment_status'] != 'PENDING_REVIEW' or output['verified_support'] is not False
                or output['decision_threshold_applied'] is not False
                or output['probabilities_are_calibrated'] is not False
                or output['model_suggestion'] not in (*LABELS, None)):
            raise ValueError('Unverified classifier suggestion contract changed')
        p = output['probabilities']
        suggestion = output['model_suggestion']
        if suggestion is None:
            if p is not None:
                raise ValueError('Unresolved model output must not invent scores')
        elif (not isinstance(p, dict) or set(p) != set(LABELS)
                or any(type(p[k]) not in (int, float) or not math.isfinite(p[k])
                       or not 0 <= p[k] <= 1 for k in LABELS)
                or not math.isclose(sum(p.values()), 1., abs_tol=1e-6)
                or LABELS[max(range(3), key=lambda i: p[LABELS[i]])] != suggestion):
            raise ValueError('Normalized native classifier scores and consistent argmax required')
        return {'requirement': asdict(match.requirement),
            'retrieval_sha256': retrieval_binding(match, context),
            'retrieved_evidence': [asdict(h) for h in match.hits], 'verifier': output,
            'scope': 'retrieved_window_only', 'requires_hr_review': True,
            'verified_support': False, 'candidate_skill_absence_inferred': False}

    def score(self, job, candidate):
        result = self.encoder.score(job, candidate)
        matches = self._matches(result)
        context = AssessmentContext(job.id, candidate.candidateId, self.model_version, self.manifest['weights_sha256'])
        requests = []
        used_plans = {}
        for match in matches:
            plan = self.plans.get((job.id, match.requirement.id))
            if plan:
                if plan.requirement_text != match.requirement.text:
                    raise ShadowInputError('JD plan is stale')
                used_plans[match.requirement.id] = plan
                requests += [(match.requirement.id, group) for group in plan.groups]
        if len(matches) + len(requests) > self.max_pairs:
            raise ShadowInputError('HR shadow verifier pair budget exceeded')
        components = {}
        if requests:
            component_job = job.model_copy(update={'skills': [], 'description': '',
                'requirements': '\n'.join(group.query for _, group in requests)})
            retrieved = self._matches(self.encoder.score(component_job, candidate))
            if len(retrieved) != len(requests):
                raise ValueError('Incomplete component retrieval')
            for i, ((parent_id, group), match) in enumerate(zip(requests, retrieved)):
                if match.requirement.id != f'requirements/{i}' or match.requirement.text != group.query:
                    raise ValueError('Component query/source mapping changed')
                component_match = ShadowMatch(AtomicRequirement(parent_id + '/component/' + group.id,
                    group.query, 'prepared_jd_component'), match.status, match.hits,
                    match.ranked_evidence_ids, match.reason_codes)
                components.setdefault(parent_id, []).append({'group_id': group.id,
                    'importance': group.importance, **self._suggest(component_match, context)})
        proposals = []
        for match in matches:
            groups = components.get(match.requirement.id)
            plan = used_plans.get(match.requirement.id)
            proposals.append({**self._suggest(match, context),
                'component_analysis': 'PREPARED_JD_PLAN_UNVERIFIED_PROPOSALS' if plan else 'NOT_PERFORMED',
                'jd_plan_origin': plan.origin if plan else None,
                'jd_only_provenance_independently_verified': False,
                'component_proposals': groups,
                'groups_flagged_by_model': [g['group_id'] for g in groups
                    if g['verifier']['model_suggestion'] != 'matched'] if groups is not None else None,
                'groups_needing_hr_confirmation': [g['group_id'] for g in groups] if groups is not None else None,
                'confirmed_missing_groups': None})
        return {**result, 'hr_shadow_schema': 'nexhire-hr-shadow-proposals-v1',
            'hr_proposals': proposals, 'assessment_status': 'PENDING_REVIEW',
            'review_mode': 'unverified_suggestions_only', 'reviews_accepted': False,
            'hr_review_authenticated': False, 'ranking_score': None, 'ranking_position': None,
            'component_plans_are_not_encoder_extractions': True,
            'verifier_version': self.verifier.model_version, 'verifier_weights_sha256': self.verifier.weights_sha256}


def create_app():
    manifest = os.environ.get('MATCHING_SHADOW_MANIFEST')
    token = os.environ.get('MATCHING_SHADOW_TOKEN', '')
    directory = os.environ.get('MATCHING_SHADOW_VERIFIER_DIR')
    pin = os.environ.get('MATCHING_SHADOW_VERIFIER_RESULTS_SHA256')
    if not manifest or len(token) < 16 or not directory or not pin:
        raise ValueError('Explicit shadow retriever, verifier pin and dedicated token required')
    encoder = ShadowEncoder.from_manifest(manifest)
    verifier = RecruitmentVerifier(directory, pin)
    engine = HrShadowEngine(encoder, verifier, load_plans(os.environ.get('MATCHING_SHADOW_JD_PLANS')))
    return create_shadow_app(engine, token)
