"""Source composition of existing Top3 retrieval, not duty entailment or tenure.

A source absent from Top3 is retrieval-censored, not absent from the CV. These
signals depend on AI1 and must be removed together in no-AI1 ablations.
"""

from dataclasses import dataclass
import math

from app.ranking.semantic_features import summarize_semantics


@dataclass(frozen=True)
class EvidenceSourceFeatures:
    experience_best_mean: float | None
    project_best_mean: float | None
    experience_top1_fraction: float | None
    project_top1_fraction: float | None
    experience_missing_from_top3_fraction: float | None
    project_missing_from_top3_fraction: float | None
    requirement_count: int
    experience_observed_requirements: int
    project_observed_requirements: int


def summarize_evidence_sources(assessment, job, candidate, *, model_version,
                               weights_sha256, manifest_sha256):
    """Validate full assessment binding before aggregating whole requirements.

    Mean of best observed score by source, not all-source similarity recomputation.
    Missing means remain None. Denominators include every original requirement;
    n=0 gives undefined fractions. HR components never add observations.
    Record/source IDs remain in the original bound assessment, not inferred dates.
    """
    summarize_semantics(assessment, job, candidate, model_version=model_version,
        weights_sha256=weights_sha256, manifest_sha256=manifest_sha256)
    count = len(assessment.requirements)
    values = {'experience': [], 'project': []}
    first = {'experience': 0, 'project': 0}
    for requirement in assessment.requirements:
        hits = requirement.evidence
        if hits and hits[0].source in first:
            first[hits[0].source] += 1
        for source in values:
            observed = [hit.similarityScore / 100 for hit in hits if hit.source == source]
            if observed:
                values[source].append(max(observed))
    def mean(source):
        observed = values[source]
        return math.fsum(observed) / len(observed) if observed else None
    def fraction(number):
        return number / count if count else None
    return EvidenceSourceFeatures(mean('experience'), mean('project'),
        fraction(first['experience']), fraction(first['project']),
        fraction(count - len(values['experience'])), fraction(count - len(values['project'])),
        count, len(values['experience']), len(values['project']))
