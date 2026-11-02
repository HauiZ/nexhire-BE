"""Validate explicitly reviewed, source-bound condition plans without inference.

No labels/annotation groups are accepted as plan inputs. Review provenance is
required metadata, not authentication: online callers must authorize the reviewer.
"""

from dataclasses import dataclass
from collections.abc import Mapping

from app.ranking.conditions import Condition, Support, evaluate_condition
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import JobMatchingSnapshot


@dataclass(frozen=True)
class ReviewedAtom:
    atom_id: str
    field_path: str
    start: int
    end: int
    quote: str
    criterion: str
    priority: str


@dataclass(frozen=True)
class ReviewedPlan:
    version: str
    job_snapshot_sha256: str
    reviewer_id: str
    review_event_id: str
    atoms: tuple[ReviewedAtom, ...]
    condition: Condition


def validate_reviewed_plan(job, plan):
    """Validate quote fidelity and tree completeness, not adequacy/HR approval.

    A full-coverage approval still requires human/domain review. A syntactically
    valid plan can omit an important requirement; this cannot detect that omission.
    No condition may silently import an ID from an annotation/target source.
    """
    if not isinstance(job, JobMatchingSnapshot) or not isinstance(plan, ReviewedPlan):
        raise ValueError('validated job and reviewed plan required')
    if plan.version != 'ai2-reviewed-conditions-v1':
        raise ValueError('unsupported plan version')
    if snapshot_digest(job) != plan.job_snapshot_sha256:
        raise ValueError('plan snapshot digest mismatch')
    if any(not isinstance(value, str) or not value.strip()
           for value in (plan.reviewer_id, plan.review_event_id)):
        raise ValueError('explicit review provenance required')
    if not isinstance(plan.atoms, tuple) or not plan.atoms or len(plan.atoms) > 128:
        raise ValueError('bounded nonempty reviewed atoms required')
    fields = {'description': job.description, 'requirements': job.requirements}
    fields.update({f'skills[{i}]': text for i, text in enumerate(job.skills)})
    identities = set()
    for atom in plan.atoms:
        if not isinstance(atom, ReviewedAtom):
            raise ValueError('typed reviewed atom required')
        if (not isinstance(atom.atom_id, str) or not atom.atom_id.strip()
                or atom.atom_id in identities):
            raise ValueError('unique nonempty atom IDs required')
        identities.add(atom.atom_id)
        if atom.criterion not in {'duty', 'tool', 'education', 'scoped_experience', 'certification'}:
            raise ValueError('unsupported professional criterion')
        if atom.priority not in {'required', 'preferred', 'unspecified', 'unknown'}:
            raise ValueError('unsupported priority')
        text = fields.get(atom.field_path)
        if (text is None or type(atom.start) is not int or type(atom.end) is not int
                or not 0 <= atom.start < atom.end <= len(text)
                or text[atom.start:atom.end] != atom.quote):
            raise ValueError('atom source span mismatch')
    # Validate tree shape, depth and duplicate atoms via unknown observations.
    evaluate_condition(plan.condition, {})
    used = set()

    def visit(node):
        if node.operator == 'atom':
            used.add(node.atom_id)
        for child in node.children:
            visit(child)

    visit(plan.condition)
    if used != identities:
        raise ValueError('condition and reviewed atom IDs must match exactly')
    return plan


def evaluate_reviewed_plan(job, plan, observations):
    """Evaluate only explicit support states supplied by a separate reviewed layer.

    This is not a feature score, candidate assessment or evidence matcher. Evidence
    verification/ownership and candidate binding remain caller responsibilities.
    """
    validate_reviewed_plan(job, plan)
    if not isinstance(observations, Mapping):
        raise ValueError('observations must be a mapping')
    allowed = {atom.atom_id for atom in plan.atoms}
    if set(observations) - allowed:
        raise ValueError('unexpected observation IDs')
    if any(not isinstance(value, Support) for value in observations.values()):
        raise ValueError('typed support observations required')
    return evaluate_condition(plan.condition, observations)
