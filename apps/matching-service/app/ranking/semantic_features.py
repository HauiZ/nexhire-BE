"""Pure AI1 retrieval diagnostics, not support probabilities or percent fit.

Top-1 values are shifted cosine, (cosine + 1) / 2, obtained as score/100.
Default primary features summarize actual M1 requirement observations.
Confirmed v2 queries contribute individually; this intentionally changes the
observation population, not the five numeric formulas. Source-balanced research
features remain separate from frozen-model inputs.
Unavailable/incompatible assessments fail closed, rather than producing zeros.
"""

from dataclasses import dataclass
import math

from app.matching.requirement_matcher import RequirementMatcher
from app.schemas.ai1 import Ai1Assessment
from app.schemas.jd_plan import snapshot_digest, source_requirements
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


class UnsupportedFeatureInput(ValueError):
    """A valid query plan changes the frozen whole-source observations."""


def query_bindings(assessment, job):
    """Validate saved HR source/query provenance without reinterpreting any IDs."""
    from app.schemas.jd_plan_v2 import validate_query_plan
    plan = assessment.fixedPlan
    if plan is None or plan.schema_version != 'jd-source-query-v2':
        raise ValueError('JD query v2 plan required')
    validate_query_plan(plan, job)
    if (assessment.planStatus != 'HR_CONFIRMED' or plan.approval is None
            or plan.approval.origin != 'authenticated_hr'):
        raise ValueError('Trusted HR-confirmed query plan required')
    bindings = [(s, c) for s in plan.sources if s.selected for c in s.components]
    if [(r.requirementId, r.text) for r in assessment.requirements] != [
            (f'{s.source_id}/{c.id}', c.query) for s, c in bindings]:
        raise ValueError('Complete query IDs/text/order must match saved plan')
    if any(r.components or r.allOf or r.jointContextRequired for r in assessment.requirements):
        raise ValueError('Unexpected nested query observations')
    return bindings


def feature_input_metadata(assessment, job):
    """Bind actual M1 query observations, not a claim of v1 score equivalence.

    Query selection/splitting is an intentional input-population shift. The frozen
    experimental XGBoost consumes unchanged mean/min/missing formulas over these
    observations; source-balanced research features never enter this path.
    """
    plan = assessment.fixedPlan
    if plan is None or plan.schema_version != 'jd-source-query-v2':
        return {}
    query_bindings(assessment, job)
    from app.schemas.jd_plan import content_digest
    return dict(inputContract='M1_REQUIREMENT_OBSERVATIONS_V1',
                planSchemaVersion=plan.schema_version, planContentSha256=content_digest(plan))



@dataclass(frozen=True)
class SemanticFeatures:
    mean_top1: float | None
    min_top1: float | None
    no_evidence_fraction: float | None
    expected_count: int
    observed_count: int
    truncated_texts: int


def summarize_semantics(
    assessment: Ai1Assessment,
    job: JobMatchingSnapshot,
    candidate: CandidateMatchingSnapshot,
    *,
    model_version: str,
    weights_sha256: str,
    manifest_sha256: str,
    query_source_balanced: bool = False,
) -> SemanticFeatures:
    """Validate exact snapshot/model provenance and summarize observed Top-1 hits.

    Missing requirements are not assigned zero similarity. Empty jobs and entirely
    missing evidence retain None for undefined metrics. No inference is performed.
    """
    if assessment.status != 'READY' or assessment.backend != 'local_m1':
        raise ValueError('Semantic features unavailable: READY/local_m1 required')
    if (not model_version or not weights_sha256 or not manifest_sha256
            or assessment.modelVersion != model_version
            or assessment.weightsSha256 != weights_sha256
            or assessment.manifestSha256 != manifest_sha256):
        raise ValueError('Semantic model provenance mismatch')
    if (assessment.jobId != job.id
            or assessment.candidateId != candidate.candidateId
            or assessment.candidateCvId != candidate.candidateCvId
            or assessment.jobSnapshotSha256 != snapshot_digest(job)
            or assessment.candidateSnapshotSha256 != snapshot_digest(candidate)):
        raise ValueError('Semantic snapshot binding mismatch')
    is_query = assessment.fixedPlan is not None and assessment.fixedPlan.schema_version == 'jd-source-query-v2'
    if query_source_balanced:
        bindings = query_bindings(assessment, job)
    elif is_query:
        feature_input_metadata(assessment, job)
        bindings = query_bindings(assessment, job)
    else:
        bindings = None
    expected = ([(f'{s.source_id}/{c.id}', c.query) for s, c in bindings]
                if bindings is not None else [(r.id, r.text) for r in source_requirements(job)])
    if [(r.requirementId, r.text) for r in assessment.requirements] != expected:
        raise ValueError('Original requirement IDs/text must remain in source order')

    evidence = RequirementMatcher(None)._build_evidence(candidate)
    source = {e.id: (e.original_text or e.text, e.source) for e in evidence}
    if len(source) != len(evidence):
        raise ValueError('Ambiguous candidate evidence IDs')

    def validate_hits(item):
        if item.retrievalStatus == 'SCORER_UNAVAILABLE':
            raise ValueError('Semantic scorer unavailable')
        if item.retrievalStatus == 'NO_EVIDENCE':
            if item.evidence:
                raise ValueError('NO_EVIDENCE must not carry hits')
        elif item.retrievalStatus in {
            'REVIEW_REQUIRED', 'CANDIDATE_EVIDENCE', 'INSUFFICIENT_SIGNAL',
        }:
            if not item.evidence:
                raise ValueError('Observed retrieval status requires hits')
        else:
            raise ValueError('Unknown retrieval status')
        hits = item.evidence
        if len(hits) > 3 or len({h.evidenceId for h in hits}) != len(hits):
            raise ValueError('Unique bounded Top3 evidence required')
        previous = math.inf
        for hit in hits:
            score = hit.similarityScore
            if (isinstance(score, bool) or not isinstance(score, (int, float))
                    or not math.isfinite(score) or not 0 <= score <= 100
                    or score > previous):
                raise ValueError('Finite bounded descending similarity scores required')
            if source.get(hit.evidenceId) != (hit.text, hit.source):
                raise ValueError('Evidence ID/text/source mismatch')
            previous = score

    top1 = []
    by_source = {}
    for requirement in assessment.requirements:
        validate_hits(requirement)
        for component in requirement.components or ():
            validate_hits(component)
        if requirement.evidence:
            top1.append(requirement.evidence[0].similarityScore / 100)
    if query_source_balanced:
        for (source_item, _), requirement in zip(bindings, assessment.requirements):
            scores, missing = by_source.setdefault(source_item.source_id, ([], []))
            missing.append(float(not requirement.evidence))
            if requirement.evidence:
                scores.append(requirement.evidence[0].similarityScore / 100)
        means = [math.fsum(scores) / len(scores) for scores, _ in by_source.values() if scores]
        return SemanticFeatures(
            mean_top1=math.fsum(means) / len(means) if means else None,
            min_top1=min(means) if means else None,
            no_evidence_fraction=math.fsum(math.fsum(m) / len(m) for _, m in by_source.values()) / len(by_source),
            expected_count=len(expected), observed_count=len(top1), truncated_texts=assessment.truncatedTexts)
    count = len(expected)
    observed = len(top1)
    return SemanticFeatures(
        mean_top1=math.fsum(top1) / observed if observed else None,
        min_top1=min(top1) if observed else None,
        no_evidence_fraction=(count - observed) / count if count else None,
        expected_count=count,
        observed_count=observed,
        truncated_texts=assessment.truncatedTexts,
    )
