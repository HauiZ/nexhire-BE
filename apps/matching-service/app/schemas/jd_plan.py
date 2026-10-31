"""Model-free service contract; frozen experimental implementations stay untouched.

Compatibility tests pin source IDs, serialized plans and hashes to the original
shadow prototype without making production import experimental model runtimes.
"""

from datetime import datetime
import hashlib
from html.parser import HTMLParser
import json
import re
from typing import Literal, NamedTuple

from pydantic import BaseModel, ConfigDict, Field


class ImmutableModel(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)


class PlanComponent(ImmutableModel):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    query: str = Field(min_length=1, max_length=5000)
    source_quote: str = Field(min_length=1, max_length=5000)
    importance: Literal['core', 'supplementary', 'preferred', 'unknown']


class PlannedRequirement(ImmutableModel):
    requirement_id: str
    original_text: str
    components: tuple[PlanComponent, ...] = Field(min_length=1, max_length=8)
    all_of: tuple[tuple[str, ...], ...] = Field(min_length=1, max_length=8)
    joint_context_required: bool


class Approval(ImmutableModel):
    origin: Literal['authenticated_hr', 'assistant_offline']
    reviewer_id: str = Field(min_length=1)
    authorization_event_id: str = Field(min_length=1)
    job_id: str
    content_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    approved_at: datetime


class JobRequirementPlan(ImmutableModel):
    schema_version: Literal['jd-fixed-requirements-v1'] = 'jd-fixed-requirements-v1'
    job_id: str
    job_snapshot_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    revision: int = Field(ge=1, strict=True)
    requirements: tuple[PlannedRequirement, ...] = Field(min_length=1, max_length=64)
    approval: Approval | None = None


class _SourceBlocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}:
            self.hidden_depth += 1
        if tag in {'br', 'li', 'p', 'div', 'ul', 'ol'}:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in {'script', 'style'}:
            self.hidden_depth = max(0, self.hidden_depth - 1)
        if tag in {'li', 'p', 'div', 'ul', 'ol'}:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden_depth:
            self.parts.append(data)


_TECH_PATTERNS = [
    r'\b[a-zA-Z0-9_-]+\.(?:js|ts|io|ai|net|org|com)\b',
    r'(?:\bASP\.NET|\.NET|\bVB\.NET)(?:\s+Core)?(?:\s+\d+(?:\.\d+)*)?',
    r'\b[vV]?\d+(?:\.\d+)+\+?\b',
    r'\b\d+\.\d+\b',
]
_ABBR_PATTERNS = [
    r'\b(?:e\.g\.|i\.e\.|vs\.|approx\.|dept\.|inc\.|corp\.|ltd\.|sr\.|jr\.|dr\.|mr\.|ms\.|prof\.)',
    r'\b(?:tp\.|tp\.hcm|th\.s|ts\.|pgs\.|gs\.|\u0111/h|cty\.|tnhh|cntt)\b',
]
_PROT_REGEX = re.compile('|'.join(f'(?:{p})' for p in _TECH_PATTERNS + _ABBR_PATTERNS), re.IGNORECASE)
_INTERNAL_BOUNDARY_REGEX = re.compile(r'([.!?\u2026]+)\s+(?=[A-Z\u00c0-\u1ef8\d\(\"\'])')


def _split_prose_sentences(line: str) -> list[str]:
    masked = _PROT_REGEX.sub(lambda m: m.group(0).replace('.', '\ue000'), line)
    masked = re.sub(r'\([^)]*\)', lambda m: m.group(0).replace('.', '\ue000'), masked)
    if not _INTERNAL_BOUNDARY_REGEX.search(masked):
        return [line.strip()]
    parts = []
    last = 0
    for m in _INTERNAL_BOUNDARY_REGEX.finditer(masked):
        end_idx = m.start(1) + len(m.group(1))
        part = masked[last:end_idx].strip()
        if part:
            parts.append(part.replace('\ue000', '.'))
        last = m.end()
    if last < len(masked) and masked[last:].strip():
        parts.append(masked[last:].strip().replace('\ue000', '.'))
    return parts


def source_blocks(text):
    parser = _SourceBlocks()
    parser.feed(text)
    parser.close()
    result = []
    for line in ''.join(parser.parts).splitlines():
        value = re.sub(r'^\s*(?:[-*\u2022]|\d+[.)])\s+', '', line).strip()
        if value:
            for sent in _split_prose_sentences(value):
                if sent:
                    result.append(sent)
    return result


class _SourceRequirement(NamedTuple):
    id: str
    text: str


def source_requirements(job):
    result = [_SourceRequirement(f'skills/{i}', text.strip())
              for i, text in enumerate(job.skills) if text.strip()]
    result.extend(_SourceRequirement(f'requirements/{i}', text)
                  for i, text in enumerate(source_blocks(job.requirements)))
    if not result:
        result = [_SourceRequirement(f'description/{i}', text)
                  for i, text in enumerate(source_blocks(job.description))]
    return result


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def snapshot_digest(job):
    return digest(job.model_dump(mode='json'))


def content_digest(plan):
    return digest(plan.model_dump(mode='json', exclude={'approval'}))


def validate_plan(plan, job):
    if plan.job_id != job.id or plan.job_snapshot_sha256 != snapshot_digest(job):
        raise ValueError('JD snapshot changed; confirm a new plan revision')
    if [(r.requirement_id, r.original_text) for r in plan.requirements] != [(r.id, r.text) for r in source_requirements(job)]:
        raise ValueError('Every original requirement must remain exactly once in source order')
    for requirement in plan.requirements:
        ids = [c.id for c in requirement.components]
        queries = [c.query for c in requirement.components]
        if len(set(ids)) != len(ids) or len(set(queries)) != len(queries):
            raise ValueError('Unique component IDs and queries required within each requirement')
        groups = requirement.all_of
        if (any(not g or len(set(g)) != len(g) or not set(g) <= set(ids) for g in groups)
                or {i for g in groups for i in g} != set(ids)
                or len({frozenset(g) for g in groups}) != len(groups)):
            raise ValueError('Explicit AND groups of declared OR alternatives must use every component')
        for component in requirement.components:
            if (not component.query.strip() or source_blocks(component.query) != [component.query]
                    or not component.source_quote.strip() or component.source_quote not in requirement.original_text):
                raise ValueError('Literal bounded query and exact original JD quote required')
    if plan.approval:
        approval = plan.approval
        if (approval.job_id != job.id or approval.content_sha256 != content_digest(plan)
                or not approval.reviewer_id.strip() or not approval.authorization_event_id.strip()
                or approval.approved_at.utcoffset() is None):
            raise ValueError('Approval must bind exact plan content, job and timezone-aware event')
    return plan


def draft_plan(job, *, revision=1):
    requirements = tuple(PlannedRequirement(requirement_id=r.id, original_text=r.text,
        components=(PlanComponent(id='whole', query=r.text, source_quote=r.text, importance='unknown'),),
        all_of=(('whole',),), joint_context_required=False) for r in source_requirements(job))
    return validate_plan(JobRequirementPlan(job_id=job.id, job_snapshot_sha256=snapshot_digest(job),
        revision=revision, requirements=requirements), job)
