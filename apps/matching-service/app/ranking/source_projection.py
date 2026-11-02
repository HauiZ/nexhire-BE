"""Conservative shared source projection, not competency or tenure satisfaction.

Only explicit line-start role headers with ISO month ranges establish text/date
attachment. Ambiguous source remains visible, never attached to outer dates.
"""

from dataclasses import dataclass
from datetime import date
import re

from app.ranking.conditions import credential_mentions
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot

VERSION = 'ai2-source-projection-v1'
_HEADER = re.compile(
    r'(?m)^[ \t]*(?P<title>[^\n|]+?)\s*\|\s*'
    r'(?P<start>\d{4}-\d{2})\s+to\s+'
    r'(?P<end>\d{4}-\d{2}|present)\.(?=\s|$)', re.I)
_DATE_CUE = re.compile(r'\b\d{4}\b|\bpresent\b|^.*\|', re.I | re.M)


@dataclass(frozen=True)
class SourceSpan:
    field_path: str
    start: int
    end: int
    quote: str


@dataclass(frozen=True)
class ProjectedRole:
    source: SourceSpan
    record_id: str | None
    attachment: str
    start_month: str | None
    end_month: str | None
    is_current: bool | None
    header: SourceSpan | None
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class RequirementClause:
    source: SourceSpan
    priority: str
    condition_structure: str
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class ProjectedCredential:
    source: SourceSpan
    record_id: str | None
    credential: str
    completion: str = 'unknown'
    discipline: str | None = None


@dataclass(frozen=True)
class SourceProjection:
    version: str
    snapshot_sha256: str
    reference_date: str
    roles: tuple[ProjectedRole, ...] = ()
    clauses: tuple[RequirementClause, ...] = ()
    issues: tuple[str, ...] = ()
    credentials: tuple[ProjectedCredential, ...] = ()


def _reference(value):
    if not isinstance(value, str):
        raise ValueError('reference_date must be an ISO date')
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError('reference_date must be an ISO date')
    return parsed.strftime('%Y-%m')


def _span(text, path, start, end):
    return SourceSpan(path, start, end, text[start:end])


def _month(value):
    date.fromisoformat(value + '-01')
    return value


def project_candidate(candidate: CandidateMatchingSnapshot, *, expected_sha256, reference_date):
    """Project only validated shared snapshots; never use raw-only source sections.

    Structured dates are intentionally not reused for an unsegmented description:
    the normalized contract currently cannot guarantee role/text attachment.
    Empty dated records remain chronology-only records, not evidence of duties.
    """
    reference = _reference(reference_date)
    if not isinstance(candidate, CandidateMatchingSnapshot):
        raise ValueError('validated candidate snapshot required')
    digest = snapshot_digest(candidate)
    if digest != expected_sha256:
        raise ValueError('snapshot digest mismatch')
    roles, issues = [], []
    for index, record in enumerate(candidate.experiences):
        text = record.description
        path = f'experiences[{index}].description'
        if not text or not text.strip():
            issues.append(f'experiences[{index}]:no_role_text')
            continue
        if re.search(r'<[^>]+>', text):
            roles.append(ProjectedRole(_span(text, path, 0, len(text)), record.id,
                'unknown', None, None, None, None, ('html_structure_unresolved',)))
            continue
        matches = list(_HEADER.finditer(text))
        if not matches:
            roles.append(ProjectedRole(_span(text, path, 0, len(text)), record.id,
                'unknown', None, None, None, None, ('unverified_text_date_attachment',)))
            continue
        if text[:matches[0].start()].strip():
            roles.append(ProjectedRole(_span(text, path, 0, matches[0].start()), record.id,
                'unknown', None, None, None, None, ('unattached_preamble',)))
        for position, match in enumerate(matches):
            end = matches[position + 1].start() if position + 1 < len(matches) else len(text)
            reasons = []
            start_month, end_month, current = None, None, None
            try:
                start_month = _month(match['start'])
                current = match['end'].lower() == 'present'
                end_month = reference if current else _month(match['end'])
                if start_month > end_month or end_month > reference:
                    reasons.append('invalid_or_future_interval')
            except ValueError:
                reasons.append('invalid_calendar_month')
            # Additional dates may identify an unrecognized nested role. Abstain
            # rather than attaching the rest of the text to a recognized header.
            if _DATE_CUE.search(text[match.end():end]):
                reasons.append('additional_date_cue_in_role_body')
            if reasons:
                start_month, end_month, current = None, None, None
            roles.append(ProjectedRole(_span(text, path, match.start(), end), record.id,
                'unknown' if reasons else 'explicit_header', start_month, end_month,
                current, _span(text, path, match.start(), match.end()), tuple(reasons)))
    credentials = []
    for index, record in enumerate(candidate.educations):
        for name in ('degree', 'fieldOfStudy', 'description'):
            text = getattr(record, name)
            if not text:
                continue
            for mention in credential_mentions(text):
                credentials.append(ProjectedCredential(
                    _span(text, f'educations[{index}].{name}', mention.start, mention.end),
                    record.id, mention.credential))
    return SourceProjection(VERSION, digest, reference_date, tuple(roles),
                            issues=tuple(issues), credentials=tuple(credentials))


