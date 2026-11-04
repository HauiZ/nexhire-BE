"""Bind extractor spans to allowlisted immutable snapshot fields, not PDF evidence."""

from dataclasses import dataclass, replace

from app.ranking.source_extractor import Anchor, ExtractionResult
from ml.ai2.snapshot_fields import SnapshotField, walk_snapshot_fields


@dataclass(frozen=True)
class BoundExtraction:
    field: SnapshotField
    result: ExtractionResult


def bind_extraction(snapshot, kind, *, expected_sha256, field_path, result):
    """Reject stale, conflicting or invalid spans before recording provenance.

    This verifies source identity and exact text only, not extractor accuracy,
    competence, requirement satisfaction or model contribution.
    """
    if not isinstance(result, ExtractionResult):
        raise ValueError("result must be an ExtractionResult")
    fields = walk_snapshot_fields(snapshot, kind, expected_sha256=expected_sha256)
    matches = [field for field in fields if field.field_path == field_path]
    if len(matches) != 1:
        raise ValueError("field must be a nonblank allowlisted snapshot field")
    field = matches[0]
    anchors = []
    for anchor in result.anchors:
        if not isinstance(anchor, Anchor):
            raise ValueError("anchor must be an Anchor")
        if anchor.field_path != field.field_path:
            raise ValueError("anchor field path mismatch")
        if anchor.snapshot_hash not in (None, field.snapshot_sha256):
            raise ValueError("anchor snapshot hash mismatch")
        if (type(anchor.start) is not int or type(anchor.end) is not int
                or not 0 <= anchor.start < anchor.end <= len(field.text)):
            raise ValueError("invalid anchor offsets")
        if field.text[anchor.start:anchor.end] != anchor.quote:
            raise ValueError("anchor quote mismatch")
        anchors.append(replace(anchor, snapshot_hash=field.snapshot_sha256))
    return BoundExtraction(field, replace(result, anchors=tuple(anchors)))
