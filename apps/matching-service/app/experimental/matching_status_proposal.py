"""Thresholded pair proposals, never authenticated reviews or hiring decisions."""

from dataclasses import dataclass
import hashlib
import json
import math
import re

LABELS = ('matched', 'partial', 'not_established_in_provided_evidence')
STATUSES = ('matched', 'partially_matched', 'not_found_in_provided_evidence')
SCOPES = {'selected_evidence_passage', 'retrieved_top_k_window'}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     allow_nan=False).encode('utf-8')).hexdigest()


@dataclass(frozen=True)
class ProposalPolicy:
    thresholds: tuple[float, float, float]
    model_weights_sha256: str
    calibration_results_sha256: str
    evidence_scope: str
    query_scope: str

    def __post_init__(self):
        if (not isinstance(self.thresholds, tuple) or len(self.thresholds) != 3
                or any(type(t) not in (int, float) or not math.isfinite(t) or not 0 <= t <= 1
                       for t in self.thresholds)
                or self.evidence_scope not in SCOPES
                or self.query_scope not in {'prepared_component', 'whole_requirement'}
                or any(not isinstance(h, str) or not re.fullmatch('[0-9a-f]{64}', h)
                       for h in (self.model_weights_sha256, self.calibration_results_sha256))):
            raise ValueError('Explicit immutable thresholds, model/calibration pins and input scope required')


def propose_status(*, requirement, evidence, probabilities, model_weights_sha256,
                   evidence_scope, query_scope, policy, context_complete=True):
    """Caller supplies the actual model window, not just the quote it wants to show."""
    if (not isinstance(requirement, str) or not requirement.strip() or len(requirement) > 5000
            or evidence_scope not in SCOPES
            or query_scope not in {'prepared_component', 'whole_requirement'}
            or type(context_complete) is not bool
            or not isinstance(model_weights_sha256, str)
            or not re.fullmatch('[0-9a-f]{64}', model_weights_sha256)
            or not isinstance(evidence, (tuple, list))):
        raise ValueError('Explicit bounded requirement and actual inference scope required')
    ids = set()
    for item in evidence:
        if (not isinstance(item, dict) or set(item) != {'id', 'section', 'text'}
                or any(not isinstance(item[k], str) or not item[k].strip() for k in item)
                or len(item['text']) > 16000 or item['id'] in ids):
            raise ValueError('Unique source IDs, sections and original evidence text required')
        ids.add(item['id'])
    if len(evidence) > 32 or sum(len(e['text']) for e in evidence) > 16000:
        raise ValueError('Bounded actual inference window required')
    if evidence_scope == 'selected_evidence_passage' and len(evidence) > 1:
        raise ValueError('A selected passage cannot disguise a multi-passage window')
    if probabilities is not None:
        if (not isinstance(probabilities, dict) or set(probabilities) != set(LABELS)
                or any(type(v) not in (float, int) or not math.isfinite(v) or not 0 <= v <= 1
                       for v in probabilities.values())
                or not math.isclose(sum(probabilities.values()), 1., abs_tol=1e-6)):
            raise ValueError('Normalized native three-class scores required')
    result = {'schema': 'nexhire-matching-status-proposal-v1',
        'input_sha256': fingerprint({'requirement': requirement, 'evidence': evidence,
            'weights': model_weights_sha256, 'evidence_scope': evidence_scope,
            'query_scope': query_scope, 'context_complete': context_complete}),
        'status_proposal': None, 'threshold_applied': False, 'selected_threshold': None,
        'policy_results_sha256': policy.calibration_results_sha256,
        'assessment_status': 'PENDING_REVIEW', 'requires_hr_review': True,
        'verified_support': False, 'candidate_skill_absence_inferred': False,
        'candidate_rejected': False, 'is_training_label': False,
        'hr_review_authenticated': False, 'probabilities_are_calibrated': False,
        'production_approved': False, 'scope': evidence_scope}
    if model_weights_sha256 != policy.model_weights_sha256:
        raise ValueError('Threshold policy belongs to another model')
    if evidence_scope != policy.evidence_scope or query_scope != policy.query_scope:
        return {**result, 'reason': 'CALIBRATION_SCOPE_MISMATCH'}
    if not context_complete:
        return {**result, 'reason': 'INCOMPLETE_MODEL_CONTEXT'}
    if not evidence:
        return {**result, 'reason': 'NO_PROVIDED_EVIDENCE_NOT_A_SKILL_ABSENCE_DECISION'}
    if probabilities is None:
        return {**result, 'reason': 'NO_MODEL_SCORES'}
    winner = max(range(3), key=lambda i: probabilities[LABELS[i]])
    threshold = policy.thresholds[winner]
    accepted = probabilities[LABELS[winner]] >= threshold
    return {**result, 'status_proposal': STATUSES[winner] if accepted else None,
        'threshold_applied': True, 'selected_threshold': threshold,
        'reason': 'THRESHOLDED_UNVERIFIED_PROPOSAL' if accepted else 'BELOW_CLASS_THRESHOLD'}
