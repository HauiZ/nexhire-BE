"""Independent, verified local M1 retrieval; never an assessment of support."""

import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import stat
import time

from app.matching.normalizer import normalize_semantic_text as norm
from app.matching.requirement_matcher import RequirementMatcher
from app.schemas.jd_plan import source_requirements


MODEL_FILES = frozenset({
    "model.safetensors", "modules.json", "config.json", "config_sentence_transformers.json",
    "sentence_bert_config.json", "tokenizer_config.json", "tokenizer.json", "special_tokens_map.json",
    "README.md", "1_Pooling/config.json",
})
_MODULES = [
    {"idx": 0, "name": "0", "path": "", "type": "sentence_transformers.models.Transformer"},
    {"idx": 1, "name": "1", "path": "1_Pooling", "type": "sentence_transformers.models.Pooling"},
]
_SAFETY = {"automatically_supported": False, "candidate_rejected": False, "requires_manual_review": True}


class M1InputError(ValueError):
    """A request exceeds the fixed local retrieval contract."""


def _sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _is_link(path):
    """Reject links on 3.11 too, including Windows junction/reparse points."""
    if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
        return True
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except FileNotFoundError:
        return False
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def _validate_reference(manifest):
    threshold = manifest["pair_reference_threshold"]
    if (not manifest["model_version"] or manifest["model_version"] in {"lexical-fallback", "semantic-disabled"}
            or not re.fullmatch(r"[0-9a-f]{64}", manifest["weights_sha256"])
            or isinstance(threshold, bool) or not isinstance(threshold, (int, float))
            or not math.isfinite(threshold) or not 0 <= threshold <= 100):
        raise ValueError("Explicit verified model and train-only pair reference required")


def verify_manifest(path, expected_manifest_sha256):
    """Bind the manifest bytes and every artifact before importing model loaders."""
    if not isinstance(expected_manifest_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_manifest_sha256):
        raise ValueError("Explicit manifest SHA256 required")
    path = Path(path).absolute()
    if any(_is_link(p) for p in (path, *path.parents)):
        raise ValueError("Manifest path must not use symlinks or junctions")
    path = path.resolve(strict=True)
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_manifest_sha256:
        raise ValueError("Manifest checksum mismatch")
    manifest = json.loads(raw)
    try:
        if (manifest["schema"] != "nexhire-ai1-shadow-deployment-v1" or manifest["scope"] != "shadow_only"
                or manifest["production_approved"] is not False or manifest["max_sequence_length"] != 256
                or manifest["embedding_dimension"] != 384 or manifest["threshold_fit_split"] != "train"
                or set(manifest["artifact_sha256"]) != MODEL_FILES):
            raise ValueError("A complete fixed-context shadow-only manifest is required")
        _validate_reference(manifest)
        relative = PurePosixPath(manifest["model_path"])
        if (relative.is_absolute() or ".." in relative.parts or "\\" in str(relative)
                or ":" in str(relative) or not relative.parts):
            raise ValueError("Model must be a relative directory inside the deployment")
        model = path.parent.joinpath(*relative.parts)
        if (not model.resolve().is_relative_to(path.parent)
                or any(_is_link(p) for p in (model, *model.parents))):
            raise ValueError("Model path must not escape deployment or use symlinks")
        entries = list(model.rglob("*"))
        actual = {p.relative_to(model).as_posix() for p in entries if p.is_file()}
        if actual != MODEL_FILES or any(_is_link(p) for p in entries):
            raise ValueError("Only the verified safetensors model files may be loaded")
        for name, expected in manifest["artifact_sha256"].items():
            if _sha256(model / name) != expected:
                raise ValueError("Model checksum mismatch")
        if manifest["weights_sha256"] != manifest["artifact_sha256"]["model.safetensors"]:
            raise ValueError("Weight binding mismatch")
        if json.loads((model / "modules.json").read_text(encoding="utf-8")) != _MODULES:
            raise ValueError("Only the verified Transformer/Pooling architecture is supported")
    except (KeyError, TypeError) as exc:
        raise ValueError("Invalid local M1 manifest") from exc
    return manifest, model


def _negation_cue(requirement, passage):
    requirement, passage = norm(requirement), norm(passage)
    if len(requirement) > 60 or not 1 <= len(requirement.split()) <= 3:
        return False
    prefix = (r"(?:\bno (?:prior |professional )?experience (?:with|in)|"
              r"\bnot (?:proficient|experienced) (?:with|in)|"
              r"kh\u00f4ng c\u00f3 kinh nghi\u1ec7m (?:v\u1edbi|v\u1ec1)|"
              r"ch\u01b0a t\u1eebng d\u00f9ng)\s+")
    return bool(re.search(prefix + re.escape(requirement) + r"(?![\w+#])", passage))


