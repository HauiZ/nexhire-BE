"""Source-preserving JD section suggestions; deliberately separate from v1 plans.

Only standalone aliases or explicit colon-delimited prefixes are headings.
Unknown content stays visible; review sections are suggestions, never deletions.
"""
from dataclasses import dataclass
from html.parser import HTMLParser
import re
import unicodedata
from typing import Literal

Section = Literal['general', 'required', 'preferred', 'duties', 'review']

_ALIASES: dict[Section, tuple[str, ...]] = {
    'general': ('requirements', 'qualifications', 'skills and experience',
                'who you are', 'who should apply', 'yêu cầu', 'yêu cầu ứng viên',
                'yêu cầu công việc', 'kỹ năng và kinh nghiệm'),
    'required': ('required', 'required qualifications', 'must have', 'must-have',
                 'minimum requirements', 'minimum qualifications', 'yêu cầu bắt buộc'),
    'preferred': ('preferred', 'preferred qualifications', 'nice to have', 'nice-to-have',
                  'desirable', 'ưu tiên', 'điểm cộng'),
    'duties': ('responsibilities', 'key responsibilities', 'what you’ll do',
               "what you'll do", 'job responsibilities', 'mô tả công việc', 'nhiệm vụ'),
    'review': ('benefits', 'compensation & benefits', 'compensation and benefits',
               'benefits and culture', 'quyền lợi', 'phúc lợi', 'about us',
               'company description', 'về công ty', 'about the company'),
}


def _key(value: str) -> str:
    return ' '.join(unicodedata.normalize('NFC', value).casefold().split())


_LOOKUP = {_key(alias): section for section, aliases in _ALIASES.items() for alias in aliases}


@dataclass(frozen=True)
class SectionBlock:
    index: int
    text: str
    role: Literal['heading', 'query', 'review']
    section: Section
    importance: Literal['core', 'preferred', 'unknown']
    heading_index: int | None


class _Blocks(HTMLParser):
    boundaries = {'br', 'li', 'p', 'div', 'ul', 'ol', 'section', 'tr', 'td', 'th',
                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}:
            self.hidden += 1
        if not self.hidden and tag in self.boundaries:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in {'script', 'style'}:
            self.hidden = max(0, self.hidden - 1)
        elif not self.hidden and tag in self.boundaries:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def suggest_sections(text: str) -> tuple[SectionBlock, ...]:
    """Return all visible text in order, including heading prefixes and review text.

    Indices belong to this suggestion only, not requirements/{i} v1 identities.
    No punctuation/sentence inference or splitting of concatenated words occurs.
    """
    parser = _Blocks()
    parser.feed(text)
    parser.close()
    result: list[SectionBlock] = []
    section: Section = 'general'
    heading_index = None
    for raw in ''.join(parser.parts).splitlines():
        line = re.sub(r'^\s*(?:[-*•]|\d+[.)])\s+', '', raw).strip()
        if not line:
            continue
        prefix, separator, rest = line.partition(':')
        # Recognize pasted Word/PDF heading markers without rewriting source
        # text or query quotes. Existing confirmed source bindings stay exact.
        heading_key = re.sub(r'^[▪◦●‣–—]\s+', '', prefix if separator else line)
        matched = _LOOKUP.get(_key(heading_key))
        if matched is not None:
            section = matched
            heading_index = len(result)
            # Preserve the delimiter so the prefix is still an exact visible substring.
            heading = prefix + separator if separator else line
            result.append(SectionBlock(len(result), heading, 'heading', section,
                                       'unknown', heading_index))
            line = rest.strip() if separator else ''
        if line:
            importance = 'core' if section == 'required' else 'preferred' if section == 'preferred' else 'unknown'
            result.append(SectionBlock(len(result), line,
                                       'review' if section == 'review' else 'query',
                                       section, importance, heading_index))
    return tuple(result)


@dataclass(frozen=True)
class JobSectionSuggestion:
    source_field: Literal['skills', 'requirements', 'description', 'benefits']
    source_item: int | None
    block: SectionBlock
    selected_for_retrieval: bool


def suggest_job_sections(job) -> tuple[JobSectionSuggestion, ...]:
    """Respect HR field boundaries before inferring context within free text.

    Skills are explicit labels, never interpreted as section headings. Benefits
    remain review-only regardless of heading-like content. Description is a
    fallback only when skills and requirements have no selected query. This is
    a separate proposal, not a replacement for source_requirements/v1 IDs.
    """
    result = []
    for i, skill in enumerate(job.skills):
        if skill.strip():
            result.append(JobSectionSuggestion('skills', i,
                SectionBlock(0, skill.strip(), 'query', 'general', 'unknown', None), True))
    for block in suggest_sections(job.requirements):
        result.append(JobSectionSuggestion('requirements', None, block, block.role == 'query'))
    use_description = not any(item.selected_for_retrieval for item in result)
    for block in suggest_sections(job.description):
        result.append(JobSectionSuggestion('description', None, block,
            use_description and block.role == 'query'))
    for block in suggest_sections(job.benefits or ''):
        result.append(JobSectionSuggestion('benefits', None, block, False))
    return tuple(result)
