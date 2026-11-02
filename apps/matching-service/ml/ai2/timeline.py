"""Conservative month-granularity career chronology, not skill-specific tenure."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class TimelineSummary:
    known_months: int | None
    complete: bool
    record_count: int
    valid_record_count: int
    issues: tuple[tuple[int, str], ...]
    reference_date: str


def summarize_timeline(experiences, reference_date):
    """Union valid [start,end) month intervals without inventing missing months.

    Current records end at the reference month. Unknown current status is not
    inferred from absent end dates. Historical intervals extending beyond the
    reference month are rejected, not clipped. Empty chronology is unknown, not
    proof of zero lifetime experience. A known subset remains usable only with
    complete=False; never substitutes for scoped professional experience.
    """
    if not isinstance(reference_date, str):
        raise ValueError("reference_date must be an ISO calendar date")
    try:
        reference = date.fromisoformat(reference_date)
    except ValueError as exc:
        raise ValueError("reference_date must be an ISO calendar date") from exc
    if reference.isoformat() != reference_date:
        raise ValueError("reference_date must be an ISO calendar date")
    if not isinstance(experiences, list):
        raise ValueError("experiences must be a list")
    reference_month = reference.year * 12 + reference.month - 1
    intervals = []
    issues = []

    def month(record, prefix):
        year, value = record.get(prefix + "Year"), record.get(prefix + "Month")
        if year is None or value is None:
            return None, "missing_" + prefix + "_date"
        if (isinstance(year, bool) or not isinstance(year, int) or not 1 <= year <= 9999
                or isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 12):
            return None, "invalid_" + prefix + "_date"
        return year * 12 + value - 1, None

    for index, record in enumerate(experiences):
        if not isinstance(record, Mapping):
            raise ValueError("experience records must be mappings")
        start, reason = month(record, "start")
        current = record.get("isCurrent")
        if reason is None and current is not None and not isinstance(current, bool):
            reason = "invalid_current_status"
        if reason is None:
            if current is True:
                if record.get("endYear") is not None or record.get("endMonth") is not None:
                    reason = "conflicting_current_end_date"
                end = reference_month
            else:
                end, reason = month(record, "end")
        if reason is None:
            if start > reference_month or end > reference_month:
                reason = "future_interval"
            elif end < start:
                reason = "reversed_interval"
        if reason:
            issues.append((index, reason))
        else:
            intervals.append((start, end))
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    months = sum(end - start for start, end in merged) if intervals else None
    return TimelineSummary(months, bool(experiences) and not issues, len(experiences),
                           len(intervals), tuple(issues), reference_date)
