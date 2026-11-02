"""Conservative English-first extractors over unmodified snapshot field strings.

An observed mention is not competence. Offsets are Python Unicode code-point,
zero-based, half-open offsets into exactly the supplied field, not a PDF. The
caller supplies/reviews the tool vocabulary; these helpers contain no ontology.
"""

from dataclasses import dataclass
import re
from typing import Mapping, Optional, Sequence, Tuple, Union

RULE_VERSION = "ai2-source-en-v1"


@dataclass(frozen=True)
class YearConstraint:
    minimum: int
    maximum: Optional[int] = None
    unit: str = "years"


@dataclass(frozen=True)
class EducationConstraint:
    credential: str
    field: Optional[str] = None
    completed: Optional[bool] = None


@dataclass(frozen=True)
class Anchor:
    field_path: str
    start: int
    end: int
    quote: str
    normalized: Union[str, YearConstraint, EducationConstraint, None]
    kind: str
    rule_version: str
    priority: str
    polarity: str
    scope: Optional[str] = None
    unknown_reason: Optional[str] = None
    # A field string cannot establish the enclosing snapshot's identity.
    snapshot_hash: Optional[str] = None


@dataclass(frozen=True)
class ExtractionResult:
    status: str  # observed | unknown | no_explicit_constraint
    anchors: Tuple[Anchor, ...] = ()
    reasons: Tuple[str, ...] = ()


# Split only explicit local boundaries, never normalize/strip the input first.
_CLAUSE_BREAK = re.compile(r"[;\n!?]|(?<!\d),|,(?!\d)|\.(?=\s|$)|\b(?:but|whereas|while)\b", re.I)
_REQUIRED = re.compile(r"\b(?:required|mandatory|must|require[sd]?)\b", re.I)
_PREFERRED = re.compile(r"\b(?:preferred|optional|desirable|nice[ -]to[ -]have)\b", re.I)
_NEGATIVE = re.compile(r"\b(?:no|not|never|without|lack(?:s|ing)?|neither|nor|cannot|can['’]t|don['’]t|doesn['’]t|isn['’]t|unnecessary|unneeded)\b", re.I)
_VI = re.compile(r"[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹ]")


def _clauses(text: str, *, preserve_commas: bool = False):
    start = 0
    for match in _CLAUSE_BREAK.finditer(text):
        if preserve_commas and match.group(0) == ",":
            continue
        if start < match.start():
            yield start, match.start()
        start = match.end()
    if start < len(text):
        yield start, len(text)


def _local(text: str, start: int, end: int) -> str:
    for left, right in _clauses(text):
        if left <= start and end <= right:
            # A heading before ':' cannot impose priority on its body.
            heading_end = text.rfind(":", left, start)
            return text[max(left, heading_end + 1):right]
    return text[start:end]


def _attributes(clause: str):
    required = bool(_REQUIRED.search(clause))
    preferred = bool(_PREFERRED.search(clause))
    negative = bool(_NEGATIVE.search(clause))
    if negative:
        # Deliberately do not guess the attachment of negation to a mention.
        return "unknown", "unknown", "ambiguous_negation"
    if required and preferred:
        return "unknown", "mention", "ambiguous_priority"
    return ("required" if required else "preferred" if preferred else "unspecified"), "mention", None


def _anchor(text, path, start, end, normalized, kind, clause=None, scope=None, reason=None):
    priority, polarity, attribute_reason = _attributes(clause if clause is not None else text[start:end])
    return Anchor(path, start, end, text[start:end], normalized, kind, RULE_VERSION,
                  priority, polarity, scope, reason or attribute_reason)


def _result(anchors, absent="no_explicit_constraint"):
    anchors = tuple(anchors)
    reasons = tuple(dict.fromkeys(a.unknown_reason for a in anchors if a.unknown_reason))
    return ExtractionResult("unknown" if reasons else "observed" if anchors else absent, anchors,
                            reasons or (() if anchors else ("no_observed_match",)))


def _input(text, field_path, kind, language=None):
    if text is None or not text.strip():
        return ExtractionResult("unknown", reasons=("missing_source",))
    if language is not None and (language.lower() not in {"en", "eng", "english"} or _VI.search(text)):
        return _result([_anchor(text, field_path, 0, len(text), None, kind,
                               reason="unsupported_language")])
    return None


def _token_char(char: str) -> bool:
    # Combining marks and joiners must not create fabricated word boundaries.
    import unicodedata
    return char.isalnum() or char == "_" or unicodedata.category(char).startswith("M") or char in "‌‍"


