#!/usr/bin/env python3
"""AI1 Kaggle Bundle Builder.

Packages all required artifacts into a self-contained, reproducible, portable bundle:
- Author-trusted runner code in `runner/`
- Validated datasets in `data/`
- Allowlisted safetensors model files in `model/`
- Self-contained execution notebook in `notebook/`
- Cryptographic SHA-256 `manifest.json` verifying every file

Security & Integrity:
- Reject path traversal ('..'), absolute paths, and symlinks in archives.
- Model file allowlist: only known safetensors/tokenizer config files permitted.
- Never imports or executes untrusted code from extracted paths (uses Python -I).
- Verifies source IDs, texts, and split='train' against --raw-train.
- Detects and rejects any split leakage between train/silver and validation/test.
- Refuses overwrite unless --force is specified.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import time
import unicodedata
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Ensure script directory is available in isolated mode
sys.path.insert(0, str(Path(__file__).resolve().parent))

MODEL_FILE_ALLOWLIST: Set[str] = {
    "config.json",
    "sentence_bert_config.json",
    "tokenizer_config.json",
    "config_sentence_transformers.json",
    "modules.json",
    "README.md",
    "special_tokens_map.json",
    "tokenizer.json",
    "model.safetensors",
    "1_Pooling/config.json",
}

DISALLOWED_ARCHIVE_EXTENSIONS: Set[str] = {
    ".py", ".sh", ".bash", ".exe", ".bin", ".pickle", ".pkl", ".so", ".dll", ".dylib"
}


def normalize_text(value: Optional[str]) -> str:
    """Normalize text matching standard repo convention."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value))).strip().lower()