_REQUIRED = re.compile(r'\b(?:required|mandatory|must)\b', re.I)
_PREFERRED = re.compile(r'\b(?:preferred|optional|desirable|bonus)\b|\ba plus\b', re.I)
_COMPLEX = re.compile(r'\bor\b|\bequivalen\w*\b|\beither\b|\band/or\b', re.I)
_NEGATION = re.compile(r"\b(?:not|no|without|unnecessary|unneeded)\b|\b\w+n['’]t\b", re.I)


def project_job(job: JobMatchingSnapshot, *, expected_sha256, reference_date):
    """Preserve clauses with conservative flags, not a logical requirement parser.

    Alternatives are retained whole as unresolved. HTML needs a separately tested
    offset-preserving parser; for now a tagged field is one unresolved source unit.
    Heading priority is never propagated into following text.
    """
    _reference(reference_date)
    if not isinstance(job, JobMatchingSnapshot):
        raise ValueError('validated job snapshot required')
    digest = snapshot_digest(job)
    if digest != expected_sha256:
        raise ValueError('snapshot digest mismatch')
    clauses = []
    fields = [('requirements', job.requirements)]
    fields.extend((f'skills[{index}]', text) for index, text in enumerate(job.skills))
    if not any(text.strip() for _, text in fields):
        fields = [('description', job.description)]
    for path, text in fields:
        html = bool(re.search(r'<[^>]+>', text))
        units = [(0, len(text))] if html else [(m.start(), m.end())
                    for m in re.finditer(r'[^\r\n]+', text)]
        for start, end in units:
            quote = text[start:end]
            if not quote.strip():
                continue
            reasons = []
            if html:
                reasons.append('html_structure_unresolved')
            if ':' in quote:
                reasons.append('heading_or_scope_attachment_unresolved')
            if _NEGATION.search(quote):
                reasons.append('negation_attachment_unresolved')
            required, preferred = bool(_REQUIRED.search(quote)), bool(_PREFERRED.search(quote))
            if required and preferred:
                reasons.append('mixed_priority')
            complex_condition = bool(_COMPLEX.search(quote))
            if complex_condition:
                reasons.append('alternative_or_equivalence_unresolved')
            priority = ('unknown' if reasons else 'required' if required else
                        'preferred' if preferred else 'unspecified')
            clauses.append(RequirementClause(_span(text, path, start, end), priority,
                'unresolved' if complex_condition or reasons else 'unparsed_clause', tuple(reasons)))
    return SourceProjection(VERSION, digest, reference_date, clauses=tuple(clauses))
