"""Lossless condition observations, not an inferred professional requirement plan.

Only caller-reviewed atomic propositions may form executable all/any conditions.
Automatic text observations always retain unresolved logic; words such as 'or'
alone cannot establish the grouping or scope of a recruiting requirement.
"""

from dataclasses import dataclass
from collections.abc import Mapping
from enum import Enum
import re


class Support(str, Enum):
    SUPPORTED = 'supported'
    NOT_SUPPORTED = 'not_supported'
    UNKNOWN = 'unknown'


@dataclass(frozen=True)
class Condition:
    operator: str
    atom_id: str | None = None
    children: tuple['Condition', ...] = ()


def evaluate_condition(condition, observations):
    """Three-valued evaluation of reviewed logic, never evidence generation.

    NOT_SUPPORTED means a reviewed proposition is not supported by evidence,
    not proof of inability. Missing observations stay UNKNOWN. No numeric score.
    """
    if not isinstance(observations, Mapping):
        raise ValueError('observations must be a mapping')
    seen = set()

    def evaluate(node, depth=0):
        if not isinstance(node, Condition) or depth > 32:
            raise ValueError('invalid or excessively deep condition')
        if node.operator == 'atom':
            if (not isinstance(node.atom_id, str) or not node.atom_id.strip()
                    or not isinstance(node.children, tuple) or node.children
                    or node.atom_id in seen):
                raise ValueError('unique nonempty atom IDs required')
            seen.add(node.atom_id)
            value = observations.get(node.atom_id, Support.UNKNOWN)
            if not isinstance(value, Support):
                raise ValueError('typed support observations required')
            return value
        if (node.operator not in {'all', 'any'} or node.atom_id is not None
                or not isinstance(node.children, tuple) or len(node.children) < 2):
            raise ValueError('all/any require at least two children and no atom ID')
        values = [evaluate(child, depth + 1) for child in node.children]
        if node.operator == 'all':
            if Support.NOT_SUPPORTED in values:
                return Support.NOT_SUPPORTED
            return Support.SUPPORTED if all(v == Support.SUPPORTED for v in values) else Support.UNKNOWN
        if Support.SUPPORTED in values:
            return Support.SUPPORTED
        return Support.NOT_SUPPORTED if all(v == Support.NOT_SUPPORTED for v in values) else Support.UNKNOWN

    return evaluate(condition)


@dataclass(frozen=True)
class CredentialMention:
    start: int
    end: int
    quote: str
    credential: str
    completion: str = 'unknown'
    field: str | None = None


# Case-sensitive uppercase undotted acronyms avoid 'as', 'ba' etc. in prose.
_CREDENTIAL = re.compile(
    r"\b(?:[Bb]achelor(?:['’]s)?(?:\s+of\s+(?:[Ss]cience|[Aa]rts))?|"
    r"[Mm]aster(?:['’]s)?(?:\s+of\s+(?:[Ss]cience|[Aa]rts))?|"
    r"[Dd]octorate|BS|BA|MS|MA|PhD)\b|"
    r"(?<!\w)(?:B\.[SA]\.|M\.[SA]\.|Ph\.D\.)(?!\w)")


def credential_mentions(text):
    """Literal degree mentions only. Never infer completion, field or equivalence.

    Separate from old education extractor so no legacy feature changes silently.
    A reviewed rule for completion/discipline must be added before those populate.
    """
    if not isinstance(text, str):
        raise ValueError('text must be a string')
    result = []
    for match in _CREDENTIAL.finditer(text):
        value = match.group().lower().replace('.', '')
        credential = ('bachelor' if value.startswith('bachelor') or value in {'bs', 'ba'}
                      else 'master' if value.startswith('master') or value in {'ms', 'ma'}
                      else 'doctorate')
        result.append(CredentialMention(match.start(), match.end(), match.group(), credential))
    return tuple(result)


@dataclass(frozen=True)
class CertificationDisposition:
    quote: str
    disposition: str
    reason: str


def certification_disposition(text, *, excluded_regulatory_names):
    """Caller-reviewed exact names only; unknown licenses never become skills.

    No inferred eligibility, no automatic inclusion of unmatched certifications.
    This is a disposition, not license authenticity or professional competence.
    """
    if not isinstance(text, str) or not text.strip():
        raise ValueError('nonblank certification text required')
    if (not isinstance(excluded_regulatory_names, (tuple, list))
            or any(not isinstance(name, str) or not name.strip()
                   for name in excluded_regulatory_names)):
        raise ValueError('reviewed regulatory names must be nonblank strings')
    excluded = text.strip().casefold() in {name.strip().casefold() for name in excluded_regulatory_names}
    return CertificationDisposition(text, 'excluded' if excluded else 'unresolved',
        'reviewed_regulatory_eligibility' if excluded else 'professional_or_regulatory_status_unreviewed')
