"""Offline experimental AI1 training. Never modifies the canonical dataset/runtime."""

import argparse
from collections import Counter, defaultdict
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import sys

SERVICE = Path(__file__).resolve().parents[1]
# Do not shadow Hugging Face's `datasets` with the local contract module.
if __package__ in (None, ""):
    sys.path = [p for p in sys.path if Path(p or ".").resolve() != Path(__file__).resolve().parent]
sys.path.insert(0, str(SERVICE))
from app.matching.normalizer import PREPROCESSING_VERSION, normalize_semantic_text
from ml.datasets import validate_dataset
from ml.semantic_evaluation import choose_threshold, metrics


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate_config(config):
    expected = {"mode", "epochs", "batch_groups", "learning_rate", "margin", "max_sequence_length",
                "seed", "threads", "smoke_groups_per_class", "smoke_steps"}
    if (set(config) not in (expected, expected | {"experiment"})
            or config["mode"] not in {"smoke", "full"}
            or config.get("experiment", "v1") not in {"v1", "hard-negative-v2", "filtered-uniform-v3"}):
        raise ValueError("Unknown/missing config keys or mode")
    for key in ("epochs", "batch_groups", "max_sequence_length", "threads", "smoke_groups_per_class", "smoke_steps"):
        if type(config[key]) is not int or config[key] < 1:
            raise ValueError("Positive integer required: " + key)
    if type(config["seed"]) is not int or config["seed"] < 0:
        raise ValueError("Nonnegative integer seed required")
    for key in ("learning_rate", "margin"):
        if isinstance(config[key], bool) or not isinstance(config[key], (int, float)) or not math.isfinite(config[key]):
            raise ValueError("Finite numeric config required: " + key)
    if not 0 < config["learning_rate"] <= 0.01 or not 0 < config["margin"] <= 2:
        raise ValueError("Invalid learning rate or cosine-distance margin")
    return config


def bilingual_groups(rows, lineage):
    if len({r["record_id"] for r in lineage}) != len(lineage):
        raise ValueError("Duplicate lineage record")
    mapping = {r["record_id"]: r for r in lineage}
    if set(mapping) != {r["record_id"] for r in rows}:
        raise ValueError("Lineage must cover exactly the supplied records")
    groups = defaultdict(list)
    for row in rows:
        item = mapping[row["record_id"]]
        if item["translation_variant_weight"] != 0.5:
            raise ValueError("Bilingual weight must be 0.5")
        expected_language = "en_en" if row["requirement_id"].endswith("@en") else "vi_en"
        if item["language_pair"] != expected_language:
            raise ValueError("Lineage language mismatch")
        groups[item["pair_group_id"]].append(row)
    for group in groups.values():
        if len(group) != 2 or {r["requirement_id"].rsplit("@", 1)[1] for r in group} != {"en", "vi"}:
            raise ValueError("Each bilingual group needs exactly EN and VI")
        for key in ("split", "job_id", "candidate_id", "evidence_id", "evidence", "label", "negative_type"):
            if len({r[key] for r in group}) != 1:
                raise ValueError("Bilingual variants disagree: " + key)
    return [sorted(groups[key], key=lambda r: r["requirement_id"]) for key in sorted(groups)]


def select_groups(groups, split, per_class=None):
    result = [g for g in groups if g[0]["split"] == split]
    if per_class is not None:
        result = [g for label in (0, 1) for g in [x for x in result if x[0]["label"] == label][:per_class]]
    if {g[0]["label"] for g in result} != {0, 1}:
        raise ValueError("Train/validation each need both classes")
    return result


def load_inputs(directory):
    directory = Path(directory).resolve()
    manifest = read_json(directory / "training_input.json")
    if manifest.get("schema") not in {"nexhire-ai1-training-input-v1", "nexhire-ai1-training-input-v2"} or manifest.get("test_included") is not False:
        raise ValueError("Only a verified train/validation-only input is accepted")
    expected = {"semantic.jsonl", "semantic_lineage.json", "families.json"}
    if manifest["schema"] == "nexhire-ai1-training-input-v2":
        expected |= {"group_policy.json", "review_provenance.json", "reference_v1.json"}
    if set(manifest["artifact_sha256"]) != expected:
        raise ValueError("Unexpected training input artifacts")
    for name, checksum in manifest["artifact_sha256"].items():
        if sha256(directory / name) != checksum:
            raise ValueError("Training input changed: " + name)
    rows = [r.model_dump() for r in validate_dataset(directory / "semantic.jsonl", "semantic", require_all_splits=False)]
    if {r["split"] for r in rows} != {"train", "validation"}:
        raise ValueError("Test data is prohibited in training inputs")
    if {r["dataset_version"] for r in rows} != {manifest["dataset_version"]}:
        raise ValueError("Training input version mismatch")
    groups = bilingual_groups(rows, read_json(directory / "semantic_lineage.json"))
    families = read_json(directory / "families.json")
    if not {r["job_id"] for r in rows} <= set(families):
        raise ValueError("Missing job-family metadata")
    return manifest, groups, families


