"""Synthetic source binding fixtures; no inference, datasets or services."""

from dataclasses import asdict, replace

import pytest

from app.ranking.source_extractor import extract_tools
from ml.ai2.provenance import bind_extraction
from ml.ai2.snapshot_fields import snapshot_digest


@pytest.fixture
def bundle():
    snapshot = {"projects": [{"id": "project-1", "description": "🙂 Built Python APIs"}]}
    path = "projects[0].description"
    result = extract_tools(snapshot["projects"][0]["description"], path, {"Python": ["Python"]})
    return snapshot, path, result


def bind(bundle, **updates):
    snapshot, path, result = bundle
    return bind_extraction(snapshot, "candidate", **{
        "expected_sha256": snapshot_digest(snapshot), "field_path": path,
        "result": result, **updates})


def test_exact_unicode_span_and_project_identity(bundle):
    bound = bind(bundle)
    anchor = bound.result.anchors[0]
    assert anchor.start == 8
    assert bound.field.text[anchor.start:anchor.end] == anchor.quote == "Python"
    assert anchor.snapshot_hash == bound.field.snapshot_sha256
    assert bound.field.evidence_id == "project-1"
    assert bound.field.record_kind == "project"
    assert bound.field.record_index == 0
    assert bundle[2].anchors[0].snapshot_hash is None
    assert asdict(bound)["result"]["anchors"][0]["quote"] == "Python"


@pytest.mark.parametrize("changes", [
    {"start": -1}, {"end": 999}, {"end": 8}, {"start": True},
    {"end": 14.0}, {"quote": "python"}, {"field_path": "summary"},
    {"snapshot_hash": "0" * 64},
])
def test_invalid_or_conflicting_anchor_rejected(bundle, changes):
    result = bundle[2]
    changed = replace(result, anchors=(replace(result.anchors[0], **changes),))
    with pytest.raises(ValueError):
        bind(bundle, result=changed)


def test_snapshot_mutation_rejected(bundle):
    snapshot, path, result = bundle
    digest = snapshot_digest(snapshot)
    changed = {"projects": [{"id": "project-1", "description": "Built Python APIs"}]}
    with pytest.raises(ValueError, match="digest"):
        bind_extraction(changed, "candidate", expected_sha256=digest,
                        field_path=path, result=result)


def test_excluded_field_cannot_be_bound(bundle):
    with pytest.raises(ValueError, match="allowlisted"):
        bind(bundle, field_path="name")


def test_matching_prebound_hash_is_accepted(bundle):
    result = bundle[2]
    result = replace(result, anchors=(replace(result.anchors[0],
        snapshot_hash=snapshot_digest(bundle[0])),))
    assert bind(bundle, result=result).result == result


def test_abstention_is_preserved_without_invented_evidence(bundle):
    result = replace(bundle[2], status="unknown", anchors=(), reasons=("unsupported",))
    assert bind(bundle, result=result).result == result
