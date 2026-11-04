"""Seven experimental signals; source composition is not requirement support."""

from dataclasses import asdict, dataclass
from hashlib import sha256
import json

from app.ranking.observed_features import (
    FEATURE_NAMES as V1_FEATURE_NAMES,
    AI1_FEATURE_NAMES as V1_AI1_FEATURE_NAMES,
    ObservedFeatures,
    extract_observed_features,
)
from app.ranking.evidence_source_features import summarize_evidence_sources

SCHEMA_VERSION = 'candidate-job-source-v2'
EXTRACTOR_VERSION = 'ai2-source-composition-v2'
SOURCE_FEATURE_NAMES = ('experience_top1_fraction', 'experience_missing_from_top3_fraction')
FEATURE_NAMES = V1_FEATURE_NAMES + SOURCE_FEATURE_NAMES
AI1_FEATURE_NAMES = V1_AI1_FEATURE_NAMES + SOURCE_FEATURE_NAMES


@dataclass(frozen=True)
class SourceFeatures:
    schema_version: str
    extractor_version: str
    base: ObservedFeatures
    experience_top1_fraction: float | None
    experience_missing_from_top3_fraction: float | None

    def numeric_row(self):
        return {**self.base.numeric_row(),
                'experience_top1_fraction': self.experience_top1_fraction,
                'experience_missing_from_top3_fraction': self.experience_missing_from_top3_fraction}

    def content_sha256(self):
        return sha256(json.dumps(asdict(self), ensure_ascii=False, sort_keys=True,
            separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def extract_source_features(assessment, job, candidate, *, reference_date,
                            model_version, weights_sha256, manifest_sha256):
    """Assemble versioned features using unchanged whole-requirement retrieval.

    Ratios describe which source appears in bounded Top3, not how many requirements
    a candidate meets. No labels, role tenure or reviewer judgments are accepted.
    Missing source from retrieval is not absence from CV. Empty job denominators
    yield None, unavailable/mismatched assessments fail closed.
    """
    pins = dict(model_version=model_version, weights_sha256=weights_sha256,
                manifest_sha256=manifest_sha256)
    base = extract_observed_features(assessment, job, candidate,
                                     reference_date=reference_date, **pins)
    sources = summarize_evidence_sources(assessment, job, candidate, **pins)
    return SourceFeatures(SCHEMA_VERSION, EXTRACTOR_VERSION, base,
        sources.experience_top1_fraction, sources.experience_missing_from_top3_fraction)