def compute_file_sha256(filepath: Path | str) -> str:
    """Compute sha256 hex digest of a file in streaming chunks."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def safe_extract_model_archive(archive_path: Path | str, dest_dir: Path | str) -> None:
    """Safely extract allowlisted model files from a zip archive.

    Rejects:
    - Path traversal ('..')
    - Absolute paths ('/' or 'C:\\')
    - Symlinks
    - Disallowed extensions (.py, .sh, etc.)
    - Any path not in MODEL_FILE_ALLOWLIST (normalized)
    """
    archive_path = Path(archive_path).resolve()
    dest_dir = Path(dest_dir).resolve()
    dest_dir.mkdir(parents=True, exist_ok=True)

    if not zipfile.is_zipfile(archive_path):
        raise ValueError(f"Archive is not a valid zip file: {archive_path}")

    with zipfile.ZipFile(archive_path, "r") as zf:
        for member in zf.infolist():
            filename = member.filename
            # Skip pure directory entries
            if filename.endswith("/"):
                continue

            # Check for path traversal or absolute paths
            if ".." in filename or filename.startswith("/") or filename.startswith("\\"):
                raise ValueError(f"Path traversal detected in archive member: '{filename}'")

            # Check for symlinks in zip attributes (Unix file type in high byte of external_attr)
            mode = member.external_attr >> 16
            is_symlink = stat.S_ISLNK(mode) if mode else False
            if is_symlink:
                raise ValueError(f"Symlink detected in archive member: '{filename}'")

            # Check extension
            ext = Path(filename).suffix.lower()
            if ext in DISALLOWED_ARCHIVE_EXTENSIONS:
                raise ValueError(f"Executable/script extension '{ext}' not allowed: '{filename}'")

            # Normalize relative model path inside archive (strip prefix e.g. 'kaggle-ranking-v1/models/ranking-retention/')
            parts = filename.split("/")
            # Find matching allowlisted subpath
            target_rel = None
            if len(parts) >= 2 and parts[-2] == "1_Pooling" and parts[-1] == "config.json":
                target_rel = "1_Pooling/config.json"
            else:
                candidate_rel = parts[-1]
                if candidate_rel in MODEL_FILE_ALLOWLIST:
                    target_rel = candidate_rel

            if not target_rel or target_rel not in MODEL_FILE_ALLOWLIST:
                raise ValueError(f"Archive member '{filename}' is not in the model allowlist")

            # Extract safely
            target_out = dest_dir / target_rel
            target_out.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src_file, open(target_out, "wb") as dst_file:
                shutil.copyfileobj(src_file, dst_file)


def copy_model_directory_allowlisted(src_dir: Path | str, dest_dir: Path | str) -> None:
    """Copy only allowlisted model files from source directory to destination."""
    src_dir = Path(src_dir).resolve()
    dest_dir = Path(dest_dir).resolve()
    dest_dir.mkdir(parents=True, exist_ok=True)

    copied = 0
    for allow_rel in sorted(MODEL_FILE_ALLOWLIST):
        src_path = src_dir / allow_rel
        if src_path.exists() and src_path.is_file():
            # Check not a symlink
            if src_path.is_symlink():
                raise ValueError(f"Source model file is a symlink: {src_path}")
            dst_path = dest_dir / allow_rel
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dst_path)
            copied += 1

    if copied == 0:
        raise ValueError(f"No allowlisted model files found in source directory: {src_dir}")


def validate_raw_train_provenance(
    silver_comparisons: List[Dict[str, Any]],
    raw_train_path: Path | str,
) -> None:
    """Validate silver comparisons IDs, texts, and split='train' against raw train source."""
    raw_path = Path(raw_train_path).resolve()
    if not raw_path.exists():
        raise ValueError(f"Raw train source file not found: {raw_path}")

    # Index raw train by candidate_pair_id
    raw_index: Dict[str, Dict[str, Any]] = {}
    with open(raw_path, "r", encoding="utf-8") as f:
        for line in f:
            line_str = line.strip()
            if not line_str:
                continue
            rec = json.loads(line_str)
            cid = rec.get("candidate_pair_id") or rec.get("record_id")
            if cid:
                raw_index[cid] = rec

    # Verify every silver comparison
    for sc in silver_comparisons:
        cmp_id = sc.get("comparison_id")
        pos_id = sc.get("pos_record_id")
        neg_id = sc.get("neg_record_id")

        if pos_id not in raw_index:
            raise ValueError(f"Silver comparison {cmp_id}: positive record {pos_id} not found in raw train source")
        if neg_id not in raw_index:
            raise ValueError(f"Silver comparison {cmp_id}: negative record {neg_id} not found in raw train source")

        pos_rec = raw_index[pos_id]
        neg_rec = raw_index[neg_id]

        if pos_rec.get("split") != "train":
            raise ValueError(f"Silver comparison {cmp_id}: positive record {pos_id} has split '{pos_rec.get('split')}' != 'train'")
        if neg_rec.get("split") != "train":
            raise ValueError(f"Silver comparison {cmp_id}: negative record {neg_id} has split '{neg_rec.get('split')}' != 'train'")

        # Verify evidence text matches
        if normalize_text(pos_rec.get("evidence", "")) != normalize_text(sc.get("positive_evidence", "")):
            raise ValueError(f"Silver comparison {cmp_id}: positive evidence text mismatch with raw train source")
        if normalize_text(neg_rec.get("evidence", "")) != normalize_text(sc.get("negative_evidence", "")):
            raise ValueError(f"Silver comparison {cmp_id}: negative evidence text mismatch with raw train source")


def build_bundle(
    semantic_path: Path | str,
    silver_dir: Path | str,
    output_dir: Path | str,
    model_dir: Optional[Path | str] = None,
    model_zip: Optional[Path | str] = None,
    raw_train_path: Optional[Path | str] = None,
    runner_src_path: Optional[Path | str] = None,
    notebook_src_path: Optional[Path | str] = None,
    package_zip: bool = False,
    force: bool = False,
) -> Dict[str, Any]:
    """Assemble self-contained Kaggle bundle with cryptographic manifest."""
    out_dir = Path(output_dir).resolve()
    if out_dir.exists():
        if not force and any(out_dir.iterdir()):
            raise FileExistsError(
                f"Output bundle directory '{out_dir}' already exists and is not empty. Use --force to overwrite."
            )
        if force:
            shutil.rmtree(out_dir)

    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Verify semantic dataset
    sem_path = Path(semantic_path).resolve()
    if not sem_path.exists():
        raise FileNotFoundError(f"Semantic dataset not found: {sem_path}")

    # 2. Verify silver comparisons
    s_dir = Path(silver_dir).resolve()
    s_cmp_path = s_dir / "silver_comparisons.jsonl"
    s_man_path = s_dir / "manifest.json"
    if not s_cmp_path.exists():
        raise FileNotFoundError(f"Missing silver_comparisons.jsonl in: {s_dir}")

    # Load silver comparisons
    silver_records = []
    with open(s_cmp_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                silver_records.append(json.loads(line))

    # Validate silver invariant (train split only, full positive support vs lower negative)
    from ai1_kaggle_experiment import (
        validate_silver_records,
        load_semantic_records,
        build_train_comparisons_from_semantic,
        validate_no_leakage,
    )
    validated_silver = validate_silver_records(silver_records)

    # Validate raw train provenance if provided
    if raw_train_path:
        validate_raw_train_provenance(validated_silver, raw_train_path)

    # Load semantic and check leakage
    sem_records = load_semantic_records(sem_path)
    train_comps = build_train_comparisons_from_semantic(sem_records)
    val_rows = [r for r in sem_records if r.get("split") == "validation"]
    test_rows = [r for r in sem_records if r.get("split") == "test"]
    validate_no_leakage(train_comps, validated_silver, val_rows, test_rows)

    # 3. Handle model checkpoint allowlisted extraction / copy
    model_dest = out_dir / "model"
    model_dest.mkdir(parents=True, exist_ok=True)
    if model_dir:
        copy_model_directory_allowlisted(model_dir, model_dest)
    elif model_zip:
        safe_extract_model_archive(model_zip, model_dest)
    else:
        raise ValueError("Must provide either --model-dir or --model-zip")

    # 4. Copy data files
    data_dest = out_dir / "data"
    data_dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sem_path, data_dest / "semantic.jsonl")
    shutil.copy2(s_cmp_path, data_dest / "silver_comparisons.jsonl")
    if s_man_path.exists():
        shutil.copy2(s_man_path, data_dest / "silver_manifest.json")

    # 5. Copy runner code
    runner_dest = out_dir / "runner"
    runner_dest.mkdir(parents=True, exist_ok=True)
    if not runner_src_path:
        runner_src_path = Path(__file__).resolve().parent / "ai1_kaggle_experiment.py"
    shutil.copy2(runner_src_path, runner_dest / "ai1_kaggle_experiment.py")

    # 6. Copy notebook
    nb_dest = out_dir / "notebook"
    nb_dest.mkdir(parents=True, exist_ok=True)
    if not notebook_src_path:
        notebook_src_path = Path(__file__).resolve().parent.parent / "notebooks" / "ai1_silver_v1_kaggle.ipynb"
    if Path(notebook_src_path).exists():
        shutil.copy2(notebook_src_path, nb_dest / "ai1_silver_v1_kaggle.ipynb")

    # 7. Generate bundle manifest.json
    artifacts = {}
    for p in sorted(out_dir.rglob("*")):
        if p.is_file():
            rel = str(p.relative_to(out_dir))
            artifacts[rel] = compute_file_sha256(p)

    bundle_manifest = {
        "schema_version": "ai1-kaggle-bundle-v1",
        "created_at_utc": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "description": "Self-contained reproducible Kaggle bundle for AI1 continuation experiment",
        "objective": "support_ranking",
        "silver_comparisons_count": len(validated_silver),
        "train_pairwise_comparisons_count": len(train_comps),
        "validation_rows_count": len(val_rows),
        "test_rows_count": len(test_rows),
        "artifacts": artifacts,
    }

    manifest_file = out_dir / "manifest.json"
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(bundle_manifest, f, indent=2, ensure_ascii=False)

    print(f"Bundle successfully created at: {out_dir}")
    print(f"Total artifacts registered in manifest: {len(artifacts)}")

    # 8. Optional packaging into zip
    zip_path = None
    if package_zip:
        zip_path = out_dir.with_suffix(".zip")
        print(f"Packaging bundle into zip: {zip_path}...")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in sorted(out_dir.rglob("*")):
                if p.is_file():
                    rel = str(p.relative_to(out_dir))
                    zf.write(p, arcname=rel)
        print(f"Zip package created successfully: {zip_path} ({os.path.getsize(zip_path)} bytes)")

    return {
        "bundle_dir": str(out_dir),
        "manifest": bundle_manifest,
        "zip_path": str(zip_path) if zip_path else None,
    }


def main():
    parser = argparse.ArgumentParser(description="AI1 Kaggle Bundle Builder")
    parser.add_argument("--semantic", type=str, required=True, help="Path to semantic.jsonl")
    parser.add_argument("--silver-dir", type=str, required=True, help="Path to ai1-silver-experiment-v1 directory")
    parser.add_argument("--output", type=str, required=True, help="Path to output bundle directory")
    parser.add_argument("--model-dir", type=str, default=None, help="Path to extracted model checkpoint directory")
    parser.add_argument("--model-zip", type=str, default=None, help="Path to model archive zip")
    parser.add_argument("--raw-train", type=str, default=None, help="Path to raw train dataset (e.g. train_scoring_input.jsonl)")
    parser.add_argument("--package-zip", action="store_true", help="Also package output directory into a .zip")
    parser.add_argument("--force", action="store_true", help="Overwrite output directory if exists")

    args = parser.parse_args()

    build_bundle(
        semantic_path=args.semantic,
        silver_dir=args.silver_dir,
        output_dir=args.output,
        model_dir=args.model_dir,
        model_zip=args.model_zip,
        raw_train_path=args.raw_train,
        package_zip=args.package_zip,
        force=args.force,
    )


if __name__ == "__main__":
    main()
