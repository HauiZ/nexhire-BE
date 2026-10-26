"""Local M1 parity and fail-closed artifact checks without loading weights."""

import hashlib
import inspect
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

from app.experimental.shadow_runtime import ShadowEncoder
from app.matching.m1_runtime import LocalM1Runtime, M1InputError, MODEL_FILES, _is_link, verify_manifest
from app.matching.normalizer import normalize_semantic_text
from app.matching.requirement_matcher import Evidence
from app.schemas.snapshots import CandidateMatchingSnapshot, JobMatchingSnapshot


class FakeModel:
    max_seq_length = 256

    def __init__(self, vectors=None):
        self.vectors = vectors or {}
        self.calls = []

    def eval(self):
        self.evaluated = True

    def get_sentence_embedding_dimension(self):
        return 384

    def tokenizer(self, texts, **kwargs):
        self.calls.append(("tokenizer", list(texts), kwargs))
        return {"input_ids": [[1] * (300 if "long" in t else 3) for t in texts]}

    def encode(self, texts, **kwargs):
        self.calls.append(("encode", list(texts), kwargs))
        result = np.zeros((len(texts), 384), dtype=np.float32)
        for index, text in enumerate(texts):
            pair = self.vectors.get(text, (1., 0.))
            result[index, :2] = pair
        return result


def manifest():
    return {"schema": "nexhire-ai1-shadow-deployment-v1", "scope": "shadow_only",
            "production_approved": False, "max_sequence_length": 256, "embedding_dimension": 384,
            "threshold_fit_split": "train", "model_path": "models/arm", "weights_sha256": "a" * 64,
            "artifact_sha256": {}, "model_version": "unit-verified", "pair_reference_threshold": 67}


def job(**changes):
    return JobMatchingSnapshot(**{**dict(id="j", title="Engineer", description="", requirements="",
        skills=["Python"], workingType="", experienceLevel="", location=""), **changes})