def group_weights(directory, groups, manifest, config):
    if config.get("experiment", "v1") not in {"v1", "hard-negative-v2", "filtered-uniform-v3"}:
        raise ValueError("Unknown experiment weighting policy")
    if config.get("experiment", "v1") == "v1":
        if manifest["schema"] != "nexhire-ai1-training-input-v1":
            raise ValueError("Reviewed v2 input requires an explicit v2 experiment config")
        return {r["record_id"]: 1.0 for g in groups for r in g if r["split"] == "train"}
    if manifest["schema"] != "nexhire-ai1-training-input-v2":
        raise ValueError("V2 requires reviewed train-only policy inputs")
    policy = read_json(Path(directory) / "group_policy.json")
    lineage = {r["record_id"]: r["pair_group_id"] for r in read_json(Path(directory) / "semantic_lineage.json")}
    train = {lineage[g[0]["record_id"]]: g for g in groups if g[0]["split"] == "train"}
    if set(policy["weights"]) != set(train) or policy.get("hard_negative_weight") != 3.0:
        raise ValueError("Group policy must cover train exactly and use declared fixed weight 3")
    provenance = read_json(Path(directory) / "review_provenance.json")
    reviewed = {d["pair_group_id"]: d for document in provenance["decisions"] for d in document["cases"]}
    if any(d.get("disposition") == "quarantine" and identifier in train for identifier, d in reviewed.items()):
        raise ValueError("Quarantined review cases cannot re-enter training")
    expected_emphasis = {identifier for identifier, d in reviewed.items()
                         if identifier in train and d.get("disposition") == "keep_negative" and d.get("specific_confounder") is True}
    if {identifier for identifier, weight in policy["weights"].items() if weight == 3.0} != expected_emphasis:
        raise ValueError("Emphasis must follow the complete source review, not selected predictions")
    result = {}
    for identifier, group in train.items():
        weight = policy["weights"][identifier]
        if type(weight) not in (int, float) or weight not in (1.0, 3.0):
            raise ValueError("Unsupported group weight")
        if weight == 3.0:
            decision = reviewed.get(identifier, {})
            if (group[0]["label"] != 0 or group[0]["negative_type"] != "hard"
                    or decision.get("disposition") != "keep_negative"
                    or decision.get("specific_confounder") is not True
                    or decision.get("relation") not in {"I", "C"}):
                raise ValueError("Only source-reviewed specific negative confounders may receive weight 3")
        for row in group:
            result[row["record_id"]] = float(weight)
    if not any(weight == 3.0 for weight in result.values()):
        raise ValueError("V2 needs at least one verified specific confounder")
    if config.get("experiment") == "filtered-uniform-v3":
        # Validate the frozen v2 review policy first; only ablate its emphasis.
        return {identifier: 1.0 for identifier in result}
    return result


def weighted_contrastive_loss(loss_fn, features, labels, weights):
    """Reuse official ContrastiveLoss, changing only its group-weight reduction."""
    import torch
    if len(weights) != len(labels) or any(w not in (1.0, 3.0) for w in weights):
        raise ValueError("One declared positive weight required per variant")
    if len(set(weights)) == 1:
        return loss_fn(features, labels)
    weight_tensor = torch.tensor(weights, dtype=torch.float32, device=labels.device)
    total = labels.new_zeros((), dtype=torch.float32)
    for weight in sorted(set(weights)):
        mask = weight_tensor == weight
        selected = [{key: value[mask] for key, value in feature.items()} for feature in features]
        total = total + loss_fn(selected, labels[mask]) * weight * mask.sum()
    return total / weight_tensor.sum()


