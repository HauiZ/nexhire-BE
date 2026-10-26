import argparse
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.matching.ranking import RankingFeatures
from app.matching.normalizer import normalize_semantic_text


class DatasetRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)

    record_id: str = Field(min_length=1)
    dataset_version: str = Field(min_length=1)
    split: Literal["train", "validation", "test"]
    job_id: str = Field(min_length=1)
    candidate_id: str = Field(min_length=1)
    label_source: Literal["recruiter", "expert", "rubric"]
    annotator_id: str = Field(min_length=1)
    dataset_schema_version: Literal["matching-dataset-v2"]
    preprocessing_version: Literal["matching-text-v2"]
    candidate_snapshot_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    job_snapshot_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    candidate_cv_id: str | None = None
    data_origin: Literal["PROFILE", "PARSED_CV"]


class SemanticRecord(DatasetRecord):
    requirement_id: str = Field(min_length=1)
    requirement: str = Field(min_length=1)
    evidence_id: str = Field(min_length=1)
    evidence: str = Field(min_length=1)
    evidence_source: Literal["skill", "experience", "project", "education", "certification", "profile"]
    label: Literal[0, 1]
    negative_type: Literal["random", "hard"] | None = None

    @field_validator("label", mode="before")
    @classmethod
    def validate_label_type(cls, value):
        if type(value) is not int:
            raise ValueError("Semantic label must be integer 0 or 1")
        return value


class RankingRecord(DatasetRecord):
    feature_schema_version: Literal["candidate-job-v2"]
    feature_extractor_version: Literal["heuristic-features-v2"]
    score_reference_date: date
    semantic_model_version: str = Field(min_length=1)
    features: RankingFeatures
    relevance: int = Field(ge=0, le=3, strict=True)


def validate_dataset(
    path: Path, kind: Literal["semantic", "ranking"], *,
    split_policy: Literal["job", "job_candidate"] = "job_candidate",
    require_all_splits: bool = True,
) -> list[DatasetRecord]:
    if kind not in ("semantic", "ranking") or split_policy not in ("job", "job_candidate"):
        raise ValueError("Unsupported dataset kind or split policy")
    schema = SemanticRecord if kind == "semantic" else RankingRecord
    records = []
    ids = set()
    pairs = set()
    group_splits: dict[tuple[str, str], str] = {}
    versions = set()
    semantic_versions = set()
    text_pair_splits = {}
    job_hashes = {}
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                record = schema.model_validate_json(line)
                if record.job_id in job_hashes and job_hashes[record.job_id] != record.job_snapshot_hash:
                    raise ValueError("One job_id must identify one frozen JD snapshot within a dataset")
                job_hashes[record.job_id] = record.job_snapshot_hash
                if record.record_id in ids:
                    raise ValueError("Duplicate record_id")
                pair = (record.job_id, record.candidate_id)
                if kind == "semantic":
                    pair += (record.requirement_id, record.evidence_id)
                    if record.label == 1 and record.negative_type is not None:
                        raise ValueError("Positive evidence cannot have a negative_type")
                    if record.label == 0 and record.negative_type is None:
                        raise ValueError("Negative evidence needs a negative_type")
                if pair in pairs:
                    raise ValueError("Duplicate training pair")
                groups = [("job", record.job_id)]
                groups.append(("job_snapshot", record.job_snapshot_hash))
                if split_policy == "job_candidate":
                    groups.append(("candidate", record.candidate_id))
                    groups.append(("candidate_snapshot", record.candidate_snapshot_hash))
                if isinstance(record, SemanticRecord):
                    # Shared skill phrases are legitimate; repeated labeled pairs are leakage.
                    text_pair = (normalize_semantic_text(record.requirement), normalize_semantic_text(record.evidence))
                    if text_pair in text_pair_splits and text_pair_splits[text_pair] != record.split:
                        raise ValueError("Cross-split leakage in requirement/evidence text pair")
                    text_pair_splits[text_pair] = record.split
                for group in groups:
                    if group in group_splits and group_splits[group] != record.split:
                        raise ValueError(f"Cross-split leakage in {group[0]}")
                    group_splits[group] = record.split
                ids.add(record.record_id)
                pairs.add(pair)
                versions.add(record.dataset_version)
                if isinstance(record, RankingRecord):
                    semantic_versions.add(record.semantic_model_version)
                records.append(record)
            except ValueError as error:
                raise ValueError(f"Invalid dataset record at line {line_number}: {error}") from error
    if not records:
        raise ValueError("Dataset is empty")
    if len(versions) != 1 or len(semantic_versions) > 1:
        raise ValueError("Dataset must use one dataset version and one semantic model version")
    for split in ("train", "validation", "test"):
        partition = [record for record in records if record.split == split]
        if not partition:
            if require_all_splits:
                raise ValueError(f"Missing {split} partition")
            continue
        if kind == "semantic" and {record.label for record in partition} != {0, 1}:
            raise ValueError(f"{split} needs positive and negative semantic examples")
        if kind == "ranking":
            for job_id in {record.job_id for record in partition}:
                labels = {record.relevance for record in partition if record.job_id == job_id}
                if len(labels) < 2:
                    raise ValueError(f"Each {split} job needs candidates with different relevance labels")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate labeled matching datasets before training")
    parser.add_argument("kind", choices=["semantic", "ranking"])
    parser.add_argument("path", type=Path)
    parser.add_argument("--split-policy", choices=["job", "job_candidate"], default="job_candidate")
    parser.add_argument("--allow-incomplete", action="store_true", help="Allow missing partitions during dataset preparation")
    args = parser.parse_args()
    records = validate_dataset(args.path, args.kind, split_policy=args.split_policy,
                               require_all_splits=not args.allow_incomplete)
    print(f"Validated {len(records)} {args.kind} records")


if __name__ == "__main__":
    main()
