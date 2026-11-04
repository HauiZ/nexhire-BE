"""All-or-none ordering of caller-authorized saved results against current JD."""
from app.ranking.demo_predictor import MODEL_VERSION
from app.schemas.jd_plan import snapshot_digest


def rank_stored_pool(scores, current_job):
    common = dict(schemaVersion='ai2-demo-pool-v1', experimental=True,
                  automaticallyReject=False, hiringDecision=None, items=[],
                  requestedCount=len(scores), comparedCount=0)
    def unavailable(reason):
        return dict(common, status='UNAVAILABLE', reason=reason)
    if not 1 <= len(scores) <= 50:
        return unavailable('POOL_SIZE_INVALID')
    if any(s['status'] == 'DISABLED' for s in scores):
        return dict(common, status='DISABLED', reason='DEMO_DISABLED')
    if any(s['status'] != 'READY' for s in scores):
        return unavailable('RESULTS_NOT_READY')
    if len({s['applicationId'] for s in scores}) != len(scores) or len({s['candidateId'] for s in scores}) != len(scores):
        return unavailable('DUPLICATE_APPLICATION_OR_CANDIDATE')
    policies = {s.get('chronologyPolicy') for s in scores}
    if len(policies) != 1 or not policies <= {None, 'FROZEN_SNAPSHOT_CHRONOLOGY_V1'}:
        return unavailable('INCOMPATIBLE_SNAPSHOTS_OR_DATES')
    bindings = {(s['jobId'], s['jobSnapshotSha256'], s['referenceDate'], s['modelVersion']) for s in scores}
    if len(bindings) != 1:
        return unavailable('INCOMPATIBLE_SNAPSHOTS_OR_DATES')
    job_id, digest, reference, model = next(iter(bindings))
    if model != MODEL_VERSION:
        return unavailable('INCOMPATIBLE_MODEL')
    if current_job.id != job_id or snapshot_digest(current_job) != digest:
        return unavailable('STALE_JOB_SNAPSHOT')
    if len(scores) < 2:
        return unavailable('NEED_MORE_APPLICATIONS')
    import math
    if any(type(s['score']) not in (int, float) or not math.isfinite(s['score']) for s in scores):
        return unavailable('INVALID_SCORE')
    ordered = sorted(scores, key=lambda s: (-s['score'], s['candidateId']))
    # Equal model scores share a rank; candidate ID is only a stable display tie-break.
    items, previous, rank = [], None, 0
    for position, score in enumerate(ordered, 1):
        if previous is None or score['score'] != previous:
            rank = position
        previous = score['score']
        items.append(dict(applicationId=score['applicationId'], candidateId=score['candidateId'],
                          candidateCvId=score['candidateCvId'], resultId=score['resultId'],
                          rankingPosition=rank))
    return dict(common, status='READY', comparedCount=len(scores), items=items,
                jobId=job_id, jobSnapshotSha256=digest, referenceDate=reference,
                modelVersion=model, tiePolicy='EQUAL_SCORE_SHARED_RANK')