def _boundary(text: str, start: int, end: int) -> bool:
    return not ((start and (_token_char(text[start - 1]) or text[start - 1] in "+#")) or
                (end < len(text) and (_token_char(text[end]) or text[end] in "+#")))


def extract_tools(text: Optional[str], field_path: str,
                  vocabulary: Mapping[str, Sequence[str]]) -> ExtractionResult:
    """Find literal reviewed aliases; longest matches win, repeats survive.

    Canonical keys also count as aliases. Empty aliases are ignored. Conflicting
    same-span canonical mappings are retained as one unknown anchor, not guessed.
    Python re.IGNORECASE matches the raw string without offset-changing casefold.
    """
    missing = _input(text, field_path, "tool")
    if missing is not None:
        return missing
    candidates = {}
    for canonical, aliases in vocabulary.items():
        if isinstance(aliases, str):
            aliases = (aliases,)
        for alias in {canonical, *aliases}:
            if not alias:
                continue
            for match in re.finditer(re.escape(alias), text, re.I):
                start, end = match.span()
                if _boundary(text, start, end):
                    candidates.setdefault((start, end), set()).add(canonical)
    selected = []
    for (start, end), names in sorted(candidates.items(), key=lambda item: (-(item[0][1] - item[0][0]), item[0][0])):
        if any(start < other_end and other_start < end for other_start, other_end, _ in selected):
            continue
        selected.append((start, end, names))
    anchors = []
    for start, end, names in sorted(selected):
        ambiguous = len(names) != 1
        anchors.append(_anchor(text, field_path, start, end, None if ambiguous else next(iter(names)),
                               "tool", _local(text, start, end),
                               reason="ambiguous_alias" if ambiguous else None))
    return _result(anchors)


_YEARS = re.compile(
    r"(?<![\w.,+−-])(?:(?:at\s+least|minimum(?:\s+of)?|min\.?)\s+)?"
    r"(?P<low>\d+)(?:\s*(?:to|[-–])\s*(?P<high>\d+)|(?P<plus>\+))?"
    r"\s+years?(?:['’]s|['’])?(?!\w)", re.I)


def _malformed_year_number(clause: str) -> bool:
    # Never salvage an integer suffix from decimals, grouped or signed values.
    if re.search(r"\d[.,]\d", clause):
        return True
    for sign in re.finditer(r"[-−+]\s*\d", clause):
        prefix = clause[:sign.start()].rstrip()
        if sign.group(0).startswith(("−", "+")) or not prefix or not prefix[-1].isdigit():
            return True
    return False

_EXPERIENCE = re.compile(r"\bexperience\b", re.I)
_DURATION = re.compile(r"\b(?:contract|duration|term|agreement|warranty|subscription)\b", re.I)


def extract_year_constraints(text: Optional[str], field_path: str, *, language: str = "en") -> ExtractionResult:
    """Parse narrow explicit year bounds, never infer tenure from dates or tools.

    Scoped experience retains its literal scope. Bare 'experience' is unresolved;
    only explicit total/work/professional wording is labeled total experience.
    """
    unsupported = _input(text, field_path, "years", language)
    if unsupported is not None:
        return unsupported
    anchors = []
    for left, right in _clauses(text):
        clause = text[left:right]
        if not _EXPERIENCE.search(clause):
            # Label-inverted tenure is not supported yet; retain an explicit
            # unknown rather than equating an unlabeled duration with tenure.
            if re.search(r"\byears?\b", clause, re.I) and ":" in clause and (_REQUIRED.search(clause) or _PREFERRED.search(clause)):
                anchors.append(_anchor(text, field_path, left, right, None, "years", clause,
                                       reason="unsupported_inverted_experience_label"))
            continue
        if _malformed_year_number(clause):
            anchors.append(_anchor(text, field_path, left, right, None, "years", clause,
                                   reason="malformed_year_number"))
            continue
        matches = list(_YEARS.finditer(clause))
        if _DURATION.search(clause):
            if matches:
                anchors.append(_anchor(text, field_path, left, right, None, "years",
                                       reason="ambiguous_contract_duration"))
            continue
        if not matches:
            if re.search(r"\byears?\b|\d|\b(?:yrs?|months?)\b", clause, re.I):
                anchors.append(_anchor(text, field_path, left, right, None, "years",
                                       reason="unsupported_year_grammar"))
            continue
        for match in matches:
            before, after = clause[:match.start()], clause[match.end():]
            # Adjacency is intentionally narrow: no remote experience keyword.
            following = re.match(r"\s+(?:(?:of|professional|work|total|minimum)\s+)*experience\b", after, re.I)
            # Preserve an explicit single-token domain as raw scope, not total.
            domain_following = re.match(r"\s+(?:minimum\s+)?(?P<domain>[^\W\d_]+)\s+experience\b", after, re.I) if not following else None
            preceding = re.search(r"\bexperience\s*(?::|of)?\s*$", before, re.I)
            reason = None
            scope = None
            if domain_following:
                scope = domain_following.group("domain")
            elif not following and not preceding:
                reason = "unresolved_experience_attachment"
            else:
                tail = after[following.end():] if following else after
                scoped = re.match(r"\s+(?:in|with|using|as)\s+(.+)", tail, re.I)
                total = ((following and re.search(r"\b(?:total|professional|work)\s+experience\b", following.group(0), re.I))
                         or (preceding and re.search(r"\b(?:total|professional|work)\s+experience\s*(?::|of)?\s*$", before, re.I)))
                if scoped:
                    # A local scope overrides any generic professional wording.
                    scope = scoped.group(0).strip()
                elif total and re.fullmatch(r"\s*(?:required|preferred|mandatory|is required|is preferred)?\s*", tail, re.I):
                    scope = "total_professional_experience"
                else:
                    reason = "unresolved_experience_scope"
            minimum = int(match.group("low"))
            maximum = int(match.group("high")) if match.group("high") else None
            if maximum is not None and maximum < minimum:
                reason = "invalid_year_range"
            # Keep full local clause for an unresolved scope/attachment audit.
            start, end = (left, right) if reason else (left + match.start(), left + match.end())
            anchors.append(_anchor(text, field_path, start, end, YearConstraint(minimum, maximum),
                                   "years", clause, scope, reason))
    return _result(anchors)


