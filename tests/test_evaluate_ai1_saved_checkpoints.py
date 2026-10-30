import copy
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import pytest

# Test-first: import evaluate_ai1_saved_checkpoints
from scripts.evaluate_ai1_saved_checkpoints import (
    compute_sha256,
    directory_sha256_manifest,
    verify_bundle_manifest,
    load_experiment_results,
    resolve_arm_checkpoint_target,
    load_model_for_arm,
    build_eval_pools_with_unique_ids,
    evaluate_arm_model,
    compute_diagnostic_metrics,
    paired_job_bootstrap_eval,
    build_per_query_evidence_comparison,
    run_eval_only,
    safe_extract_results_archive,
    RefuseOverwriteError,
    SmokeExperimentError,
    MissingCheckpointError,
    PathTraversalError,
    NonFiniteScoreError,
    CheckpointValidationError,
    SafeArchiveError,
)


def test_refuse_smoke_experiment_summary(tmp_path):
    summary_path = tmp_path / "experiment_results.json"
    summary_path.write_text(json.dumps({
        "status": "COMPLETED",
        "smoke_synthetic": True,
        "execution_mode": "SMOKE_SYNTHETIC",
        "arms": {}
    }))
    with pytest.raises(SmokeExperimentError, match="Refusing smoke experiment"):
        load_experiment_results(summary_path)


def test_reject_uncompleted_experiment_summary(tmp_path):
    summary_path = tmp_path / "experiment_results.json"
    summary_path.write_text(json.dumps({
        "status": "FAILED",
        "smoke_synthetic": False,
        "execution_mode": "TORCH_REAL",
        "arms": {}
    }))
    with pytest.raises(ValueError, match="not COMPLETED"):
        load_experiment_results(summary_path)


def test_refuse_overwrite_existing_output_dir(tmp_path):
    out_dir = tmp_path / "existing_output"
    out_dir.mkdir()
    (out_dir / "some_file.txt").write_text("already exists")
    with pytest.raises(RefuseOverwriteError, match="Collision: output directory exists and is not empty"):
        # Calling run_eval_only with existing non-empty output_dir must fail closed
        run_eval_only(
            bundle_dir=tmp_path / "bundle",
            experiment_dir=tmp_path / "exp",
            output_dir=out_dir,
        )


