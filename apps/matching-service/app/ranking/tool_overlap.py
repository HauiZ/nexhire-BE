"""Experimental literal tool overlap, not mandatory skill or competence coverage."""

from dataclasses import dataclass
from hashlib import sha256
import json
import re

from app.ranking.source_extractor import Anchor, extract_tools
from app.schemas.jd_plan import snapshot_digest
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot

VERSION = 'ai2-tool-overlap-draft-v1'


@dataclass(frozen=True)
class ToolObservation:
    snapshot_sha256: str
    record_kind: str
    record_index: int | None
    anchors: tuple[Anchor, ...]


@dataclass(frozen=True)
class ToolOverlap:
    version: str
    vocabulary_sha256: str
    job_snapshot_sha256: str
    candidate_snapshot_sha256: str
    job_concepts: tuple[str, ...]
    shared_skill_profile: tuple[str, ...]
    shared_employment: tuple[str, ...]
    shared_project: tuple[str, ...]
    skill_profile_overlap: float | None
    employment_overlap: float | None
    project_overlap: float | None
    any_source_overlap: float | None
    observations: tuple[ToolObservation, ...]
    issues: tuple[str, ...]


def extract_tool_overlap(job, candidate, *, vocabulary, job_sha256, candidate_sha256):
    """Use source-local literal mentions with exact hashes and original offsets.

    Unknown aliases/negation are excluded, not interpreted as absent competence.
    All ratios are conditional on recognized JD vocabulary only. Explicit negative
    candidate wording can still be unknown even if another field is positive;
    observations preserve the conflict rather than establish satisfaction.
    """
    if not isinstance(job, JobMatchingSnapshot) or not isinstance(candidate, CandidateMatchingSnapshot):
        raise ValueError('validated snapshots required')
    if snapshot_digest(job) != job_sha256 or snapshot_digest(candidate) != candidate_sha256:
        raise ValueError('snapshot digest mismatch')
    if (not isinstance(vocabulary, dict) or not vocabulary
            or any(not isinstance(k, str) or not k.strip() or not isinstance(v, list)
                   or any(not isinstance(alias, str) or not alias.strip() for alias in v)
                   for k, v in vocabulary.items())):
        raise ValueError('nonempty versioned literal vocabulary required')
    vocabulary_hash = sha256(json.dumps(vocabulary, sort_keys=True, ensure_ascii=False,
        separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()
    observations, issues = [], []

    def concepts(text, path, kind, index, digest):
        if not text or not text.strip():
            return set()
        if re.search(r'<[^>]+>', text):
            issues.append(path + ':html_unresolved')
            return set()
        result = extract_tools(text, path, vocabulary)
        # Extra broad scope guards: alias extraction alone does not parse logic.
        ambiguous = bool(re.search(r"\b(?:not|no|never|without|cannot|unnecessary|unneeded|or|equivalent)\b|\b\w+n['’]t\b", text, re.I))
        from dataclasses import replace
        anchors = tuple(replace(anchor, snapshot_hash=digest,
            unknown_reason=anchor.unknown_reason or ('field_scope_unresolved' if ambiguous else None))
            for anchor in result.anchors)
        observations.append(ToolObservation(digest, kind, index, anchors))
        if ambiguous and anchors:
            issues.append(path + ':field_scope_unresolved')
        return {a.normalized for a in anchors if isinstance(a.normalized, str)
                and a.unknown_reason is None and a.polarity == 'mention'}

    jd = set()
    fields = [('requirements', job.requirements)] + [(f'skills[{i}]', value) for i, value in enumerate(job.skills)]
    if not any(value.strip() for _, value in fields):
        fields = [('description', job.description)]
    for path, text in fields:
        jd.update(concepts(text, path, 'job', None, job_sha256))
    groups = {'skill_profile': set(), 'employment': set(), 'project': set()}
    for name in ('headline', 'summary'):
        groups['skill_profile'].update(concepts(getattr(candidate, name), name,
            'profile', None, candidate_sha256))
    for index, skill in enumerate(candidate.skills):
        groups['skill_profile'].update(concepts(skill.name, f'skills[{index}].name',
            'skill', index, candidate_sha256))
    for index, experience in enumerate(candidate.experiences):
        groups['employment'].update(concepts(experience.description,
            f'experiences[{index}].description', 'experience', index, candidate_sha256))
    for index, project in enumerate(candidate.projects):
        for name in ('name', 'description'):
            groups['project'].update(concepts(getattr(project, name),
                f'projects[{index}].{name}', 'project', index, candidate_sha256))
        for tech_index, text in enumerate(project.technologies):
            groups['project'].update(concepts(text, f'projects[{index}].technologies[{tech_index}]',
                'project', index, candidate_sha256))
    shared = {key: tuple(sorted(jd & value)) for key, value in groups.items()}
    # Abstentions must not turn into numeric absence. Conservatively mask all
    # ratios if any relevant field had unresolved source scope.
    uncertain = bool(issues) or any(a.unknown_reason for obs in observations for a in obs.anchors)
    available = {
        'skill_profile': bool((candidate.headline or '').strip())
            or bool((candidate.summary or '').strip())
            or any(skill.name.strip() for skill in candidate.skills),
        'employment': any((item.description or '').strip() for item in candidate.experiences),
        'project': any((item.name or '').strip() or (item.description or '').strip()
            or any(text.strip() for text in item.technologies) for item in candidate.projects),
    }
    ratios = {key: len(value) / len(jd) if jd and not uncertain and available[key] else None
              for key, value in shared.items()}
    total = set().union(*groups.values())
    all_sources_observed = all(available.values())
    union_ratio = (len(jd & total) / len(jd) if jd and not uncertain
                   and (all_sources_observed or jd <= total) else None)
    return ToolOverlap(VERSION, vocabulary_hash, job_sha256, candidate_sha256,
        tuple(sorted(jd)), shared['skill_profile'], shared['employment'], shared['project'],
        ratios['skill_profile'], ratios['employment'], ratios['project'],
        union_ratio, tuple(observations), tuple(issues))
