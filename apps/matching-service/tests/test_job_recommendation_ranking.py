from datetime import datetime, timezone
from uuid import UUID

import numpy as np
from pydantic import ValidationError
import pytest

from app.recommendations.ranking import (
    DIMENSION,
    PublicJob,
    RecommendationRequest,
    rank_jobs,
    unique_sections,
)


def job(identity, requirements, published=1):
    return PublicJob(id=UUID(int=identity), title='Engineering', description='', requirements=requirements,
                     skills=[], publishedAt=datetime(2026, 11, published, tzinfo=timezone.utc))


def test_rank_combines_requirement_and_title_cosine_and_keeps_source_quotes():
    candidate = np.eye(DIMENSION, dtype=np.float32)[:2]
    title_and_relevant_requirement = np.eye(DIMENSION, dtype=np.float32)[[2, 1]]
    title_and_unrelated_requirement = np.eye(DIMENSION, dtype=np.float32)[[0, 2]]
    recommended = job(1, '<p>Troubleshoot production infrastructure</p>')
    keyword_decoy = job(2, 'Document operations')
    cache = {
        recommended.embedding_key(): title_and_relevant_requirement.ravel(),
        keyword_decoy.embedding_key(): title_and_unrelated_requirement.ravel(),
    }
    sections = [('HEADLINE', 'Engineer'), ('EXPERIENCE', 'Debugged the infrastructure')]

    result = rank_jobs([keyword_decoy, recommended], cache, sections, candidate, 2)

    assert [row['jobId'] for row in result] == [str(recommended.id), str(keyword_decoy.id)]
    assert [row['score'] for row in result] == pytest.approx([0.8, 0.2])
    assert result[0]['reasons'] == [{
        'cvSource': 'EXPERIENCE', 'cvText': 'Debugged the infrastructure',
        'jobText': 'Troubleshoot production infrastructure',
    }]


def test_stale_index_is_skipped_and_equal_scores_use_newest_publication_first():
    old_projection = job(1, 'Old description')
    changed_job = job(1, 'New description')
    older = job(2, 'One requirement')
    newer = job(3, 'Another requirement', published=2)
    vectors = np.eye(DIMENSION, dtype=np.float32)[:2]
    cache = {row.embedding_key(): vectors.ravel() for row in [old_projection, older, newer]}

    result = rank_jobs([older, changed_job, newer], cache, [('HEADLINE', 'CV')], vectors[:1], 3)

    assert [row['jobId'] for row in result] == [str(newer.id), str(older.id)]


def test_request_deduplicates_cv_excerpts_and_rejects_duplicate_job_ids():
    sections = [{'source': 'SKILLS', 'text': ' DEVOPS '}, {'source': 'HEADLINE', 'text': 'DevOps'}]
    published = job(1, 'Delivery')
    request = RecommendationRequest(limit=1, sections=sections, jobs=[published])

    assert unique_sections(request.sections) == [('HEADLINE', 'DevOps')]
    with pytest.raises(ValidationError, match='Duplicate job ID'):
        RecommendationRequest(limit=1, sections=sections, jobs=[published, published])