_DEGREE = re.compile(r"(?<!\w)(?P<degree>bachelor|master|doctorate|associate)(?:['’]s|s)?(?:\s+degree)?(?!\w)", re.I)
_EDUCATION_UNCERTAIN = re.compile(r"\b(?:equivalent|equivalency|related|incomplete|pursuing|studying|expected|candidate|enrolled|towards?|or|coursework|courses?|will|would|next\s+year)\b", re.I)
_COMPLETED = re.compile(r"\b(?:completed|earned|awarded|holds?|obtained|graduated)\b", re.I)


def extract_education(text: Optional[str], field_path: str, *, language: str = "en") -> ExtractionResult:
    """Extract explicit credentials, not school prestige or license equivalency."""
    unsupported = _input(text, field_path, "education", language)
    if unsupported is not None:
        return unsupported
    anchors = []
    # Credential alternatives often cross a comma; retain them for abstention.
    for left, right in _clauses(text, preserve_commas=True):
        clause = text[left:right]
        matches = [match for match in _DEGREE.finditer(clause)
                   if _boundary(clause, *match.span())]
        if not matches:
            if re.search(r"\b(?:degree|diploma|credential|education|phd|ph\.d)\b", clause, re.I):
                anchors.append(_anchor(text, field_path, left, right, None, "education",
                                       reason="unrecognized_education_constraint"))
            continue
        for match in matches:
            # Bare occupational/social titles are not academic credentials.
            credential_explicit = ("degree" in match.group(0).lower()
                                   or match.group("degree").lower() == "doctorate"
                                   or bool(re.match(r"\s+of\s+", clause[match.end():], re.I)))
            if not credential_explicit:
                anchors.append(_anchor(text, field_path, left, right, None, "education", clause,
                                       reason="ambiguous_credential_or_title"))
                continue
            uncertain = bool(_EDUCATION_UNCERTAIN.search(clause) or len(matches) > 1)
            completed = bool(_COMPLETED.search(clause)) and not uncertain and not _NEGATIVE.search(clause)
            requirement = bool(_REQUIRED.search(clause) or _PREFERRED.search(clause))
            reason = None
            if uncertain:
                reason = "ambiguous_incomplete_or_equivalent_education"
            elif not completed and not requirement:
                reason = "completion_or_requirement_unspecified"
            field_match = re.match(r"\s+in\s+(.+?)(?=\s+(?:required|preferred|is|mandatory)\b|$)", clause[match.end():], re.I)
            field = field_match.group(1) if field_match else None
            normalized = EducationConstraint(match.group("degree").lower(), field, True if completed else None)
            anchors.append(_anchor(text, field_path, left, right, normalized, "education", clause,
                                   "completed_credential" if completed else "credential_requirement" if requirement else None,
                                   reason))
    return _result(anchors)