class LocalM1ParityTests(unittest.TestCase):
    def compare(self, jd, candidate, vectors=None, reference=67):
        config = {**manifest(), "pair_reference_threshold": reference}
        model = FakeModel(vectors)
        runtime = LocalM1Runtime(model, config)
        actual = runtime.score(jd, candidate)
        expected = ShadowEncoder(FakeModel(vectors), config).score(jd, candidate)
        for result in (actual, expected):
            self.assertGreaterEqual(result["diagnostics"].pop("inference_seconds"), 0)
        self.assertEqual(actual, expected)
        self.assertEqual(set(vars(runtime)), {"model", "manifest", "model_version"})
        return actual, model

    def test_source_ids_html_original_text_top_three_tie_order_and_diagnostics(self):
        candidate = CandidateMatchingSnapshot(candidateId="c", skills=[{"id": "z", "name": "PYTHON"}],
            projects=[{"id": "p", "description": "Long Python project", "technologies": ["SQL", "C++"]}],
            experiences=[{"id": "a", "description": "Built Python APIs"}], summary="Python profile")
        result, model = self.compare(job(skills=["", " Python "],
            requirements="<ul><li>C++, .NET; SQL.</li><li>5 years.</li></ul><script>hidden</script>"), candidate)
        self.assertEqual([r["requirement"]["id"] for r in result["requirements"]],
                         ["skills/1", "requirements/0", "requirements/1"])
        first = result["requirements"][0]
        self.assertEqual(first["ranked_evidence_ids"], ("a", "p", "p/technologies/0", "p/technologies/1", "profile/summary", "z"))
        self.assertEqual(len(first["hits"]), 3)
        self.assertEqual(result["diagnostics"]["truncated_texts"], 1)
        texts = model.calls[1][1]
        self.assertEqual(texts, sorted(set(texts)))
        self.assertEqual(texts, [normalize_semantic_text(t) for t in texts])
        self.assertEqual(model.calls[1][2], {"normalize_embeddings": True, "batch_size": 16, "show_progress_bar": False})
        self.assertFalse(result["is_training_label"])
        self.assertFalse(first["automatically_supported"])

    def test_negation_warning_in_both_languages_and_target_boundaries(self):
        for skill, text, warning in [("Python", "No experience with Python", True),
                                    ("Python", "Không có kinh nghiệm với Python", True),
                                    ("Java", "No experience with JavaScript", False)]:
            with self.subTest(text=text):
                result, _ = self.compare(job(skills=[skill]), CandidateMatchingSnapshot(candidateId="c", summary=text))
                hit = result["requirements"][0]
                self.assertEqual(hit["status"], "REVIEW_REQUIRED" if warning else "CANDIDATE_EVIDENCE")

    def test_empty_evidence_empty_job_and_unreviewed_description(self):
        for jd, cv in [(job(), CandidateMatchingSnapshot(candidateId="c")),
                       (job(skills=[]), CandidateMatchingSnapshot(candidateId="c", summary="Python")),
                       (job(skills=[], description="<p>Benefits; Python.</p>"),
                        CandidateMatchingSnapshot(candidateId="c", summary="Python"))]:
            self.compare(jd, cv)

    def test_cosine_score_and_train_reference_rounding(self):
        candidate = CandidateMatchingSnapshot(candidateId="c", summary="Other")
        result, _ = self.compare(job(), candidate, {"other": (-1., 0.)})
        self.assertEqual(result["requirements"][0]["status"], "INSUFFICIENT_SIGNAL")
        self.assertEqual(result["requirements"][0]["hits"][0]["comparison_score"], 0)
        result, _ = self.compare(job(), candidate, {"other": (0.33992, 0.94045)}, reference=67)
        self.assertTrue(result["requirements"][0]["hits"][0]["above_pair_reference"])

    def test_requests_do_not_reuse_vectors(self):
        model = FakeModel()
        runtime = LocalM1Runtime(model, manifest())
        runtime.score(job(), CandidateMatchingSnapshot(candidateId="one", summary="Private first"))
        runtime.score(job(), CandidateMatchingSnapshot(candidateId="two", summary="Private second"))
        self.assertNotIn("private first", model.calls[-1][1])
        self.assertEqual(len(model.calls), 4)

    def test_incomplete_and_unavailable_retrieval_status_parity(self):
        for evidence in ([Evidence(" ", "skill", " ", "blank")],
                         [Evidence(" ", "skill", " ", "blank"), Evidence("Python", "skill", "Python", "p")]):
            with patch("app.matching.requirement_matcher.RequirementMatcher._build_evidence", return_value=evidence):
                result, _ = self.compare(job(), CandidateMatchingSnapshot(candidateId="c"))
            match = result["requirements"][0]
            self.assertEqual(match["status"], "SCORER_UNAVAILABLE" if len(evidence) == 1 else "REVIEW_REQUIRED")
            self.assertIn("INCOMPLETE_SEMANTIC_SCORING", match["reason_codes"])

    def test_limits_duplicate_ids_and_encoder_failures_never_fallback(self):
        runtime = LocalM1Runtime(FakeModel(), manifest())
        for jd, cv in [(job(skills=["x"] * 65), CandidateMatchingSnapshot(candidateId="c")),
                       (job(), CandidateMatchingSnapshot(candidateId="c", summary="x" * 5001)),
                       (job(), CandidateMatchingSnapshot(candidateId="c", skills=[{"name": "x"}] * 257))]:
            with self.assertRaises(M1InputError):
                runtime.score(jd, cv)
        with self.assertRaisesRegex(ValueError, "unique"):
            runtime.score(job(), CandidateMatchingSnapshot(candidateId="c", skills=[
                {"id": "same", "name": "Python"}, {"id": "same", "name": "SQL"}]))
        for output in (np.zeros((0, 384)), np.zeros((2, 3)), np.full((2, 384), np.nan), np.ones((2, 384))):
            with patch.object(runtime.model, "encode", return_value=output), self.assertRaises((ValueError, RuntimeError)):
                runtime.score(job(), CandidateMatchingSnapshot(candidateId="c", summary="Other"))
        with patch.object(runtime.model, "encode", side_effect=RuntimeError("unavailable")), self.assertRaises(RuntimeError):
            runtime.score(job(), CandidateMatchingSnapshot(candidateId="c", summary="Python"))


