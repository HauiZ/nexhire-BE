"""Public JD projection and local M1 ranking for candidate recommendations."""

import hashlib
import json
import re
from typing import Annotated
from uuid import UUID

import numpy as np
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.matching.normalizer import normalize_semantic_text

POLICY = 'm1-requirements-192-v1'
DIMENSION = 384
MAX_JOBS = 100
MAX_REQUIREMENTS = 8
MAX_QUOTE = 600
MAX_TOKENS = 192
MAX_TITLE = 255
MAX_DESCRIPTION = 12000
MAX_REQUIREMENTS_TEXT = 8000
MAX_SKILLS = 50
MAX_SKILL = 80
SkillText = Annotated[str, Field(max_length=MAX_SKILL)]
_HTML_TAG = r'</?[A-Za-z][^>]*>'


class PublicJob(BaseModel):
    id: UUID
    title: str = Field(max_length=MAX_TITLE)
    description: str = Field(max_length=MAX_DESCRIPTION)
    requirements: str = Field(max_length=MAX_REQUIREMENTS_TEXT)
    skills: list[SkillText] = Field(max_length=MAX_SKILLS)
    publishedAt: AwareDatetime

    @field_validator('title')
    @classmethod
    def title_is_present(cls, value):
        if not value.strip():
            raise ValueError('Job title required')
        return value

    def chunks(self) -> tuple[str, ...]:
        """Keep the excerpts as contiguous text from the submitted public JD."""
        title = self.title.strip()
        requirements = self.requirements.strip()
        if requirements or any(self.skills):
            pieces = [
                *re.split(r'[\r\n]+|' + _HTML_TAG, requirements),
                *self.skills,
            ]
        else:
            pieces = re.split(r'[\r\n]+|(?<=[.!?])\s+|' + _HTML_TAG, self.description)
        seen = set()
        selected = []
        for piece in pieces:
            quote = piece.strip()[:MAX_QUOTE].rstrip()
            normalized = normalize_semantic_text(quote)
            if normalized and normalized not in seen:
                seen.add(normalized)
                selected.append(quote)
                if len(selected) == MAX_REQUIREMENTS:
                    break
        return (title, *selected)

    def embedding_key(self) -> tuple[UUID, str]:
        body = json.dumps(self.chunks(), ensure_ascii=False, separators=(',', ':'))
        return self.id, hashlib.sha256(body.encode()).hexdigest()


class CvSection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    source: str = Field(min_length=1, max_length=50)
    text: str = Field(max_length=4000)


class RecommendationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    limit: int = Field(ge=1, le=20, strict=True)
    sections: list[CvSection] = Field(max_length=12)
    jobs: list[PublicJob] = Field(max_length=MAX_JOBS)

    @model_validator(mode='after')
    def unique_jobs(self):
        if len({job.id for job in self.jobs}) != len(self.jobs):
            raise ValueError('Duplicate job ID')
        return self


def unique_sections(sections: list[CvSection]) -> list[tuple[str, str]]:
    output = []
    seen = set()
    for section in sorted(sections, key=lambda item: item.source != 'HEADLINE'):
        quote = section.text.strip()[:MAX_QUOTE].rstrip()
        key = normalize_semantic_text(quote)
        if key and key not in seen:
            seen.add(key)
            output.append((section.source, quote))
    return output


def embed_texts(runtime, texts: list[str]) -> np.ndarray:
    """Use the WP07 token budget without mutating the encoder shared with M1."""
    normalized = [normalize_semantic_text(text) for text in texts]
    tokenizer = runtime.model.tokenizer
    offsets = tokenizer(
        normalized, return_offsets_mapping=True, truncation=True, max_length=MAX_TOKENS,
        padding=False, verbose=False,
    )['offset_mapping']
    inputs = [text[:max(end for _, end in spans)] for text, spans in zip(normalized, offsets, strict=True)]
    vectors = np.asarray(runtime.model.encode(
        inputs, batch_size=16, normalize_embeddings=True, show_progress_bar=False,
    ), dtype=np.float32)
    if vectors.shape != (len(inputs), DIMENSION) or not np.isfinite(vectors).all():
        raise ValueError('Invalid local recommendation vectors')
    return vectors


def rank_jobs(jobs, stored, sections, cv_vectors, limit):
    """Calculate cosine over cached vectors and keep citations on the scored inputs."""
    scored = []
    for job in jobs:
        flattened = stored.get(job.embedding_key())
        if flattened is None:
            continue
        chunks = job.chunks()
        vectors = np.asarray(flattened, dtype=np.float32).reshape(len(chunks), DIMENSION)
        similarities = np.clip(vectors @ cv_vectors.T, -1, 1)
        if not np.isfinite(similarities).all():
            raise ValueError('Invalid stored recommendation vectors')
        if len(chunks) > 1:
            best_indices = similarities[1:].argmax(axis=1)
            matches = [
                (float(similarities[index + 1, cv_index]), index + 1, int(cv_index))
                for index, cv_index in enumerate(best_indices)
            ]
            score = 0.8 * (sum(match[0] for match in matches) / len(matches)) + 0.2 * float(similarities[0, 0])
        else:
            score = float(similarities[0, 0])
            matches = [(score, 0, 0)]
        reasons = []
        for _, chunk, cv in sorted(matches, key=lambda value: (-value[0], value[1]))[:2]:
            reasons.append({'cvSource': sections[cv][0], 'cvText': sections[cv][1], 'jobText': chunks[chunk]})
        scored.append((job, score, reasons))
    scored.sort(key=lambda value: (-value[1], -value[0].publishedAt.timestamp(), str(value[0].id)))
    return [
        {'jobId': str(job.id), 'score': score, 'reasons': reasons}
        for job, score, reasons in scored[:limit]
    ]
