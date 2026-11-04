"""Experimental source-bound checks, isolated from production matching.

Inputs are explicit reviewed claims, not automatic extractions from a retrieved
passage. Text support never establishes credential authenticity or hiring fit.
"""

from dataclasses import dataclass
from datetime import date
import re

from app.matching.normalizer import normalize_semantic_text


@dataclass(frozen=True)
class CertificateClaim:
    evidence_id: str
    quote: str
    designation: str
    affirmed: bool | None


@dataclass(frozen=True)
class ExperienceClaim:
    evidence_id: str
    quote: str
    start_month: str
    end_month: str | None
    scope_confirmed: bool


@dataclass(frozen=True)
class ConditionResult:
    requirement_id: str
    kind: str
    status: str
    evidence_ids: tuple[str, ...]
    reason_codes: tuple[str, ...]
    observed_months_lower_bound: int | None = None
    automatically_supported: bool = False
    candidate_rejected: bool = False
    requires_manual_review: bool = True
    policy_version: str = "reviewed-source-conditions-shadow-v2"


def _bound_quote(evidence_id, quote, sections):
    if evidence_id not in sections or not quote.strip() or quote not in sections[evidence_id]:
        raise ValueError("Claim must quote its actual source evidence ID exactly")


def _phrase_in(phrase, text):
    phrase, text = normalize_semantic_text(phrase), normalize_semantic_text(text)
    return bool(phrase and re.search(r"(?<![\w+#])" + re.escape(phrase) + r"(?![\w+#])", text))


def check_certificate(requirement_id: str, accepted_designations: tuple[str, ...],
                      claims: list[CertificateClaim], sections: dict[str, str], *,
                      reviewed_by: str, designation_groups: tuple[tuple[str, ...], ...] = ()) -> ConditionResult:
    if not requirement_id or not reviewed_by or not accepted_designations or any(not s.strip() for s in accepted_designations):
        raise ValueError("Reviewed requirement and explicit accepted designations required")
    accepted = {normalize_semantic_text(s) for s in accepted_designations}
    aliases = {}
    for index, group in enumerate(designation_groups):
        names = [normalize_semantic_text(s) for s in group]
        if not names or len(names) != len(set(names)) or not set(names) <= accepted or set(names) & set(aliases):
            raise ValueError("Reviewed alias groups must be nonempty, disjoint and drawn from accepted names")
        aliases.update({name: ("group", index) for name in names})
    supported, uncertain = [], False
    positive_names, negative_names = set(), set()
    for claim in claims:
        _bound_quote(claim.evidence_id, claim.quote, sections)
        if claim.affirmed is not None and type(claim.affirmed) is not bool:
            raise ValueError("Affirmation must be explicitly reviewed as true/false/unknown")
        if not _phrase_in(claim.designation, claim.quote):
            raise ValueError("Designation must actually occur in the bound quote")
        name = normalize_semantic_text(claim.designation)
        if name not in accepted:
            continue
        identity = aliases.get(name, ("literal", name))
        if claim.affirmed is True:
            supported.append(claim.evidence_id)
            positive_names.add(identity)
        elif claim.affirmed is None:
            uncertain = True
        else:
            negative_names.add(identity)
    conflicting = bool(positive_names & negative_names)
    status = "REVIEW_REQUIRED" if conflicting else "TEXT_SUPPORTED" if supported else "REVIEW_REQUIRED" if uncertain else "NOT_ESTABLISHED"
    return ConditionResult(requirement_id, "certificate", status, tuple(sorted(set(supported))),
        ("REVIEWED_DESIGNATIONS_ONLY", "TEXT_IS_NOT_CREDENTIAL_AUTHENTICATION", "ABSENCE_IS_NOT_REJECTION")
        + (("MIXED_REVIEWED_CREDENTIAL_ASSERTIONS",) if conflicting else ()))


def _month(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}", value):
        raise ValueError("Explicit YYYY-MM dates required; no guessed year-only dates")
    parsed = date.fromisoformat(value + "-01")
    return parsed.year * 12 + parsed.month - 1


def check_experience_years(requirement_id: str, minimum_months: int, maximum_months: int | None,
                           claims: list[ExperienceClaim], sections: dict[str, str], *,
                           reference_month: str, reviewed_by: str) -> ConditionResult:
    if (not requirement_id or not reviewed_by or type(minimum_months) is not int or minimum_months < 0
            or (maximum_months is not None and (type(maximum_months) is not int or maximum_months < minimum_months))):
        raise ValueError("Reviewed requirement and explicit nonnegative month bounds required")
    reference = _month(reference_month)
    intervals, ids, uncertain = [], [], False
    for claim in claims:
        _bound_quote(claim.evidence_id, claim.quote, sections)
        start = _month(claim.start_month)
        if claim.start_month not in claim.quote:
            raise ValueError("Start month must occur in its bound source quote")
        if claim.end_month is None:
            if not re.search(r"\b(?:present|current)\b", normalize_semantic_text(claim.quote)):
                raise ValueError("Open-ended experience needs an explicit present/current source cue")
            end = reference
        else:
            end = _month(claim.end_month)
            if claim.end_month not in claim.quote:
                raise ValueError("End month must occur in its bound source quote")
        if start > end or start > reference or end > reference:
            raise ValueError("Invalid/future interval relative to the explicit reference month")
        if claim.scope_confirmed is not True:
            uncertain = True
            continue
        intervals.append((min(start + 1, end), end))
        ids.append(claim.evidence_id)
    # Unknown start/end days mean boundary months cannot be counted as full
    # months. Union the remaining half-open intervals to avoid double counting.
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    months = sum(end - start for start, end in merged)
    if uncertain:
        status = "REVIEW_REQUIRED"
    elif not intervals:
        status = "NOT_ESTABLISHED"
    elif maximum_months is not None and months > maximum_months:
        status = "OBSERVED_DURATION_ABOVE_RANGE"
    elif months < minimum_months:
        status = "OBSERVED_DURATION_BELOW_MINIMUM"
    elif maximum_months is not None:
        # A lower bound inside an explicit range cannot establish its upper
        # bound: omitted days/months or other experience may exceed the range.
        status = "REVIEW_REQUIRED"
    else:
        status = "TEXT_SUPPORTED"
    return ConditionResult(requirement_id, "experience_years", status, tuple(sorted(set(ids))),
        ("REVIEWED_SCOPE_ONLY", "OVERLAPS_COUNT_ONCE", "CONSERVATIVE_MONTH_PRECISION",
         "OBSERVED_TEXT_NOT_COMPLETE_CAREER", "ABSENCE_IS_NOT_REJECTION"), months)
