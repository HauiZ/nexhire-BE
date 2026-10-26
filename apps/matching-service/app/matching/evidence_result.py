"""Evidence-only runtime envelope. Legacy scoring remains an offline concern."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ValidationError

from app.schemas.ai1 import Ai1Assessment
from app.schemas.match_result import MatchingInputSnapshots
from app.schemas.jd_plan import digest


class EvidenceExplanation(BaseModel):
    ai1Assessment: Ai1Assessment | None = None
    inputSnapshots: MatchingInputSnapshots | None = None
    candidateSnapshotHash: str | None = None
    jobSnapshotHash: str | None = None
    dataOrigin: Literal['PROFILE', 'PARSED_CV'] | None = None
    scoreReferenceDate: date | None = None
    featureLimitations: tuple[Literal['AI2_NOT_AVAILABLE', 'AI1_RETRIEVAL_NOT_VERIFIED_SUPPORT'], ...] = (
        'AI2_NOT_AVAILABLE', 'AI1_RETRIEVAL_NOT_VERIFIED_SUPPORT')


def evidence_explanation(job, candidate, assessment, reference_date):
    return EvidenceExplanation(
        ai1Assessment=assessment, inputSnapshots=MatchingInputSnapshots(job=job, candidate=candidate),
        jobSnapshotHash=digest(job.model_dump(mode='json')),
        candidateSnapshotHash=digest(candidate.model_dump(mode='json')),
        dataOrigin=candidate.dataOrigin, scoreReferenceDate=reference_date,
    ).model_dump(mode='json')


def public_explanation(raw, *, include_snapshots=True):
    """Allowlist both current and archived results; never surface archived fit claims."""
    source = raw if isinstance(raw, dict) else {}
    # Legacy limitation prose may contain retired scoring claims, so regenerate it.
    values = {key: source[key] for key in EvidenceExplanation.model_fields
              if key in source and key != 'featureLimitations'}
    try:
        result = EvidenceExplanation.model_validate(values).model_dump(mode='json')
    except (TypeError, ValueError, ValidationError):
        result = EvidenceExplanation().model_dump(mode='json')
    if not include_snapshots:
        result.pop('inputSnapshots', None)
    return result
