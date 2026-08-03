import logging
import math
from functools import lru_cache

from app.config import get_settings
from app.matching.normalizer import normalize_text
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot

logger = logging.getLogger(__name__)


def build_job_text(job: JobMatchingSnapshot) -> str:
    parts = [
        job.title,
        job.description,
        job.requirements,
        " ".join(job.skills),
        job.benefits,
        job.experienceLevel,
        job.workingType,
    ]
    return " ".join(part for part in parts if part).strip()


def build_candidate_text(candidate: CandidateMatchingSnapshot) -> str:
    experience_text = [
        " ".join(part for part in [item.title, item.company] if part)
        for item in candidate.experiences
    ]
    education_text = [
        " ".join(part for part in [item.degree, item.fieldOfStudy, item.school] if part)
        for item in candidate.educations
    ]
    project_text = [
        " ".join(
            part
            for part in [
                item.name,
                item.description,
                " ".join(item.technologies),
            ]
            if part
        )
        for item in candidate.projects
    ]
    parts = [
        candidate.headline,
        candidate.summary,
        " ".join(skill.name for skill in candidate.skills),
        " ".join(experience_text),
        " ".join(education_text),
        " ".join(candidate.certifications),
        " ".join(project_text),
    ]
    return " ".join(part for part in parts if part).strip()


class SemanticScorer:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._model = None
        self._load_failed = False
        self._using_lexical_fallback = False

    @property
    def enabled(self) -> bool:
        return self.settings.enable_semantic_scoring

    @property
    def model_version(self) -> str:
        if not self.enabled:
            return "semantic-disabled"
        if self._using_lexical_fallback:
            return "lexical-fallback"
        return f"sentence-transformers:{self.settings.embedding_model_name}"

    def score(self, job: JobMatchingSnapshot, candidate: CandidateMatchingSnapshot) -> float | None:
        if not self.enabled:
            return None

        job_text = normalize_text(build_job_text(job))
        candidate_text = normalize_text(build_candidate_text(candidate))
        return self.score_text_pair(job_text, candidate_text)

    def score_text_pair(self, left: str, right: str) -> float | None:
        if not self.enabled:
            return None

        job_text = normalize_text(left)
        candidate_text = normalize_text(right)
        if not job_text or not candidate_text:
            return None

        model = self._get_model()
        if model is None:
            self._using_lexical_fallback = True
            return self._lexical_semantic_score(job_text, candidate_text)

        embeddings = model.encode([job_text, candidate_text], normalize_embeddings=True)
        similarity = float(sum(a * b for a, b in zip(embeddings[0], embeddings[1])))
        return self._similarity_to_score(similarity)

    def _get_model(self):
        if self._model is not None:
            return self._model
        if self._load_failed:
            return None

        try:
            self._model = load_sentence_transformer(self.settings.embedding_model_name)
            logger.info("Loaded semantic matching model %s", self.settings.embedding_model_name)
            return self._model
        except Exception as error:
            self._load_failed = True
            logger.warning(
                "Semantic model unavailable, falling back to lexical scoring: %s",
                error,
            )
            return None

    def _lexical_semantic_score(self, job_text: str, candidate_text: str) -> float:
        job_terms = set(job_text.split())
        candidate_terms = set(candidate_text.split())
        if not job_terms or not candidate_terms:
            return 0
        overlap = len(job_terms & candidate_terms) / math.sqrt(len(job_terms) * len(candidate_terms))
        if overlap < self.settings.semantic_min_signal:
            return round(overlap / self.settings.semantic_min_signal * 60, 2)
        return round(min(100, 60 + ((overlap - self.settings.semantic_min_signal) / 0.65) * 40), 2)

    def _similarity_to_score(self, similarity: float) -> float:
        clipped = max(-1, min(1, similarity))
        score = ((clipped + 1) / 2) * 100
        return round(max(0, min(100, score)), 2)


@lru_cache
def load_sentence_transformer(model_name: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)
