"""Read-only scoring from saved matching inputs; not a hiring assessment."""

from app.schemas.ai1 import Ai1Assessment
from app.schemas.match_result import MatchingInputSnapshots


def score_stored_result(result, predictor):
    """Revalidate persisted identities and immutable sources; never fetch current CV.

    Caller must authorize application before reading this internal projection.
    A single application score is not a pool rank; mixed JD snapshots must not sort
    together. Staleness against current JD is a separate application-layer check.
    """
    identity = dict(applicationId=str(result.application_id), jobId=str(result.job_id),
                    candidateId=str(result.candidate_id),
                    candidateCvId=str(result.candidate_cv_id) if result.candidate_cv_id else None,
                    resultId=str(result.id))
    common = dict(identity, schemaVersion='ai2-demo-score-v1', experimental=True,
                  scoreMeaning='RELATIVE_RANKING_SCORE', rankingPosition=None,
                  automaticallyReject=False, hiringDecision=None, attributionStatus='UNAVAILABLE')
    if predictor is None:
        return dict(common, status='DISABLED', score=None)
    try:
        status = getattr(result.status, 'value', result.status)
        if status != 'SUCCEEDED':
            raise ValueError('successful matching result required')
        explanation = result.explanation
        snapshots = MatchingInputSnapshots.model_validate(explanation['inputSnapshots'])
        assessment = Ai1Assessment.model_validate(explanation['ai1Assessment'])
        if (snapshots.job.id != identity['jobId']
                or snapshots.candidate.candidateId != identity['candidateId']
                or snapshots.candidate.candidateCvId != identity['candidateCvId']):
            raise ValueError('stored application identity mismatch')
        reference = explanation['scoreReferenceDate']
        score = predictor.score(assessment, snapshots.job, snapshots.candidate, reference_date=reference)
        return dict(common, status='READY', score=score.score, modelVersion=score.model_version,
                    jobSnapshotSha256=score.job_snapshot_sha256,
                    candidateSnapshotSha256=score.candidate_snapshot_sha256,
                    referenceDate=score.reference_date)
    except (KeyError, ValueError, TypeError):
        return dict(common, status='UNAVAILABLE', score=None,
                    reason='STORED_INPUT_OR_ASSESSMENT_INCOMPATIBLE')
