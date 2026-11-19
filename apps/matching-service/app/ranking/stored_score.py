"""Read-only scoring from saved matching inputs; not a hiring assessment."""

from app.schemas.ai1 import Ai1Assessment
from app.schemas.match_result import MatchingInputSnapshots
from app.ranking.semantic_features import feature_input_metadata, UnsupportedFeatureInput


def score_stored_result(result, predictor, *, pool_reference_date=None):
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
        raw_assessment = explanation.get('ai1Assessment')
        if raw_assessment is None or (isinstance(raw_assessment, dict) and (
                raw_assessment.get('status') in {'PENDING', 'PROCESSING', 'QUEUED', 'DISABLED', 'UNAVAILABLE', 'ERROR', 'FAILED'}
                or raw_assessment.get('backend') == 'disabled')):
            return dict(common, status='UNAVAILABLE', score=None, reason='M1_NOT_READY')
        assessment = Ai1Assessment.model_validate(raw_assessment)
        if (assessment.status != 'READY' or assessment.backend != 'local_m1'
                or any(row.retrievalStatus == 'SCORER_UNAVAILABLE'
                       or any(c.retrievalStatus == 'SCORER_UNAVAILABLE' for c in row.components or ())
                       for row in assessment.requirements)):
            return dict(common, status='UNAVAILABLE', score=None, reason='M1_NOT_READY')
        if (snapshots.job.id != identity['jobId']
                or snapshots.candidate.candidateId != identity['candidateId']
                or snapshots.candidate.candidateCvId != identity['candidateCvId']):
            raise ValueError('stored application identity mismatch')
        # Consume actual validated M1 query observations with the original formulas.
        # Experimental reuse is not evidence of input-distribution invariance.
        input_metadata = feature_input_metadata(assessment, snapshots.job)
        reference = explanation['scoreReferenceDate']
        if pool_reference_date is not None:
            from datetime import date
            if (date.fromisoformat(pool_reference_date).isoformat() != pool_reference_date
                    or date.fromisoformat(reference) > date.fromisoformat(pool_reference_date)):
                raise ValueError('invalid pool assessment date')
        # Recompute every score from immutable inputs. Chronology stays anchored
        # to the saved observation: Present is not proof of continued employment.
        score = predictor.score(assessment, snapshots.job, snapshots.candidate, reference_date=reference)
        output = dict(common, status='READY', score=score.score, modelVersion=score.model_version,
                      jobSnapshotSha256=score.job_snapshot_sha256,
                      candidateSnapshotSha256=score.candidate_snapshot_sha256,
                      referenceDate=score.reference_date)
        output.update(input_metadata)
        if pool_reference_date is not None:
            output.update(referenceDate=pool_reference_date, snapshotReferenceDate=reference,
                          chronologyPolicy='FROZEN_SNAPSHOT_CHRONOLOGY_V1')
        return output
    except UnsupportedFeatureInput:
        return dict(common, status='UNAVAILABLE', score=None,
                    reason='SOURCE_QUERY_V2_FEATURES_NOT_SUPPORTED')
    except (KeyError, ValueError, TypeError):
        return dict(common, status='UNAVAILABLE', score=None,
                    reason='STORED_INPUT_OR_ASSESSMENT_INCOMPATIBLE')
