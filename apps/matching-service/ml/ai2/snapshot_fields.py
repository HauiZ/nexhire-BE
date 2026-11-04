"""Shared allowlisted snapshot text fields; no labels, scoring or raw documents."""

from collections.abc import Mapping
from dataclasses import dataclass
from hashlib import sha256
import json


@dataclass(frozen=True)
class SnapshotField:
    snapshot_sha256: str
    field_path: str
    text: str
    record_kind: str
    record_index: int | None = None
    evidence_id: str | None = None


def snapshot_digest(snapshot):
    """Hash canonical JSON; callers pass the validated snapshot's model_dump JSON."""
    if not isinstance(snapshot, Mapping):
        raise ValueError("snapshot must be a mapping")
    payload = json.dumps(dict(snapshot), sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False, allow_nan=False)
    return sha256(payload.encode("utf-8")).hexdigest()


def walk_snapshot_fields(snapshot, kind, *, expected_sha256):
    """Return exact, nonblank field strings with enclosing snapshot provenance.

    Input must be a validated, normalized snapshot mapping (the same object used
    offline and online), not a source PDF or generator object. Hash checking does
    not substitute for snapshot schema validation. Unknown fields are never read
    as text. A record's ordinal remains attached even when its ID is absent.
    """
    if kind not in {"job", "candidate"}:
        raise ValueError("kind must be job or candidate")
    digest = snapshot_digest(snapshot)
    if digest != expected_sha256:
        raise ValueError("snapshot digest mismatch")
    fields = []

    def add(value, path, record_kind, index=None, evidence_id=None):
        if value is None:
            return
        if not isinstance(value, str):
            raise ValueError(f"{path} must be a string or null")
        if value.strip():
            fields.append(SnapshotField(digest, path, value, record_kind, index, evidence_id))

    def sequence(value, path):
        if not isinstance(value, list):
            raise ValueError(f"{path} must be a list")
        return value

    if kind == "job":
        for name in ("title", "description", "requirements"):
            add(snapshot.get(name), name, "job")
        for index, value in enumerate(sequence(snapshot.get("skills", []), "skills")):
            add(value, f"skills[{index}]", "job_skill", index)
    else:
        for name in ("headline", "summary"):
            add(snapshot.get(name), name, "profile")
        groups = (
            ("skills", "skill", ("name",)),
            ("experiences", "experience", ("title", "description")),
            ("educations", "education", ("degree", "fieldOfStudy", "description")),
            ("certifications", "certification", ("name", "description")),
            ("projects", "project", ("name", "description")),
        )
        for group, record_kind, names in groups:
            for index, record in enumerate(sequence(snapshot.get(group, []), group)):
                path = f"{group}[{index}]"
                if not isinstance(record, Mapping):
                    raise ValueError(f"{path} must be a mapping")
                evidence_id = record.get("id")
                if evidence_id is not None and not isinstance(evidence_id, str):
                    raise ValueError(f"{path}.id must be a string or null")
                for name in names:
                    add(record.get(name), f"{path}.{name}", record_kind, index, evidence_id)
                if group == "projects":
                    for tech_index, value in enumerate(sequence(record.get("technologies", []), f"{path}.technologies")):
                        add(value, f"{path}.technologies[{tech_index}]", record_kind, index, evidence_id)
    return tuple(fields)