class LocalM1ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.model = self.root / "models/arm"
        modules = [{"idx": 0, "name": "0", "path": "", "type": "sentence_transformers.models.Transformer"},
                   {"idx": 1, "name": "1", "path": "1_Pooling", "type": "sentence_transformers.models.Pooling"}]
        for name in MODEL_FILES:
            target = self.model / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(modules) if name == "modules.json" else "{}", encoding="utf-8")
        self.config = manifest()
        self.config["artifact_sha256"] = {n: hashlib.sha256((self.model / n).read_bytes()).hexdigest() for n in MODEL_FILES}
        self.config["weights_sha256"] = self.config["artifact_sha256"]["model.safetensors"]
        self.path = self.root / "manifest.json"
        self.save()

    def save(self):
        self.path.write_text(json.dumps(self.config), encoding="utf-8")
        self.sha = hashlib.sha256(self.path.read_bytes()).hexdigest()

    def test_loader_is_cpu_offline_safetensors_and_does_not_change_environment(self):
        from sentence_transformers import SentenceTransformer

        signature = inspect.signature(SentenceTransformer)
        before = dict(os.environ)
        model = FakeModel()
        with patch("sentence_transformers.SentenceTransformer", return_value=model) as loader, patch("torch.set_num_threads") as threads:
            runtime = LocalM1Runtime.from_manifest(self.path, self.sha)
        self.assertEqual(runtime.model_version, self.config["model_version"])
        self.assertEqual(runtime.manifest, self.config)
        self.assertTrue(model.evaluated)
        threads.assert_called_once_with(4)
        kwargs = loader.call_args.kwargs
        # Bind against the real installed constructor, not a permissive Mock.
        signature.bind(*loader.call_args.args, **kwargs)
        self.assertEqual(kwargs["device"], "cpu")
        self.assertFalse(kwargs["trust_remote_code"])
        self.assertTrue(kwargs["local_files_only"])
        self.assertEqual(kwargs["model_kwargs"], {"use_safetensors": True, "local_files_only": True})
        self.assertEqual(kwargs["tokenizer_kwargs"], {"local_files_only": True})
        self.assertEqual(kwargs["config_kwargs"], {"local_files_only": True})
        self.assertEqual(dict(os.environ), before)

    def test_manifest_pin_required_and_tamper_rejected_before_loader(self):
        with patch("sentence_transformers.SentenceTransformer") as loader:
            for sha in (None, "", "invalid", "0" * 64):
                with self.subTest(sha=sha), self.assertRaises(ValueError):
                    LocalM1Runtime.from_manifest(self.path, sha)
            loader.assert_not_called()
        old_sha = self.sha
        self.config["pair_reference_threshold"] = 99
        self.save()
        with self.assertRaisesRegex(ValueError, "Manifest checksum"):
            verify_manifest(self.path, old_sha)

    def test_every_artifact_checksum_is_verified(self):
        for name in MODEL_FILES:
            target = self.model / name
            original = target.read_bytes()
            target.write_bytes(b"tampered")
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "checksum"):
                verify_manifest(self.path, self.sha)
            target.write_bytes(original)

    def test_escape_paths_and_extra_files_rejected(self):
        for value in ("../arm", "/tmp/arm", "C:/arm", "models\\arm", ""):
            self.config["model_path"] = value
            self.save()
            with self.subTest(path=value), self.assertRaisesRegex(ValueError, "relative"):
                verify_manifest(self.path, self.sha)
        self.config["model_path"] = "models/arm"
        self.save()
        (self.model / "pytorch_model.bin").write_bytes(b"untrusted")
        with self.assertRaisesRegex(ValueError, "safetensors"):
            verify_manifest(self.path, self.sha)

    def test_schema_safety_context_reference_and_weight_binding(self):
        original = self.config.copy()
        for field, value in [("schema", "other"), ("scope", "production"), ("production_approved", True),
                             ("production_approved", 0), ("embedding_dimension", 768), ("max_sequence_length", 512),
                             ("threshold_fit_split", "test"), ("pair_reference_threshold", True),
                             ("pair_reference_threshold", float("nan")), ("weights_sha256", "b" * 64),
                             ("model_version", "lexical-fallback")]:
            self.config = {**original, field: value}
            self.save()
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                verify_manifest(self.path, self.sha)

    def test_custom_modules_rejected_even_with_updated_hash(self):
        target = self.model / "modules.json"
        target.write_text('[{"type": "custom.RemoteCode"}]', encoding="utf-8")
        self.config["artifact_sha256"]["modules.json"] = hashlib.sha256(target.read_bytes()).hexdigest()
        self.save()
        with self.assertRaisesRegex(ValueError, "architecture"):
            verify_manifest(self.path, self.sha)

    def test_missing_artifact_rejected(self):
        (self.model / "tokenizer.json").unlink()
        with self.assertRaisesRegex(ValueError, "safetensors"):
            verify_manifest(self.path, self.sha)

    def test_link_guard_without_os_symlink_privilege(self):
        original = Path.is_symlink
        for linked in (self.path, self.model, self.model / "README.md"):
            with self.subTest(linked=linked), \
                    patch.object(Path, "is_symlink", lambda p: p == linked or original(p)), \
                    self.assertRaises(ValueError):
                verify_manifest(self.path, self.sha)

    def test_python311_missing_junction_method_and_windows_reparse_guard(self):
        def missing_method(_):
            raise AttributeError("Python 3.11 has no Path.is_junction")

        with patch.object(Path, "is_junction", property(missing_method), create=True):
            loaded, _ = verify_manifest(self.path, self.sha)
            self.assertEqual(loaded, self.config)
            original_lstat = Path.lstat
            for linked in (self.path, self.model, self.model / "README.md"):
                def lstat(path, *, _linked=linked):
                    if path == _linked:
                        return SimpleNamespace(st_file_attributes=getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))
                    return original_lstat(path)

                # Exercise the reparse fallback directly: the synthetic stat has
                # only Windows attributes, without altering pathlib traversal.
                with self.subTest(linked=linked), patch.object(Path, "lstat", lstat), \
                        patch.object(Path, "is_symlink", return_value=False):
                    self.assertTrue(_is_link(linked))

    def test_native_junction_guard_is_preserved(self):
        for linked in (self.path, self.model, self.model / "README.md"):
            with self.subTest(linked=linked), \
                    patch.object(Path, "is_junction", lambda p: p == linked, create=True), \
                    self.assertRaises(ValueError):
                verify_manifest(self.path, self.sha)

    def test_missing_stat_reparse_constant_preserves_link_detection(self):
        with patch("app.matching.m1_runtime.stat", SimpleNamespace()):
            self.assertFalse(_is_link(SimpleNamespace(is_symlink=lambda: False, lstat=lambda: SimpleNamespace())))
            self.assertTrue(_is_link(SimpleNamespace(is_symlink=lambda: False,
                lstat=lambda: SimpleNamespace(st_file_attributes=0x400))))

    def test_symlink_rejected(self):
        target = self.model / "README.md"
        original = self.root / "original.md"
        original.write_bytes(target.read_bytes())
        target.unlink()
        try:
            target.symlink_to(original)
        except OSError:
            self.skipTest("OS does not permit unprivileged symlinks")
        with self.assertRaisesRegex(ValueError, "safetensors"):
            verify_manifest(self.path, self.sha)

    def test_loaded_context_and_dimension_must_match(self):
        for context, dimension in [(512, 384), (256, 768)]:
            model = FakeModel()
            model.max_seq_length = context
            with patch.object(model, "get_sentence_embedding_dimension", return_value=dimension), \
                    patch("sentence_transformers.SentenceTransformer", return_value=model), patch("torch.set_num_threads"), \
                    self.assertRaisesRegex(ValueError, "context or dimension"):
                LocalM1Runtime.from_manifest(self.path, self.sha)


if __name__ == "__main__":
    unittest.main()