def compare_v1(result, reference):
    """Predeclared candidate guard, not another threshold/model selection search."""
    prior = reference["best"]
    epsilon = 1e-12
    checks = {"balanced_accuracy_drop_at_most_1pp": result["validation"]["balanced_accuracy"] >= prior["validation"]["balanced_accuracy"] - 0.01 - epsilon}
    for language in ("en", "vi"):
        key = "language:" + language
        checks[key + "_f1_drop_at_most_2pp"] = result["slices"][key]["f1"] >= prior["slices"][key]["f1"] - 0.02 - epsilon
    for family in ("it_data", "sales_marketing", "finance_accounting", "hr_recruitment"):
        key = "family:" + family
        checks[key + "_ba_drop_at_most_2pp"] = result["slices"][key]["balanced_accuracy"] >= prior["slices"][key]["balanced_accuracy"] - 0.02 - epsilon
    gains = []
    for family in ("it_data", "sales_marketing"):
        key = "family:" + family
        old = prior["slices"][key]["hard_negative_false_positive_rate"]
        new = result["slices"][key]["hard_negative_false_positive_rate"]
        checks[key + "_hard_negative_not_worse"] = new is not None and old is not None and new <= old + epsilon
        gains.append(old - new if old is not None and new is not None else -1)
    checks["at_least_one_target_hard_fpr_improves_5pp"] = max(gains) >= 0.05 - epsilon
    return {"checks": checks, "passed": all(checks.values()), "test_scored": False,
            "production_ready": False, "policy": "Exploratory validation gate, not independent gold; no automatic deployment"}


def evaluate_model(model, train_rows, validation_rows, families, batch_size):
    import numpy as np
    model.eval()
    rows = train_rows + validation_rows
    texts = sorted({normalize_semantic_text(r[key]) for r in rows for key in ("requirement", "evidence")})
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=batch_size, show_progress_bar=False)
    lookup = dict(zip(texts, vectors))
    scores = [round((max(-1.0, min(1.0, float(np.dot(lookup[normalize_semantic_text(r["requirement"])],
                        lookup[normalize_semantic_text(r["evidence"])])))) + 1) * 50, 2) for r in rows]
    threshold = choose_threshold(train_rows, scores[:len(train_rows)])
    validation_scores = scores[len(train_rows):]
    slices = defaultdict(list)
    for row, score in zip(validation_rows, validation_scores):
        language = row["requirement_id"].rsplit("@", 1)[1]
        for name in ("language:" + language, "family:" + families[row["job_id"]],
                     "language_family:" + language + ":" + families[row["job_id"]]):
            slices[name].append((row, score))
    return {"threshold": threshold, "threshold_fit_split": "train", "test_scored": False,
        "validation": metrics(validation_rows, validation_scores, threshold),
        "slices": {name: metrics([r for r, _ in values], [s for _, s in values], threshold)
                   for name, values in sorted(slices.items())}}


