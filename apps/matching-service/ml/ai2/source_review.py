"""Bind source-only development review proposals; never accept fit labels."""

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class ReviewQuote:
    snapshot_sha256: str
    field_path: str
    start: int
    end: int
    quote: str
    evidence_id: str | None


def resolve_quote(fields, field_path, quote):
    """Require a unique exact occurrence; ambiguous text requires explicit review.

    Input field envelopes must come from the validated snapshot field walker.
    This checks fidelity only, not meaning or trustworthiness of the reviewer.
    """
    matches = [field for field in fields if field['field_path'] == field_path]
    if len(matches) != 1 or not isinstance(quote, str) or not quote.strip():
        raise ValueError('one allowed field and nonblank quote required')
    field = matches[0]
    text = field['text']
    start = text.find(quote)
    if start < 0 or text.find(quote, start + 1) >= 0:
        raise ValueError('quote must have one exact occurrence')
    return ReviewQuote(field['snapshot_sha256'], field_path, start, start + len(quote),
                       quote, field.get('evidence_id'))


def bind_source_review(task, proposal):
    """Validate a blinded source review envelope without turning it into features.

    States are observations, not E/P/N or model targets. Source silence is local
    to the supplied fields. Complete coverage of a proposal is not full JD coverage.
    """
    if not isinstance(task, Mapping) or not isinstance(proposal, Mapping):
        raise ValueError('task and proposal must be mappings')
    if (task.get('split') != 'train' or task.get('task_id') != proposal.get('task_id')
            or proposal.get('schema_version') != 'ai2-source-review-proposal-v1'
            or proposal.get('status') != 'development_proposal_not_approved'
            or proposal.get('used_targets') is not False):
        raise ValueError('train-only unapproved source proposal required')
    required = proposal.get('requirements')
    if not isinstance(required, list) or not required:
        raise ValueError('requirements must be a nonempty list')
    requirement_ids = set()
    bound_requirements = []
    for item in required:
        identity = item.get('id')
        if not isinstance(identity, str) or not identity.strip() or identity in requirement_ids:
            raise ValueError('unique nonempty requirement IDs required')
        if item.get('priority') not in {'required', 'preferred', 'unspecified', 'unknown'}:
            raise ValueError('invalid priority')
        requirement_ids.add(identity)
        bound_requirements.append({'id': identity, 'priority': item['priority'],
            'source': resolve_quote(task['job']['review_fields'], item['field_path'], item['quote'])})

    candidates = {item['snapshot_id']: item for item in task['candidates']}
    if len(candidates) != len(task['candidates']):
        raise ValueError('duplicate task candidate IDs')
    seen = set()
    bound_observations = []
    for candidate in proposal.get('candidate_observations', []):
        identity = candidate.get('candidate_id')
        if identity not in candidates or identity in seen:
            raise ValueError('unexpected or duplicate candidate')
        seen.add(identity)
        observed = set()
        for observation in candidate.get('observations', []):
            requirement = observation.get('requirement_id')
            if requirement not in requirement_ids or requirement in observed:
                raise ValueError('unexpected or duplicate requirement observation')
            observed.add(requirement)
            state = observation.get('state')
            if state == 'no_explicit_mention_found':
                if 'quote' in observation or 'field_path' in observation:
                    raise ValueError('source-silence state must not carry evidence')
                quote = None
            elif state in {'literal_observation', 'related_scope_unknown'}:
                quote = resolve_quote(candidates[identity]['review_fields'],
                    observation['field_path'], observation['quote'])
            else:
                raise ValueError('unsupported observation state')
            bound_observations.append((identity, requirement, state, quote))
        if observed != requirement_ids:
            raise ValueError('every proposed requirement needs an explicit observation state')
    if seen != set(candidates):
        raise ValueError('all task candidates must be reviewed')
    unresolved = []
    for item in proposal.get('unresolved_conditions', []):
        reason = item.get('reason')
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError('unresolved condition requires an explicit reason')
        unresolved.append({'source': resolve_quote(task['job']['review_fields'],
                           item['field_path'], item['quote']), 'reason': reason})
    return {'status': 'source_bound_development_proposal_not_approved',
            'task_id': task['task_id'], 'requirements': tuple(bound_requirements),
            'observations': tuple(bound_observations), 'unresolved_conditions': unresolved}
