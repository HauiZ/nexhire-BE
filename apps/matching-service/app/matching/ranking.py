"""Offline benchmark rankers and artifact contracts; no runtime AI2 is available."""

import json
import math
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, model_validator


FEATURE_SCHEMA_VERSION = "candidate-job-v2"
FEATURE_EXTRACTOR_VERSION = "heuristic-features-v2"
FEATURE_NAMES = (
    "semantic_score", "skill_score", "experience_score", "education_score",
    "project_score", "certification_score", "location_score", "level_score",
)


class RankingFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    semantic_score: float = Field(ge=0, le=100)
    skill_score: float = Field(ge=0, le=100)
    experience_score: float = Field(ge=0, le=100)
    education_score: float = Field(ge=0, le=100)
    project_score: float = Field(ge=0, le=100)
    certification_score: float = Field(ge=0, le=100)
    location_score: float = Field(ge=0, le=100)
    level_score: float = Field(ge=0, le=100)

    def vector(self) -> list[float]:
        return [getattr(self, name) / 100 for name in FEATURE_NAMES]


class Ranker(Protocol):
    model_version: str

    def score(self, features: RankingFeatures, *, has_projects: bool) -> float: ...


class WeightedRanker:
    model_version = "weighted-baseline-v1"

    def score(self, features: RankingFeatures, *, has_projects: bool) -> float:
        weights = (
            (0.20, 0.30, 0.20, 0.10, 0.10, 0, 0.05, 0.05)
            if has_projects else
            (0.20, 0.30, 0.25, 0.10, 0, 0, 0.075, 0.075)
        )
        return round(sum(value * weight for value, weight in zip(features.vector(), weights)) * 100, 2)


class LogisticArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    algorithm: Literal["logistic_regression"]
    model_version: str = Field(min_length=1)
    feature_schema_version: Literal["candidate-job-v2"]
    preprocessing_version: Literal["matching-text-v2"]
    feature_extractor_version: Literal["heuristic-features-v2"]
    feature_names: list[str]
    coefficients: list[float]
    intercept: float
    dataset_version: str = Field(min_length=1)
    semantic_model_version: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_features(self):
        if self.feature_names != list(FEATURE_NAMES) or len(self.coefficients) != len(FEATURE_NAMES):
            raise ValueError("Ranking artifact must use the exact candidate-job-v2 feature order")
        return self


class LogisticRanker:
    def __init__(self, artifact: LogisticArtifact):
        self.artifact = artifact
        self.model_version = artifact.model_version

    def score(self, features: RankingFeatures, *, has_projects: bool) -> float:
        logit = self.artifact.intercept + sum(
            coefficient * value for coefficient, value in zip(self.artifact.coefficients, features.vector())
        )
        probability = 1 / (1 + math.exp(-logit)) if logit >= 0 else math.exp(logit) / (1 + math.exp(logit))
        return round(probability * 100, 2)


def load_ranker(artifact_path: str | None) -> Ranker:
    if not artifact_path:
        return WeightedRanker()
    artifact = LogisticArtifact.model_validate(json.loads(Path(artifact_path).read_text(encoding="utf-8")))
    return LogisticRanker(artifact)
