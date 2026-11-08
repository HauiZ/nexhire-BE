"""Versioned source/query plan. Does not reinterpret any v1 document or IDs."""
from typing import Literal

from pydantic import Field

from app.schemas.jd_plan import (
    Approval, ImmutableModel, PlanComponent, content_digest, snapshot_digest,
    source_blocks,
)
from app.schemas.jd_sections import suggest_job_sections


class SourceSelection(ImmutableModel):
    source_id: str
    source_field: Literal['skills', 'requirements', 'description', 'benefits']
    original_text: str
    suggested_role: Literal['heading', 'query', 'review']
    selected: bool = Field(strict=True)
    components: tuple[PlanComponent, ...] = Field(default=(), max_length=8)


class JobQueryPlan(ImmutableModel):
    schema_version: Literal['jd-source-query-v2'] = 'jd-source-query-v2'
    job_id: str
    job_snapshot_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    revision: int = Field(ge=1, strict=True)
    sources: tuple[SourceSelection, ...] = Field(min_length=1, max_length=256)
    approval: Approval | None = None


def _sources(job):
    for item in suggest_job_sections(job):
        suffix = str(item.source_item) if item.source_field == 'skills' else str(item.block.index)
        yield f'v2/{item.source_field}/{suffix}', item


def validate_query_plan(plan: JobQueryPlan, job) -> JobQueryPlan:
    if plan.job_id != job.id or plan.job_snapshot_sha256 != snapshot_digest(job):
        raise ValueError('JD snapshot changed; confirm a new plan revision')
    expected = [(sid, item.source_field, item.block.text, item.block.role)
                for sid, item in _sources(job)]
    actual = [(s.source_id, s.source_field, s.original_text, s.suggested_role) for s in plan.sources]
    if actual != expected:
        raise ValueError('Preserve every v2 source, role and field exactly once in order')
    count = 0
    for source in plan.sources:
        if source.selected != bool(source.components):
            raise ValueError('Selected sources need components; unselected sources must have none')
        ids = [c.id for c in source.components]
        queries = [c.query for c in source.components]
        if len(set(ids)) != len(ids) or len(set(queries)) != len(queries):
            raise ValueError('Unique component IDs and queries required per source')
        for component in source.components:
            if (not component.query.strip() or component.query != component.source_quote
                    or component.query not in source.original_text
                    or source_blocks(component.query) != [component.query]):
                raise ValueError('V2 query must be an exact single-block source quote')
        count += len(source.components)
    if not 1 <= count <= 64:
        raise ValueError('Select between 1 and 64 source-bound queries')
    if plan.approval:
        a = plan.approval
        if (a.job_id != job.id or a.content_sha256 != content_digest(plan)
                or not a.reviewer_id.strip() or not a.authorization_event_id.strip()
                or a.approved_at.utcoffset() is None):
            raise ValueError('Approval must bind exact v2 content and timezone-aware HR event')
    return plan


def draft_query_plan(job, *, revision=1) -> JobQueryPlan:
    sources = []
    for sid, item in _sources(job):
        b = item.block
        components = (PlanComponent(id='whole', query=b.text, source_quote=b.text,
                                   importance=b.importance),) if item.selected_for_retrieval else ()
        sources.append(SourceSelection(source_id=sid, source_field=item.source_field,
            original_text=b.text, suggested_role=b.role,
            selected=item.selected_for_retrieval, components=components))
    return validate_query_plan(JobQueryPlan(job_id=job.id,
        job_snapshot_sha256=snapshot_digest(job), revision=revision, sources=tuple(sources)), job)
