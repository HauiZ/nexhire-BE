"""Scoped experimental signals, not full-rubric professional fit assessment."""

from dataclasses import asdict, dataclass
from hashlib import sha256
import json

from app.ranking.semantic_features import summarize_semantics
from app.schemas.jd_plan import snapshot_digest
from ml.ai2.timeline import summarize_timeline

SCHEMA_VERSION = 'candidate-job-observed-v1'
EXTRACTOR_VERSION = 'ai2-observed-v1'
FEATURE_NAMES = ('semantic_mean_top1', 'semantic_min_top1',
                 'semantic_no_evidence_fraction', 'chronology_known_months',
                 'chronology_incomplete')
AI1_FEATURE_NAMES = FEATURE_NAMES[:3]


@dataclass(frozen=True)
class ObservedFeatures:
    schema_version: str
    extractor_version: str
    job_id: str
    candidate_id: str
    job_snapshot_sha256: str
    candidate_snapshot_sha256: str
    reference_date: str
    model_version: str
    weights_sha256: str
    manifest_sha256: str
    values: tuple[float | None, ...]
    semantic_expected_count: int
    semantic_observed_count: int
    truncated_texts: int
    timeline_issues: tuple[tuple[int, str], ...]

    def numeric_row(self):
        return dict(zip(FEATURE_NAMES, self.values))

    def content_sha256(self):
        return sha256(json.dumps(asdict(self), ensure_ascii=False, sort_keys=True,
            separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def extract_observed_features(assessment, job, candidate, *, reference_date,
                              model_version, weights_sha256, manifest_sha256):
    """Shared offline/online pure assembly; strict AI1 availability/provenance.

    Chronology from structured dates is not reinterpreted as scoped duty tenure.
    Counts/truncation/issues retained as diagnostics only, not vector features.
    No source-review judgments, labels or legacy scores accepted as arguments.
    """
    semantic = summarize_semantics(assessment, job, candidate,
        model_version=model_version, weights_sha256=weights_sha256,
        manifest_sha256=manifest_sha256)
    timeline = summarize_timeline([item.model_dump(mode='json')
                                  for item in candidate.experiences], reference_date)
    return ObservedFeatures(SCHEMA_VERSION, EXTRACTOR_VERSION, job.id,
        candidate.candidateId, snapshot_digest(job), snapshot_digest(candidate),
        reference_date, model_version, weights_sha256, manifest_sha256,
        (semantic.mean_top1, semantic.min_top1, semantic.no_evidence_fraction,
         float(timeline.known_months) if timeline.known_months is not None else None,
         float(not timeline.complete)),
        semantic.expected_count, semantic.observed_count, semantic.truncated_texts,
        timeline.issues)
