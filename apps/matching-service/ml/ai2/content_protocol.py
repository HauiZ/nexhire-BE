"""Content-review contract. Diagnostic labels never silently become ranking targets."""
from collections import Counter

STATES = {'EXPLICIT_CONTEXT', 'MENTION_ONLY', 'NEGATED', 'ALTERNATIVE_MISMATCH',
          'PARTIAL_COMPOSITE', 'NOT_ESTABLISHED', 'AMBIGUOUS'}


def validate_reviews(rows, *, review_policy='independent'):
    """Require source quotations and independently reviewed, disjoint job groups.

    Passing this structural check does not establish annotation correctness.
    """
    if review_policy not in {'independent', 'ai_silver'}:
        raise ValueError('explicit review policy required')
    groups, identities = {}, set()
    for row in rows:
        identity = row['id']
        if identity in identities:
            raise ValueError('duplicate review ID')
        identities.add(identity)
        split = row['split']
        if split not in {'development', 'validation', 'test'}:
            raise ValueError('invalid split')
        group = row['job_group']
        if group in groups and groups[group] != split:
            raise ValueError('job group crosses split')
        groups[group] = split
        if row['state'] not in STATES:
            raise ValueError('invalid observation state')
        for field in ('job_text', 'candidate_text'):
            if not isinstance(row[field], str) or not row[field].strip():
                raise ValueError('nonblank original sources required')
        for field, source in [('job_quote', 'job_text'), ('candidate_quote', 'candidate_text')]:
            quote = row.get(field)
            if quote is None and field == 'candidate_quote' and row['state'] == 'NOT_ESTABLISHED':
                continue
            if not isinstance(quote, str) or not quote or row[source].count(quote) != 1:
                raise ValueError('unique exact source quote required')
        if not row.get('reviewer_id') or not row.get('review_event_id'):
            raise ValueError('review provenance required')
        if split != 'development' and review_policy == 'ai_silver':
            if (row.get('label_origin') != 'AI_REVIEWED_SILVER'
                    or row.get('source_only_review') is not True
                    or row.get('split_frozen_before_review') is not True
                    or row.get('model_outputs_seen') is not False):
                raise ValueError('blinded source-only silver evaluation required')
        if split != 'development' and review_policy == 'independent' and (row.get('independent_review') is not True
                or row.get('adjudicated') is not True or row.get('author_is_reviewer') is not False):
            raise ValueError('independent adjudicated evaluation review required')
    return Counter(row['split'] for row in rows)


def training_readiness(rows):
    counts = validate_reviews(rows)
    reasons = []
    for split, minimum in [('development', 100), ('validation', 50), ('test', 50)]:
        if counts[split] < minimum:
            reasons.append(f'INSUFFICIENT_{split.upper()}_REVIEWS')
    # Labels concern evidence observations, not relative candidate relevance.
    reasons.append('NO_APPROVED_CANDIDATE_RANKING_TARGETS')
    return dict(training_ready=False, independent_gold=False, counts=dict(counts), blockers=reasons)