def test_reject_path_traversal_checkpoint(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    summary = {
        "status": "COMPLETED",
        "smoke_synthetic": False,
        "execution_mode": "TORCH_REAL",
        "arms": {
            "Arm_C": {
                "selected_step": 50,
                "val_history": [{"step": 50}],
                "checkpoint_path": "/etc/passwd"
            }
        }
    }
    with pytest.raises(PathTraversalError, match="Path traversal or invalid checkpoint location"):
        resolve_arm_checkpoint_target("Arm_C", summary["arms"]["Arm_C"], exp_dir, tmp_path / "bundle" / "model")


def test_missing_checkpoint_fails_without_fallback(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    summary = {
        "status": "COMPLETED",
        "smoke_synthetic": False,
        "execution_mode": "TORCH_REAL",
        "arms": {
            "Arm_C": {
                "selected_step": 50,
                "val_history": [{"step": 50}],
                "checkpoint_path": str(exp_dir / "checkpoints" / "Arm_C" / "step_50")
            }
        }
    }
    # Checkpoint dir does NOT exist on disk -> must raise MissingCheckpointError, no fallback!
    with pytest.raises(MissingCheckpointError, match="Checkpoint directory missing on disk"):
        resolve_arm_checkpoint_target("Arm_C", summary["arms"]["Arm_C"], exp_dir, tmp_path / "bundle" / "model")


def test_manifest_verification_tamper_fails(tmp_path):
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    f1 = bundle / "file1.txt"
    f1.write_text("clean")
    h1 = hashlib.sha256(b"clean").hexdigest()
    manifest = {
        "artifacts": {
            "file1.txt": h1
        }
    }
    (bundle / "manifest.json").write_text(json.dumps(manifest))
    # Verify passes
    verify_bundle_manifest(bundle)

    # Tamper f1
    f1.write_text("tampered")
    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        verify_bundle_manifest(bundle)

    # Add unexpected file
    f1.write_text("clean")
    (bundle / "evil.py").write_text("import os; os.system('bad')")
    with pytest.raises(ValueError, match="Unexpected file not listed in manifest"):
        verify_bundle_manifest(bundle)


def test_unique_evidence_id_resolves_duplicate_candidate_id():
    """Duplicate candidate_id across rows in same query must be resolved via unique evidence ID."""
    records = [
        {
            "split": "test",
            "job_id": "job1",
            "requirement_id": "req1@en",
            "requirement": "Requires Python expertise",
            "candidate_id": "cand_A",
            "evidence_id": "e01",
            "record_id": "rec_001",
            "evidence": "Experienced Python developer for 5 years",
            "label": 1
        },
        {
            "split": "test",
            "job_id": "job1",
            "requirement_id": "req1@en",
            "requirement": "Requires Python expertise",
            "candidate_id": "cand_A",  # Duplicate candidate_id
            "evidence_id": "e02",      # Different evidence_id
            "record_id": "rec_002",
            "evidence": "Led Python data science team",
            "label": 1
        },
        {
            "split": "test",
            "job_id": "job1",
            "requirement_id": "req1@en",
            "requirement": "Requires Python expertise",
            "candidate_id": "cand_B",
            "evidence_id": "e03",
            "record_id": "rec_003",
            "evidence": "Graphic designer with Photoshop experience",
            "label": 0
        }
    ]
    pools = build_eval_pools_with_unique_ids(records, "test")
    assert len(pools) == 1
    query = pools[0]
    assert query["pool_size"] == 3
    # Check that each candidate has a unique_evidence_key and distinct record_id
    keys = [c["unique_evidence_key"] for c in query["candidates"]]
    assert len(keys) == 3
    assert len(set(keys)) == 3
    assert keys[0] == "cand_A::e01::rec_001"
    assert keys[1] == "cand_A::e02::rec_002"
    assert keys[2] == "cand_B::e03::rec_003"


def test_hand_calculated_metrics_all_and_mixed():
    """Verify hand-calculated MRR, Hit@1/3, Recall@1/3 for all queries, mixed-only, positive-only, no-positive."""
    scored_queries = [
        # Query 1: mixed-label (cand1 pos, cand2 neg). Top-1 is pos.
        {
            "job_id": "jobA",
            "requirement_id": "r1",
            "candidates": [
                {"unique_evidence_key": "k1", "label": 1, "score": 0.8},
                {"unique_evidence_key": "k2", "label": 0, "score": 0.3},
            ]
        },
        # Query 2: mixed-label (cand3 neg, cand4 pos). Top-1 is neg, rank of first pos is 2.
        {
            "job_id": "jobA",
            "requirement_id": "r2",
            "candidates": [
                {"unique_evidence_key": "k3", "label": 0, "score": 0.9},
                {"unique_evidence_key": "k4", "label": 1, "score": 0.5},
            ]
        },
        # Query 3: positive-only (cand5 pos, cand6 pos). Both pos.
        {
            "job_id": "jobB",
            "requirement_id": "r3",
            "candidates": [
                {"unique_evidence_key": "k5", "label": 1, "score": 0.7},
                {"unique_evidence_key": "k6", "label": 1, "score": 0.6},
            ]
        },
        # Query 4: no-positive (cand7 neg). Excluded from positive metrics.
        {
            "job_id": "jobB",
            "requirement_id": "r4",
            "candidates": [
                {"unique_evidence_key": "k7", "label": 0, "score": 0.4},
            ]
        }
    ]

    metrics = compute_diagnostic_metrics(scored_queries)

    # Evaluated queries: Q1, Q2, Q3 (3 queries, no-positive is Q4)
    # Q1: first_rank=1 -> MRR=1.0, Hit1=1.0, Hit3=1.0, Recall1=1/1=1.0, Recall3=1/1=1.0
    # Q2: first_rank=2 -> MRR=0.5, Hit1=0.0, Hit3=1.0, Recall1=0/1=0.0, Recall3=1/1=1.0
    # Q3: first_rank=1 -> MRR=1.0, Hit1=1.0, Hit3=1.0, Recall1=1/2=0.5, Recall3=2/2=1.0
    # Micro all positive (Q1, Q2, Q3):
    # MRR: (1.0 + 0.5 + 1.0) / 3 = 2.5 / 3 = 0.8333333333333334
    # Hit1: (1.0 + 0.0 + 1.0) / 3 = 2 / 3 = 0.6666666666666666
    # Hit3: (1.0 + 1.0 + 1.0) / 3 = 1.0
    # Recall1: (1.0 + 0.0 + 0.5) / 3 = 1.5 / 3 = 0.5
    # Recall3: (1.0 + 1.0 + 1.0) / 3 = 1.0
    assert metrics["all_positive"]["micro"]["mrr"] == pytest.approx(2.5 / 3)
    assert metrics["all_positive"]["micro"]["hit1"] == pytest.approx(2.0 / 3)
    assert metrics["all_positive"]["micro"]["hit3"] == pytest.approx(1.0)
    assert metrics["all_positive"]["micro"]["recall1"] == pytest.approx(0.5)
    assert metrics["all_positive"]["micro"]["recall3"] == pytest.approx(1.0)

    # Job macro:
    # JobA has Q1 (MRR=1.0, Hit1=1.0, Hit3=1.0, Rec1=1.0, Rec3=1.0) and Q2 (MRR=0.5, Hit1=0.0, Hit3=1.0, Rec1=0.0, Rec3=1.0)
    # JobA avg: MRR=0.75, Hit1=0.5, Hit3=1.0, Rec1=0.5, Rec3=1.0
    # JobB has Q3 (MRR=1.0, Hit1=1.0, Hit3=1.0, Rec1=0.5, Rec3=1.0)
    # JobB avg: MRR=1.0, Hit1=1.0, Hit3=1.0, Rec1=0.5, Rec3=1.0
    # Job macro (avg of JobA and JobB):
    # MRR: (0.75 + 1.0) / 2 = 0.875
    # Hit1: (0.5 + 1.0) / 2 = 0.75
    # Hit3: 1.0
    # Rec1: (0.5 + 0.5) / 2 = 0.5
    # Rec3: 1.0
    assert metrics["all_positive"]["macro_job"]["mrr"] == pytest.approx(0.875)
    assert metrics["all_positive"]["macro_job"]["hit1"] == pytest.approx(0.75)
    assert metrics["all_positive"]["macro_job"]["hit3"] == pytest.approx(1.0)
    assert metrics["all_positive"]["macro_job"]["recall1"] == pytest.approx(0.5)
    assert metrics["all_positive"]["macro_job"]["recall3"] == pytest.approx(1.0)

    # Mixed-only: Q1 and Q2 only!
    # Micro mixed: MRR=(1.0+0.5)/2=0.75, Hit1=0.5, Hit3=1.0, Rec1=0.5, Rec3=1.0
    assert metrics["mixed_only"]["micro"]["mrr"] == pytest.approx(0.75)
    assert metrics["mixed_only"]["micro"]["hit1"] == pytest.approx(0.5)
    # Macro job mixed: Only JobA has mixed queries! JobB has 0 mixed queries.
    # JobA macro = 0.75
    assert metrics["mixed_only"]["macro_job"]["mrr"] == pytest.approx(0.75)
    assert metrics["mixed_only"]["macro_job"]["job_count"] == 1


def test_reject_nonfinite_scores():
    candidates = [
        {"unique_evidence_key": "k1", "label": 1, "score": float("nan")},
        {"unique_evidence_key": "k2", "label": 0, "score": 0.5},
    ]
    with pytest.raises(NonFiniteScoreError, match="Non-finite cosine score detected"):
        compute_diagnostic_metrics([{"job_id": "j1", "requirement_id": "r1", "candidates": candidates}])


def test_pairwise_ordering_and_tie_tracking():
    scored_queries = [
        {
            "job_id": "j1",
            "requirement_id": "r1",
            "candidates": [
                {"unique_evidence_key": "k1", "label": 1, "score": 0.8},
                {"unique_evidence_key": "k2", "label": 1, "score": 0.8}, # positive tie
                {"unique_evidence_key": "k3", "label": 0, "score": 0.5}, # positive > negative
                {"unique_evidence_key": "k4", "label": 0, "score": 0.5}, # negative tie
            ]
        }
    ]
    metrics = compute_diagnostic_metrics(scored_queries)
    pw = metrics["pairwise_ordering"]
    # pos_neg pairs: (k1, k3) [1>0 win], (k1, k4) [1>0 win], (k2, k3) [1>0 win], (k2, k4) [1>0 win]
    assert pw["pos_neg_pairs"] == 4
    assert pw["pos_beats_neg"] == 4
    assert pw["pos_loses_neg"] == 0
    assert pw["pos_neg_ties"] == 0
    assert pw["total_score_ties"] == 2  # (k1, k2) and (k3, k4)


def test_tiny_local_transformer_fixture_eval_only_step0_and_step50(tmp_path):
    """Assert tiny real local transformer fixture runs eval-only, no optimizer/backward/training called."""
    import torch
    from transformers import BertConfig, BertModel, BertTokenizerFast

    # Create tiny dummy bert model & tokenizer
    config = BertConfig(
        vocab_size=100,
        hidden_size=16,
        num_hidden_layers=1,
        num_attention_heads=2,
        intermediate_size=32,
        max_position_embeddings=64,
    )
    model = BertModel(config)
    model.eval()

    # Create dummy vocab
    vocab_path = tmp_path / "vocab.txt"
    vocab_tokens = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"] + [f"token_{i}" for i in range(95)]
    vocab_path.write_text("\n".join(vocab_tokens))
    tokenizer = BertTokenizerFast(str(vocab_path))

    # Save as base model (Arm A / step 0)
    base_model_dir = tmp_path / "base_model"
    base_model_dir.mkdir()
    model.save_pretrained(str(base_model_dir))
    tokenizer.save_pretrained(str(base_model_dir))

    # Save as checkpoint (Arm C / step 50) with slightly modified weights
    ckpt_dir = tmp_path / "exp" / "checkpoints" / "Arm_C" / "step_50"
    ckpt_dir.mkdir(parents=True)
    with torch.no_grad():
        for p in model.parameters():
            p.add_(0.01)
    model.save_pretrained(str(ckpt_dir))
    tokenizer.save_pretrained(str(ckpt_dir))

    # Build dummy records
    records = [
        {
            "split": "test",
            "job_id": "j100",
            "requirement_id": "r1@en",
            "requirement": "token_1 token_2",
            "candidate_id": "c1",
            "evidence_id": "e1",
            "record_id": "rec_1",
            "evidence": "token_1 token_2 token_3",
            "label": 1
        },
        {
            "split": "test",
            "job_id": "j100",
            "requirement_id": "r1@en",
            "requirement": "token_1 token_2",
            "candidate_id": "c2",
            "evidence_id": "e2",
            "record_id": "rec_2",
            "evidence": "token_10 token_11",
            "label": 0
        }
    ]
    pools = build_eval_pools_with_unique_ids(records, "test")

    # Load model wrapper for Arm A (step 0 from base)
    model_a = load_model_for_arm(str(base_model_dir), device="cpu")
    # Load model wrapper for Arm C (step 50 from ckpt)
    model_c = load_model_for_arm(str(ckpt_dir), device="cpu")

    # Evaluate both
    res_a, cases_a = evaluate_arm_model(model_a, pools, arm_name="Arm_A")
    res_c, cases_c = evaluate_arm_model(model_c, pools, arm_name="Arm_C")

    # Ensure all scores finite
    assert all(math.isfinite(cand["score"]) for c in cases_a for cand in c["candidates"])
    assert all(math.isfinite(cand["score"]) for c in cases_c for cand in c["candidates"])

    # Score comparison by unique key
    comp = build_per_query_evidence_comparison(cases_a, cases_c, "Arm_A", "Arm_C")
    assert len(comp) == 2
    # Ensure no optimizer attached, model remains in eval mode
    assert not model_a.model.training
    assert not model_c.model.training

    # Now verify full run_eval_only pipeline end-to-end
    bundle_dir = tmp_path / "bundle"
    bundle_dir.mkdir()
    shutil.copytree(base_model_dir, bundle_dir / "model")
    (bundle_dir / "data").mkdir()
    data_file = bundle_dir / "data" / "semantic.jsonl"
    with open(data_file, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    artifacts = {"data/semantic.jsonl": compute_sha256(data_file)}
    for model_file in (bundle_dir / "model").glob("*"):
        if model_file.is_file():
            artifacts[f"model/{model_file.name}"] = compute_sha256(model_file)
    manifest = {"artifacts": artifacts}
    (bundle_dir / "manifest.json").write_text(json.dumps(manifest))

    exp_dir = tmp_path / "exp"
    exp_summary = {
        "status": "COMPLETED",
        "smoke_synthetic": False,
        "execution_mode": "TORCH_REAL",
        "arms": {
            "Arm_A": {"selected_step": 0},
            "Arm_B": {"selected_step": 0, "val_history": [{"step": 0}]},
            "Arm_C": {
                "selected_step": 50,
                "val_history": [{"step": 0}, {"step": 50}],
                "checkpoint_path": str(ckpt_dir)
            }
        }
    }
    (exp_dir / "experiment_results.json").write_text(json.dumps(exp_summary))

    eval_out_dir = tmp_path / "eval_out"
    report = run_eval_only(
        bundle_dir=bundle_dir,
        experiment_dir=exp_dir,
        output_dir=eval_out_dir,
        device="cpu",
        split="test",
    )

    assert report["status"] == "COMPLETED"
    assert report["evaluation_type"] == "SAVED_CHECKPOINTS_EVAL_ONLY_NO_RETRAINING"
    assert (eval_out_dir / "eval_diagnostic_results.json").exists()
    assert (eval_out_dir / "eval_predictions_Arm_A.jsonl").exists()
    assert (eval_out_dir / "eval_predictions_Arm_B.jsonl").exists()
    assert (eval_out_dir / "eval_predictions_Arm_C.jsonl").exists()
    assert (eval_out_dir / "eval_score_rank_diff_c_vs_a.jsonl").exists()


def test_cross_check_val_history_mismatch(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    # selected_step = 50, but val_history only has step 0 and 100
    summary = {
        "status": "COMPLETED",
        "smoke_synthetic": False,
        "execution_mode": "TORCH_REAL",
        "arms": {
            "Arm_C": {
                "selected_step": 50,
                "val_history": [{"step": 0}, {"step": 100}],
                "checkpoint_path": str(exp_dir / "checkpoints" / "Arm_C" / "step_50")
            }
        }
    }
    with pytest.raises(CheckpointValidationError, match="does not exist in val_history"):
        resolve_arm_checkpoint_target("Arm_C", summary["arms"]["Arm_C"], exp_dir, tmp_path / "bundle" / "model")


def test_reject_baseline_step0_masquerading_as_positive_checkpoint(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    # Arm_B says selected_step: 0, but checkpoint_path points to step_50
    summary = {
        "status": "COMPLETED",
        "smoke_synthetic": False,
        "execution_mode": "TORCH_REAL",
        "arms": {
            "Arm_B": {
                "selected_step": 0,
                "val_history": [{"step": 0}],
                "checkpoint_path": str(exp_dir / "checkpoints" / "Arm_B" / "step_50")
            }
        }
    }
    with pytest.raises(CheckpointValidationError, match="points to positive step"):
        resolve_arm_checkpoint_target("Arm_B", summary["arms"]["Arm_B"], exp_dir, tmp_path / "bundle" / "model")


def test_safe_archive_extraction_valid(tmp_path):
    # Create valid zip
    arc_path = tmp_path / "valid_results.zip"
    extract_target = tmp_path / "extracted_exp"
    with zipfile.ZipFile(arc_path, "w") as zf:
        zf.writestr("experiment_results.json", json.dumps({"status": "COMPLETED"}))
        zf.writestr("checkpoints/Arm_C/step_50/config.json", json.dumps({"hidden_size": 16}))
        zf.writestr("checkpoints/Arm_C/step_50/model.safetensors", b"dummy_tensor_bytes")

    out_p = safe_extract_results_archive(arc_path, extract_target)
    assert out_p == extract_target
    assert (extract_target / "experiment_results.json").exists()
    assert (extract_target / "checkpoints" / "Arm_C" / "step_50" / "model.safetensors").exists()


def test_safe_archive_rejections(tmp_path):
    extract_target = tmp_path / "extracted_fail"

    # Rejection 1: Path traversal (..)
    arc_bad1 = tmp_path / "bad1.zip"
    with zipfile.ZipFile(arc_bad1, "w") as zf:
        zf.writestr("../evil.json", "{}")
    with pytest.raises(SafeArchiveError, match="Path traversal detected"):
        safe_extract_results_archive(arc_bad1, extract_target)

    # Rejection 2: Backslash
    arc_bad2 = tmp_path / "bad2.zip"
    with zipfile.ZipFile(arc_bad2, "w") as zf:
        zf.writestr("sub\\file.json", "{}")
    with pytest.raises(SafeArchiveError, match="backslash"):
        safe_extract_results_archive(arc_bad2, extract_target)

    # Rejection 3: Disallowed extension (.py or .sh)
    arc_bad3 = tmp_path / "bad3.zip"
    with zipfile.ZipFile(arc_bad3, "w") as zf:
        zf.writestr("runner.py", "print('evil')")
    with pytest.raises(SafeArchiveError, match="disallowed extension"):
        safe_extract_results_archive(arc_bad3, extract_target)


def test_manifest_rejects_symlink_and_traversal(tmp_path):
    bundle = tmp_path / "bundle_sym"
    bundle.mkdir()
    f1 = bundle / "real_file.txt"
    f1.write_text("hello")
    sym = bundle / "sym_file.txt"
    sym.symlink_to(f1)

    manifest = {
        "artifacts": {
            "sym_file.txt": compute_sha256(f1)
        }
    }
    (bundle / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(PathTraversalError, match="Symlink"):
        verify_bundle_manifest(bundle)

    # Manifest artifact path traversal outside bundle root
    manifest_bad = {
        "artifacts": {
            "../../etc/passwd": "dummyhash"
        }
    }
    (bundle / "manifest.json").write_text(json.dumps(manifest_bad))
    with pytest.raises(PathTraversalError, match="Path traversal in manifest artifact"):
        verify_bundle_manifest(bundle)


def test_notebook_startup_from_empty_cwd_no_repo(tmp_path):
    """Test that notebook executes successfully from an empty directory with NO repository files."""
    empty_cwd = tmp_path / "empty_kaggle_cwd"
    empty_cwd.mkdir()

    # Create dummy bundle in another directory
    bundle_dir = tmp_path / "test_bundle"
    bundle_dir.mkdir()
    (bundle_dir / "data").mkdir()
    data_file = bundle_dir / "data" / "semantic.jsonl"
    data_file.write_text(json.dumps({
        "split": "test",
        "job_id": "j1",
        "requirement_id": "r1@en",
        "requirement": "req text",
        "candidate_id": "c1",
        "evidence_id": "e1",
        "record_id": "rec1",
        "evidence": "evi text",
        "label": 1
    }) + "\n")

    manifest = {"artifacts": {"data/semantic.jsonl": compute_sha256(data_file)}}
    (bundle_dir / "manifest.json").write_text(json.dumps(manifest))

    # Read notebook
    nb_path = Path("/home/truongdb/Desktop/nexhire/nexhire-BE/.claude/worktrees/agent-aafdd75f9edbbef4f/notebooks/ai1_saved_checkpoints_eval.ipynb")
    nb = json.loads(nb_path.read_text(encoding="utf-8"))

    # Execute cell 0 (cell 1 in nb: environment) and cell 2 (cell 3 in nb: write helper)
    code_cells = [c["source"] for c in nb["cells"] if c["cell_type"] == "code"]
    combined_code = "".join(code_cells[0]) + "\n" + "".join(code_cells[2])

    test_runner_script = empty_cwd / "run_cell_startup.py"
    test_runner_script.write_text(combined_code, encoding="utf-8")

    env = os.environ.copy()
    env["BUNDLE_ROOT"] = str(bundle_dir)

    proc = subprocess.run(
        [sys.executable, "-I", str(test_runner_script)],
        cwd=str(empty_cwd),
        env=env,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, f"Startup failed:\nStdout: {proc.stdout}\nStderr: {proc.stderr}"
    # In non-kaggle environment, WORKING_DIR defaults to ./run_working
    written_runner = list(empty_cwd.glob("**/evaluate_ai1_saved_checkpoints.py"))
    assert len(written_runner) == 1
    assert written_runner[0].stat().st_size > 0



