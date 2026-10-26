"""Verified local encoder for isolated shadow requests, without lexical fallback."""

from dataclasses import asdict
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import time

from app.matching.normalizer import normalize_semantic_text as norm
from app.experimental.shadow_requirement_matcher import ShadowPolicy, ShadowRequirementMatcher

MODEL_FILES = {"model.safetensors", "modules.json", "config.json", "config_sentence_transformers.json",
    "sentence_bert_config.json", "tokenizer_config.json", "tokenizer.json", "special_tokens_map.json",
    "README.md", "1_Pooling/config.json"}


class ShadowInputError(ValueError):
    pass


def checksum(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_manifest(path):
    path = Path(path).resolve()
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if (manifest["schema"] != "nexhire-ai1-shadow-deployment-v1" or manifest["scope"] != "shadow_only"
            or manifest["production_approved"] is not False or manifest["max_sequence_length"] != 256
            or manifest["embedding_dimension"] != 384 or manifest["threshold_fit_split"] != "train"
            or set(manifest["artifact_sha256"]) != MODEL_FILES):
        raise ValueError("A complete fixed-context shadow-only manifest is required")
    relative = PurePosixPath(manifest["model_path"])
    if relative.is_absolute() or ".." in relative.parts or "\\" in str(relative) or ":" in str(relative):
        raise ValueError("Model must be a relative directory inside the deployment")
    model = path.parent.joinpath(*relative.parts)
    if not model.resolve().is_relative_to(path.parent) or any(p.is_symlink() for p in (model, *model.parents) if p != path.parent):
        raise ValueError("Model path must not escape deployment or use symlinks")
    actual = {p.relative_to(model).as_posix() for p in model.rglob("*") if p.is_file()}
    if actual != MODEL_FILES or any(p.is_symlink() for p in model.rglob("*")):
        raise ValueError("Only the verified safetensors model files may be loaded")
    for name, expected in manifest["artifact_sha256"].items():
        if checksum(model / name) != expected:
            raise ValueError("Model checksum mismatch")
    if manifest["weights_sha256"] != manifest["artifact_sha256"]["model.safetensors"]:
        raise ValueError("Weight binding mismatch")
    modules = json.loads((model / "modules.json").read_text(encoding="utf-8"))
    if modules != [{"idx": 0, "name": "0", "path": "", "type": "sentence_transformers.models.Transformer"},
                   {"idx": 1, "name": "1", "path": "1_Pooling", "type": "sentence_transformers.models.Pooling"}]:
        raise ValueError("Only the verified Transformer/Pooling architecture is supported")
    ShadowPolicy(manifest["model_version"], manifest["weights_sha256"], manifest["pair_reference_threshold"])
    return manifest, model


class _BatchScorer:
    def __init__(self, version, vectors):
        self.model_version, self.vectors = version, vectors

    def score_text_pair(self, left, right):
        import numpy as np
        cosine = float(np.dot(self.vectors[norm(left)], self.vectors[norm(right)]))
        if not math.isfinite(cosine) or not -1.000001 <= cosine <= 1.000001:
            raise ValueError("Invalid encoder output")
        return (max(-1., min(1., cosine)) + 1) * 50


class ShadowEncoder:
    def __init__(self, model, manifest):
        self.model, self.manifest = model, manifest
        self.model_version = manifest["model_version"]
        self.policy = ShadowPolicy(self.model_version, manifest["weights_sha256"], manifest["pair_reference_threshold"])

    @classmethod
    def from_manifest(cls, path):
        manifest, directory = verify_manifest(path)
        os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", USE_TF="0", USE_FLAX="0",
            TOKENIZERS_PARALLELISM="false")
        import torch
        from sentence_transformers import SentenceTransformer
        torch.set_num_threads(4)
        model = SentenceTransformer(str(directory), device="cpu", trust_remote_code=False,
            model_kwargs={"use_safetensors": True, "local_files_only": True})
        model.eval()
        if model.max_seq_length != 256 or model.get_sentence_embedding_dimension() != 384:
            raise ValueError("Loaded encoder context or dimension differs from verified checkpoint")
        return cls(model, manifest)

    def score(self, job, candidate):
        started = time.perf_counter()
        scorer = _BatchScorer(self.model_version, {})
        matcher = ShadowRequirementMatcher(scorer, self.policy)
        requirements, evidence = matcher.build_requirements(job), matcher.build_evidence(candidate)
        if len(requirements) > 64 or len(evidence) > 256:
            raise ShadowInputError("Shadow request exceeds requirement/evidence limits")
        texts = sorted({norm(r.text) for r in requirements} | {norm(e.original_text or e.text) for e in evidence})
        if any(len(t) > 5000 for t in texts):
            raise ShadowInputError("Shadow passage exceeds 5000 characters")
        truncated = 0
        if requirements and evidence:
            lengths = self.model.tokenizer(texts, truncation=False, padding=False, verbose=False)["input_ids"]
            truncated = sum(len(t) > 256 for t in lengths)
            encoded = self.model.encode(texts, normalize_embeddings=True, batch_size=16, show_progress_bar=False)
            if len(encoded) != len(texts):
                raise RuntimeError("Incomplete embedding batch")
            scorer.vectors = dict(zip(texts, encoded))
        matches = [asdict(matcher.match(r, evidence)) for r in requirements]
        # No embedding cache, input text or per-person state survives this request.
        return {"mode": "shadow", "model_version": self.model_version,
            "weights_sha256": self.manifest["weights_sha256"], "requirements": matches,
            "diagnostics": {"unique_texts": len(texts), "truncated_texts": truncated,
                "inference_seconds": time.perf_counter() - started, "device": "cpu"},
            "automatically_supported": False, "candidate_rejected": False,
            "requires_manual_review": True, "is_training_label": False, "production_changed": False}
