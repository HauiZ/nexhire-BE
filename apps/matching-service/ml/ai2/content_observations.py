"""Experimental source observations; not a trained feature schema or support verdict."""
from app.matching.evidence_content import mentions
import re


def observe_content(requirement, passages):
    expected = mentions(requirement)
    observed = []
    for passage in passages:
        text, source = passage['text'], passage['source']
        matched = sorted(expected & mentions(text))
        negation = bool(re.search(r'\b(?:no|not|never|without)\b', text, re.I))
        observed.append(dict(source=source, text=text, requested_concepts_mentioned=matched,
            negation_cue=negation, listing_only=source in {'skill', 'technology'},
            context_attachment_verified=False, support_verified=False))
    return dict(schema='ai2-content-observations-draft-v1', requirement=requirement,
        requested_concepts=sorted(expected), passages=observed,
        logic_status='UNREVIEWED_NO_AND_OR_INFERENCE',
        absent_from_supplied_passages=sorted(expected - set().union(*(set(x['requested_concepts_mentioned']) for x in observed))),
        whole_cv_absence_established=False, usable_as_training_features=False)
