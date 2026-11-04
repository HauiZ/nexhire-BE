"""Versioned action/object phrase observations, never requirement entailment.

A caller-reviewed literal vocabulary defines the scope. No hidden ontology,
semantic substitutions, duration inference or full-duty coverage claim.
"""

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class DutyRule:
    concept: str
    actions: tuple[str, ...]
    objects: tuple[str, ...]


@dataclass(frozen=True)
class DutyMention:
    concept: str
    start: int
    end: int
    quote: str
    action_start: int
    action_end: int
    object_start: int
    object_end: int
    status: str
    reasons: tuple[str, ...]
    context_start: int
    context_end: int
    context_quote: str


def _literal(text):
    return re.compile(r'(?<!\w)' + re.escape(text) + r'(?!\w)', re.I)


def extract_duty_mentions(text, rules):
    """Observe action before object within one line/sentence (max 160 code points).

    Co-occurrence is insufficient to establish grammatical attachment or who
    performed work. Every emitted pair is explicitly attachment-unverified. Negated,
    hypothetical and instructional sentences stay unknown, not positive support.
    """
    if not isinstance(text, str) or not isinstance(rules, tuple):
        raise ValueError('text and tuple of reviewed rules required')
    concepts = set()
    for rule in rules:
        if (not isinstance(rule, DutyRule) or not isinstance(rule.concept, str)
                or not rule.concept.strip() or rule.concept in concepts):
            raise ValueError('unique nonempty duty concepts required')
        concepts.add(rule.concept)
        for phrases in (rule.actions, rule.objects):
            if (not isinstance(phrases, tuple) or not phrases
                    or any(not isinstance(value, str) or not value.strip() for value in phrases)):
                raise ValueError('nonempty reviewed literal phrase tuples required')
    if re.search(r'<[^>]+>', text):
        return ()
    results = []
    for sentence in re.finditer(r'[^\n\r.!?;]+', text):
        clause = sentence.group()
        blockers = []
        if re.search(r"\b(?:not|no|never|without|cannot)\b|\b\w+n['’]t\b", clause, re.I):
            blockers.append('negation_scope_unresolved')
        if re.search(r'\b(?:would|could|wish|want|seek|seeking|learn|learning|if|must|should)\b', clause, re.I):
            blockers.append('hypothetical_or_instructional_scope')
        for rule in rules:
            pairs = []
            for action in rule.actions:
                for match in _literal(action).finditer(clause):
                    for object_text in rule.objects:
                        for object_match in _literal(object_text).finditer(clause):
                            if match.end() <= object_match.start() and object_match.end() - match.start() <= 160:
                                pairs.append((match.start(), match.end(), object_match.start(), object_match.end()))
            # Do not multiply observations for overlapping aliases of one pair.
            retained = []
            for pair in sorted(set(pairs), key=lambda pair: (pair[0], -(pair[3] - pair[0]))):
                if any(pair[0] >= old[0] and pair[3] <= old[3] for old in retained):
                    continue
                retained.append(pair)
                a, b, c, d = (value + sentence.start() for value in pair)
                results.append(DutyMention(rule.concept, a, d, text[a:d], a, b, c, d,
                    'unknown' if blockers else 'phrase_observation',
                    tuple(blockers) + ('action_object_attachment_unverified',),
                    sentence.start(), sentence.end(), sentence.group()))
    return tuple(results)