class LocalM1Runtime:
    def __init__(self, model, manifest):
        _validate_reference(manifest)
        self.model, self.manifest = model, manifest
        self.model_version = manifest["model_version"]

    @classmethod
    def from_manifest(cls, path, expected_manifest_sha256):
        manifest, directory = verify_manifest(path, expected_manifest_sha256)
        import torch
        from sentence_transformers import SentenceTransformer

        torch.set_num_threads(4)
        model = SentenceTransformer(
            str(directory), device="cpu", trust_remote_code=False, local_files_only=True,
            model_kwargs={"use_safetensors": True, "local_files_only": True},
            tokenizer_kwargs={"local_files_only": True}, config_kwargs={"local_files_only": True},
        )
        model.eval()
        if model.max_seq_length != 256 or model.get_sentence_embedding_dimension() != 384:
            raise ValueError("Loaded encoder context or dimension differs from verified checkpoint")
        return cls(model, manifest)

    def score(self, job, candidate):
        import numpy as np

        started = time.perf_counter()
        requirements = [{"id": r.id, "text": r.text,
                         "source": "skill" if r.id.startswith("skills/") else
                         "unreviewed_description" if r.id.startswith("description/") else "requirements"}
                        for r in source_requirements(job)]
        evidence = RequirementMatcher(None)._build_evidence(candidate)
        if len(requirements) > 64 or len(evidence) > 256:
            raise M1InputError("Shadow request exceeds requirement/evidence limits")
        texts = sorted({norm(r["text"]) for r in requirements} | {norm(e.original_text or e.text) for e in evidence})
        if any(len(t) > 5000 for t in texts):
            raise M1InputError("Shadow passage exceeds 5000 characters")
        truncated, vectors = 0, {}
        if requirements and evidence:
            lengths = self.model.tokenizer(texts, truncation=False, padding=False, verbose=False)["input_ids"]
            truncated = sum(len(t) > 256 for t in lengths)
            encoded = self.model.encode(texts, normalize_embeddings=True, batch_size=16, show_progress_bar=False)
            if len(encoded) != len(texts):
                raise RuntimeError("Incomplete embedding batch")
            encoded = np.asarray(encoded)
            if encoded.shape != (len(texts), 384) or not np.isfinite(encoded).all():
                raise ValueError("Invalid encoder output")
            vectors = dict(zip(texts, encoded))
        ids = [e.id for e in evidence]
        if requirements and (any(not i for i in ids) or len(ids) != len(set(ids))):
            raise ValueError("Evidence IDs must be unique and nonempty")
        matches = []
        for requirement in requirements:
            if not requirement["id"] or not norm(requirement["text"]):
                raise ValueError("A stable requirement ID and original text are required")
            reasons = ["RETRIEVAL_IS_NOT_ENTAILMENT", "PAIR_THRESHOLD_NOT_RETRIEVAL_CALIBRATED"]
            fallback = requirement["source"] == "unreviewed_description"
            if fallback:
                reasons.append("UNREVIEWED_DESCRIPTION_FALLBACK")
            hits, missing = [], False
            for item in evidence:
                text = item.original_text or item.text
                if not norm(text):
                    missing = True
                    continue
                cosine = float(np.dot(vectors[norm(requirement["text"])], vectors[norm(text)]))
                if not math.isfinite(cosine) or not -1.000001 <= cosine <= 1.000001:
                    raise ValueError("Invalid encoder output")
                signal = (max(-1., min(1., cosine)) + 1) * 50
                hits.append({"id": item.id, "text": text, "source": item.source,
                             "comparison_score": signal,
                             "above_pair_reference": round(signal, 2) >= self.manifest["pair_reference_threshold"],
                             "reason_codes": ("EXPLICIT_NEGATION_CUE",) if _negation_cue(requirement["text"], text) else ()})
            if missing:
                reasons.append("INCOMPLETE_SEMANTIC_SCORING")
            hits.sort(key=lambda h: (-h["comparison_score"], h["id"]))
            if not evidence:
                status = "NO_EVIDENCE"
            elif not hits:
                status = "SCORER_UNAVAILABLE"
            elif missing or hits[0]["reason_codes"] or fallback:
                status = "REVIEW_REQUIRED"
            else:
                status = "CANDIDATE_EVIDENCE" if hits[0]["above_pair_reference"] else "INSUFFICIENT_SIGNAL"
            matches.append({"requirement": requirement, "status": status, "hits": tuple(hits[:3]),
                            "ranked_evidence_ids": tuple(h["id"] for h in hits), "reason_codes": tuple(reasons),
                            "policy_version": "requirement-retrieval-shadow-v1", **_SAFETY})
        return {"mode": "shadow", "model_version": self.model_version,
                "weights_sha256": self.manifest["weights_sha256"], "requirements": matches,
                "diagnostics": {"unique_texts": len(texts), "truncated_texts": truncated,
                                "inference_seconds": time.perf_counter() - started, "device": "cpu"},
                **_SAFETY, "is_training_label": False, "production_changed": False}