def run(input_dir, model_dir, config_path, work_dir, run_name, device="auto"):
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["USE_TF"] = "0"
    os.environ["USE_FLAX"] = "0"
    import torch
    import transformers
    import sentence_transformers
    from sentence_transformers import SentenceTransformer, losses
    from transformers import get_linear_schedule_with_warmup

    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", run_name):
        raise ValueError("Run name must be a simple identifier")
    config = validate_config(read_json(config_path))
    manifest, groups, families = load_inputs(input_dir)
    weights = group_weights(input_dir, groups, manifest, config)
    model_dir, work_dir = Path(model_dir).resolve(), Path(work_dir).resolve()
    if not (model_dir / "modules.json").is_file() or not (model_dir / "model.safetensors").is_file():
        raise ValueError("Complete local safetensors model required")
    if sha256(model_dir / "model.safetensors") != manifest["base_model_weights_sha256"]:
        raise ValueError("Wrong base-model weights")
    for name, checksum in manifest["base_model_artifact_sha256"].items():
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts or sha256(model_dir / relative) != checksum:
            raise ValueError("Base model tokenizer/config changed")
    # Never permit output/checkpoint files inside the input data or base model.
    protected = [Path(input_dir).resolve(), model_dir, SERVICE.parents[1] / "dataset" / "current"]
    run_dir, export = work_dir / "runs" / run_name, work_dir / "exports" / run_name
    if any(path.is_relative_to(p) or p.is_relative_to(path) for path in (run_dir, export) for p in protected):
        raise ValueError("Training outputs overlap protected inputs")
    if run_dir.exists() or export.exists():
        raise ValueError("Run already exists; use a new name, never overwrite checkpoints")
    if device not in {"auto", "cpu", "cuda"}:
        raise ValueError("Unsupported device")
    device = ("cuda" if torch.cuda.is_available() else "cpu") if device == "auto" else device
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA requested but unavailable; enable a GPU in Kaggle")
    if config["mode"] == "full" and device == "cpu":
        raise ValueError("Full run requires GPU in this pipeline; use smoke locally or a GPU machine")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    random.seed(config["seed"])
    torch.manual_seed(config["seed"])
    if device == "cuda":
        torch.cuda.manual_seed_all(config["seed"])
    torch.set_num_threads(config["threads"])
    subset = config["smoke_groups_per_class"] if config["mode"] == "smoke" else None
    ordered = sorted(groups, key=lambda g: -weights.get(g[0]["record_id"], 1.0)) if subset is not None else groups
    train_groups = select_groups(ordered, "train", subset)
    validation_groups = select_groups(groups, "validation", subset)
    train_rows = [r for g in train_groups for r in g]
    validation_rows = [r for g in validation_groups for r in g]
    run_dir.mkdir(parents=True)
    (run_dir / "checkpoints").mkdir()
    metadata = {"schema": "nexhire-ai1-experiment-v1", "status": "running", "run_name": run_name,
        "mode": config["mode"], "config": config, "device": device, "input_manifest": manifest,
        "training_input_manifest_sha256": sha256(Path(input_dir) / "training_input.json"),
        "training_code_sha256": sha256(__file__), "preprocessing_version": PREPROCESSING_VERSION,
        "variant_weight": 0.5, "class_weighting": "none; no oversampling",
        "loss": "sentence_transformers.losses.ContrastiveLoss cosine distance",
        "train_rows": len(train_rows), "validation_rows": len(validation_rows), "test_scored": False,
        "independent_gold": False, "production_ready": False, "runtime_changed": False,
        "torch_version": torch.__version__}
    metadata.update(transformers_version=transformers.__version__, sentence_transformers_version=sentence_transformers.__version__,
        train_label_counts=dict(Counter(r["label"] for r in train_rows)),
        validation_label_counts=dict(Counter(r["label"] for r in validation_rows)))
    if config.get("experiment") == "hard-negative-v2":
        metadata.update(experiment="hard-negative-v2", class_weighting="reviewed specific train-negative group weight 3; no oversampling",
                        emphasized_train_groups=sum(weights[g[0]["record_id"]] == 3.0 for g in train_groups))
    elif config.get("experiment") == "filtered-uniform-v3":
        metadata.update(experiment="filtered-uniform-v3", class_weighting="uniform group weight 1; frozen v2 filtering; no oversampling",
                        emphasized_train_groups=0, ablation="v2 weighting removed; identical frozen input and full-run group order")
    save_json(run_dir / "training_manifest.json", metadata)
    try:
        model = SentenceTransformer(str(model_dir), device=device, trust_remote_code=False,
                                    model_kwargs={"use_safetensors": True})
        length = config["max_sequence_length"]
        if length > model[0].auto_model.config.max_position_embeddings:
            raise ValueError("Context exceeds positional capacity")
        model.max_seq_length = length
        model.tokenizer.model_max_length = length
        probe_name, probe = next((name, parameter) for name, parameter in model.named_parameters()
                                if ".encoder.layer." in name and parameter.ndim == 2)
        original_probe = probe.detach().cpu().clone()
        loss_fn = losses.ContrastiveLoss(model, margin=config["margin"])
        optimizer = torch.optim.AdamW(model.parameters(), lr=config["learning_rate"], weight_decay=0.01)
        steps_per_epoch = math.ceil(len(train_groups) / config["batch_groups"])
        total_steps = steps_per_epoch * config["epochs"]
        if config["mode"] == "smoke":
            total_steps = min(total_steps, config["smoke_steps"])
        scheduler = get_linear_schedule_with_warmup(optimizer, min(total_steps // 10, 50), total_steps)
        baseline = evaluate_model(model, train_rows, validation_rows, families, config["batch_groups"] * 2)
        save_json(run_dir / "baseline.json", baseline)
        best, step, history = None, 0, []
        for epoch in range(config["epochs"]):
            order = list(train_groups)
            random.Random(config["seed"] + epoch).shuffle(order)
            model.train()
            running_loss = 0.0
            epoch_steps = 0
            for start in range(0, len(order), config["batch_groups"]):
                if step >= total_steps:
                    break
                batch = [r for group in order[start:start + config["batch_groups"]] for r in group]
                features = [{k: v.to(device) for k, v in model.tokenize([
                    normalize_semantic_text(r[key]) for r in batch]).items()} for key in ("requirement", "evidence")]
                labels = torch.tensor([r["label"] for r in batch], dtype=torch.float32, device=device)
                optimizer.zero_grad(set_to_none=True)
                # All groups have exactly two equally weighted variants; mean loss
                # is sum(0.5 * loss_i) / sum(0.5), with no independent oversampling.
                loss = weighted_contrastive_loss(loss_fn, features, labels, [weights[r["record_id"]] for r in batch])
                if not torch.isfinite(loss):
                    raise ValueError("Non-finite training loss")
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0, error_if_nonfinite=True)
                optimizer.step()
                scheduler.step()
                step += 1
                epoch_steps += 1
                running_loss += float(loss.detach().cpu())
                if step == 1 or step % 25 == 0 or step == total_steps:
                    print(json.dumps({"epoch": epoch + 1, "step": step, "total_steps": total_steps,
                                      "loss": float(loss.detach().cpu())}), flush=True)
            result = evaluate_model(model, train_rows, validation_rows, families, config["batch_groups"] * 2)
            entry = {"epoch": epoch + 1, "steps": step, "mean_loss": running_loss / epoch_steps, **result}
            history.append(entry)
            save_json(run_dir / "history.json", history)
            if best is None or result["validation"]["balanced_accuracy"] > best["validation"]["balanced_accuracy"]:
                best = entry
                model.save(str(run_dir / "checkpoints" / "best"), safe_serialization=True)
            if step >= total_steps:
                break
        del optimizer, loss_fn, features, loss, labels, model
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
        best_model = SentenceTransformer(str(run_dir / "checkpoints" / "best"), device=device,
            trust_remote_code=False, model_kwargs={"use_safetensors": True})
        confirmed = evaluate_model(best_model, train_rows, validation_rows, families, config["batch_groups"] * 2)
        if confirmed != {k: best[k] for k in confirmed}:
            raise ValueError("Reloaded checkpoint evaluation differs")
        base_hash = manifest["base_model_weights_sha256"]
        changed = sha256(run_dir / "checkpoints" / "best" / "model.safetensors") != base_hash
        selected_probe = dict(best_model.named_parameters())[probe_name].detach().cpu()
        parameter_changed = not torch.equal(original_probe, selected_probe)
        if not changed or not parameter_changed:
            raise ValueError("Weights did not change during training")
        summary = {"status": "completed", "smoke_only": config["mode"] == "smoke", "optimizer_steps": step,
            "best_epoch": best["epoch"], "weights_changed": changed, "test_scored": False,
            "parameter_probe": probe_name, "parameter_values_changed": parameter_changed,
            "baseline": baseline, "best": confirmed,
            "balanced_accuracy_delta": confirmed["validation"]["balanced_accuracy"] - baseline["validation"]["balanced_accuracy"],
            "selection_rule": "Highest validation balanced accuracy; thresholds fitted on train only; no automatic deployment",
            "independent_gold": False, "production_ready": False}
        if config["mode"] == "full":
            if config.get("experiment") in {"hard-negative-v2", "filtered-uniform-v3"}:
                summary["comparison_to_v1"] = compare_v1(confirmed, read_json(Path(input_dir) / "reference_v1.json"))
            export.mkdir(parents=True)
            best_model.save(str(export / "model"), safe_serialization=True)
            save_json(export / "evaluation.json", summary)
            save_json(export / "training_manifest.json", {**metadata, "status": "completed"})
            summary["export_directory"] = str(export)
        save_json(run_dir / "summary.json", summary)
        save_json(run_dir / "training_manifest.json", {**metadata, "status": "completed"})
        return {"run_directory": str(run_dir), "smoke_only": summary["smoke_only"],
            "optimizer_steps": step, "weights_changed": changed, "export_directory": summary.get("export_directory"),
            "test_scored": False, "production_ready": False}
    except BaseException as error:
        save_json(run_dir / "training_manifest.json", {**metadata, "status": "failed", "error_type": type(error).__name__})
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--run-name", required=True)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    args = parser.parse_args()
    print(json.dumps(run(args.input_dir, args.model_dir, args.config, args.work_dir, args.run_name, args.device), indent=2))
