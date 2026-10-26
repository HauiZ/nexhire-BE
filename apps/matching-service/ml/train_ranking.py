"""Portable ranking/retention experiment. No automatic production promotion."""

import argparse
from collections import defaultdict
import gc
import importlib.metadata
import math
import os
from pathlib import Path
import random
import re
import sys

SERVICE = Path(__file__).resolve().parents[1]
if __package__ in (None, ""):
    sys.path = [p for p in sys.path if Path(p or ".").resolve() != Path(__file__).resolve().parent]
sys.path.insert(0, str(SERVICE))
from app.matching.normalizer import normalize_semantic_text as norm
from ml.train_semantic import evaluate_model, load_inputs, read_json, save_json, sha256


def batches(items, size, seed):
    if not items or type(size) is not int or size < 1:
        raise ValueError("Nonempty items and positive batch size required")
    ordered = list(items)
    random.Random(seed).shuffle(ordered)
    return [ordered[i:i + size] for i in range(0, len(ordered), size)]


def replay_schedule(texts, steps, seed):
    if not texts or len(set(texts)) != len(texts) or not 1 <= steps <= len(texts):
        raise ValueError("Unique replay texts and feasible step count required")
    ordered = list(texts)
    random.Random(seed).shuffle(ordered)
    return [ordered[i * len(ordered) // steps:(i + 1) * len(ordered) // steps] for i in range(steps)]


def ranking_scale(batch_weights, mean_variant_weight):
    if (not batch_weights or not all(math.isfinite(w) and w > 0 for w in batch_weights)
            or not math.isfinite(mean_variant_weight) or mean_variant_weight <= 0):
        raise ValueError("Positive finite batch/global weights required")
    # With uniform source-group traversal this estimates the fixed global
    # weighted objective, not a different ratio of weights in every minibatch.
    return sum(batch_weights) / (len(batch_weights) * mean_variant_weight)


def reference_metrics(cases, vectors):
    import numpy as np
    jobs, families, languages, records = defaultdict(list), {}, defaultdict(list), []
    for case in cases:
        ids = [s["evidence_id"] for s in case["sections"]]
        if not ids or len(set(ids)) != len(ids) or case["reference_id"] not in ids:
            raise ValueError("Actual unique corpus/reference IDs required")
        families[case["job_id"]] = case["job_group"]
        for language in ("en", "vi"):
            scores = {s["evidence_id"]: float(np.dot(vectors[norm(case["requirement_" + language])],
                vectors[norm(s["text"])])) for s in case["sections"]}
            if any(not math.isfinite(v) or not -1.000001 <= v <= 1.000001 for v in scores.values()):
                raise ValueError("Finite raw cosine required")
            order = sorted(scores, key=lambda i: (-scores[i], i))
            rank = order.index(case["reference_id"]) + 1
            values = {"mrr": 1 / rank, "hit3": float(rank <= 3)}
            jobs[case["job_id"]].append(values)
            languages[language].append((case["job_id"], values))
            records.append({"case_id": case["case_id"], "language": language, "order": order,
                            "scores": scores, "reference_rank": rank})
    def aggregate(group):
        by_job = defaultdict(list)
        for job, values in group:
            by_job[job].append(values)
        by_family = defaultdict(list)
        for job, values in by_job.items():
            by_family[families[job]].append({m: sum(v[m] for v in values) / len(values) for m in ("mrr", "hit3")})
        family = {f: {m: sum(v[m] for v in vals) / len(vals) for m in ("mrr", "hit3")}
                  for f, vals in by_family.items()}
        return {"family": family, "balanced": {m: sum(v[m] for v in family.values()) / len(family) for m in ("mrr", "hit3")}}
    all_values = [(j, v) for j, values in jobs.items() for v in values]
    if not all_values:
        raise ValueError("Positive-reference cases required")
    return {"all": aggregate(all_values), "language": {lang: aggregate(values) for lang, values in languages.items()},
        "source_queries": len(cases), "variants": len(records), "records": records,
        "known_reference_only_not_exhaustive_relevance": True}


def candidate_checks(result, baseline, drift, config):
    checks = {"mrr_not_below_pretrained": result["all"]["balanced"]["mrr"] >= baseline["all"]["balanced"]["mrr"] - 1e-12,
        "hit3_guard": result["all"]["balanced"]["hit3"] >= baseline["all"]["balanced"]["hit3"] - config["maximum_hit3_drop"] - 1e-12,
        "train_replay_drift_guard": drift <= config["maximum_replay_drift"]}
    for family, value in baseline["all"]["family"].items():
        checks["family:" + family] = result["all"]["family"][family]["mrr"] >= value["mrr"] - config["maximum_slice_mrr_drop"] - 1e-12
    for lang, value in baseline["language"].items():
        checks["language:" + lang] = result["language"][lang]["balanced"]["mrr"] >= value["balanced"]["mrr"] - config["maximum_slice_mrr_drop"] - 1e-12
    return checks


def validate_config(config):
    expected = {"mode", "epochs", "batch_groups", "learning_rate", "seed", "threads", "max_sequence_length",
                "margin", "retention_weights", "maximum_hit3_drop", "maximum_slice_mrr_drop", "maximum_replay_drift"}
    if set(config) != expected or config["mode"] not in ("smoke", "full") or config["retention_weights"] != [0.0, 1.0]:
        raise ValueError("Fixed two-arm experiment configuration required")
    for key in ("epochs", "batch_groups", "threads", "max_sequence_length"):
        if type(config[key]) is not int or config[key] < 1:
            raise ValueError("Positive integer required: " + key)
    if type(config["seed"]) is not int or config["seed"] < 0 or config["max_sequence_length"] != 256:
        raise ValueError("Fixed context 256 and nonnegative seed required")
    for key in ("learning_rate", "margin", "maximum_hit3_drop", "maximum_slice_mrr_drop", "maximum_replay_drift"):
        if type(config[key]) not in (int, float) or not math.isfinite(config[key]):
            raise ValueError("Finite parameter required")
    if not 0 < config["learning_rate"] <= .001 or not 0 < config["margin"] <= 2:
        raise ValueError("Invalid learning rate/margin")
    if any(not 0 <= config[k] <= 1 for k in ("maximum_hit3_drop", "maximum_slice_mrr_drop", "maximum_replay_drift")):
        raise ValueError("Invalid engineering guard")
    return config


def load_experiment(directory, base):
    directory, base = Path(directory).resolve(), Path(base).resolve()
    manifest = read_json(directory / "experiment.json")
    if (manifest["schema"] != "nexhire-ranking-input-v1" or manifest["test_included"] is not False
            or manifest["private_cv_included"] is not False or manifest["independent_gold"] is not False):
        raise ValueError("Bound experimental input without private CV/test required")
    expected = {"comparisons.json", "replay.json", "validation_reference.json", "ranking_review.json"}
    source_manifest = read_json(directory / "source/training_input.json")
    expected |= {"source/" + name for name in source_manifest["artifact_sha256"]} | {"source/training_input.json"}
    if set(manifest["artifact_sha256"]) != expected:
        raise ValueError("Unexpected/missing experiment input files")
    for name, checksum in manifest["artifact_sha256"].items():
        path = (directory / name).resolve()
        if not path.is_relative_to(directory) or sha256(path) != checksum:
            raise ValueError("Input checksum/path mismatch: " + name)
    for name, checksum in manifest["code_artifact_sha256"].items():
        path = (SERVICE / name).resolve()
        if not path.is_relative_to(SERVICE) or sha256(path) != checksum:
            raise ValueError("Training code mismatch: " + name)
    for name, checksum in manifest["base_artifact_sha256"].items():
        path = (base / name).resolve()
        if not path.is_relative_to(base) or sha256(path) != checksum:
            raise ValueError("Pretrained mismatch: " + name)
    _, groups, families = load_inputs(directory / "source")
    rows = {r["record_id"]: r for g in groups for r in g}
    comparisons = read_json(directory / "comparisons.json")
    if not comparisons or len({t["triplet_id"] for t in comparisons}) != len(comparisons):
        raise ValueError("Nonempty unique source comparisons required")
    review = read_json(directory / "ranking_review.json")
    if set(review["held_triplet_ids"]) & {t["triplet_id"] for t in comparisons}:
        raise ValueError("Held constraints cannot re-enter training")
    train_jobs = {r["job_id"] for r in rows.values() if r["split"] == "train"}
    validation_jobs = {r["job_id"] for r in rows.values() if r["split"] == "validation"}
    if train_jobs & validation_jobs:
        raise ValueError("Job leakage across train/validation")
    for t in comparisons:
        if not math.isfinite(t["weight"]) or t["weight"] <= 0 or len(t["variants"]) != 2:
            raise ValueError("Positive group weight and correlated bilingual variants required")
        if {v["language"] for v in t["variants"]} != {"en", "vi"}:
            raise ValueError("EN/VI must stay in one source group")
        for v in t["variants"]:
            p, n = rows[v["positive_record_id"]], rows[v["negative_record_id"]]
            if (p["split"] != "train" or n["split"] != "train" or p["label"] != 1 or n["label"] != 0
                    or p["job_id"] != n["job_id"] or p["job_id"] != t["job_id"]
                    or norm(p["requirement"]) != norm(n["requirement"]) or v["variant_weight"] != .5
                    or p["requirement_id"].rsplit("@", 1)[1] != v["language"]
                    or n["requirement_id"].rsplit("@", 1)[1] != v["language"]
                    or t["family"] != families[p["job_id"]] or t["negative_type"] != n["negative_type"]):
                raise ValueError("Only aligned original labeled train comparisons allowed")
    refs = read_json(directory / "replay.json")
    replay = [norm(rows[r["record_id"]][r["field"]]) for r in refs]
    if (any(rows[r["record_id"]]["split"] != "train" or r["field"] not in ("requirement", "evidence") for r in refs)
            or len(set(replay)) != len(replay)
            or set(replay) != {norm(r[k]) for r in rows.values() if r["split"] == "train" for k in ("requirement", "evidence")}):
        raise ValueError("Replay must cover unique train texts exactly")
    cases = read_json(directory / "validation_reference.json")
    if not cases or any(c["job_id"] not in validation_jobs or c["job_group"] != families[c["job_id"]] for c in cases):
        raise ValueError("References must belong only to validation jobs")
    if len({c["case_id"] for c in cases}) != len(cases):
        raise ValueError("Duplicate validation reference")
    return manifest, comparisons, replay, cases, rows, families


def run(directory, base, config_path, output, device):
    config = validate_config(read_json(config_path))
    manifest, comparisons, replay, cases, rows, families = load_experiment(directory, base)
    if sha256(config_path) != manifest["config_sha256"][config["mode"]]:
        raise ValueError("Configuration must match frozen input")
    output, directory, base = map(lambda p: Path(p).resolve(), (output, directory, base))
    protected = (directory, base, SERVICE.parents[1] / "dataset/current")
    if any(output.is_relative_to(p) or p.is_relative_to(output) for p in protected) or output.exists():
        raise ValueError("Output must be new and disjoint from protected inputs")
    if device not in ("cpu", "cuda") or config["mode"] == "full" and device != "cuda":
        raise ValueError("Full experiment requires CUDA; use explicit CPU smoke locally")
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", USE_TF="0", USE_FLAX="0", TOKENIZERS_PARALLELISM="false")
    import numpy as np
    import torch
    from sentence_transformers import SentenceTransformer
    from transformers import get_linear_schedule_with_warmup
    from ml.ranking_objective import RankingRetentionLoss
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("Enable GPU before full training")
    torch.set_num_threads(config["threads"])
    smoke = config["mode"] == "smoke"
    if smoke:
        chosen = []
        for family in sorted({t["family"] for t in comparisons}):
            chosen += sorted([t for t in comparisons if t["family"] == family and t["negative_type"] == "hard"],
                             key=lambda t: t["triplet_id"])[:4]
        comparisons = chosen
        replay = sorted(replay)[:64]
        cases = [next(c for c in cases if c["job_group"] == f) for f in sorted({c["job_group"] for c in cases})]
    output.mkdir(parents=True)
    receipt = {"status": "running", "mode": config["mode"], "input_manifest_sha256": sha256(directory / "experiment.json"),
        "config": config, "device": device, "private_cv_used": False, "test_scored": False,
        "independent_gold": False, "production_ready": False, "arms": [],
        "torch_version": torch.__version__, "sentence_transformers_version": importlib.metadata.version("sentence-transformers"),
        "cuda_device": torch.cuda.get_device_name(0) if device == "cuda" else None,
        "validation_is_previously_inspected_development_data": True}
    save_json(output / "experiment_results.json", receipt)
    try:
        def load_model():
            m = SentenceTransformer(str(base), device=device, trust_remote_code=False, model_kwargs={"use_safetensors": True})
            m.max_seq_length = 256
            return m
        val_texts = sorted({norm(c["requirement_" + l]) for c in cases for l in ("en", "vi")}
                           | {norm(s["text"]) for c in cases for s in c["sections"]})
        teacher = load_model()
        teacher.eval()
        for p in teacher.parameters():
            p.requires_grad_(False)
        cache = dict(zip(replay, teacher.encode(replay, normalize_embeddings=True, batch_size=32, show_progress_bar=False)))
        def evaluate(model):
            vec = dict(zip(val_texts, model.encode(val_texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)))
            return reference_metrics(cases, vec)
        baseline = evaluate(teacher)
        save_json(output / "pretrained_reference.json", baseline)
        del teacher
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
        mean_variant_weight = sum(t["weight"] for t in comparisons) / (2 * len(comparisons))
        for retention in config["retention_weights"]:
            torch.manual_seed(config["seed"])
            if device == "cuda":
                torch.cuda.manual_seed_all(config["seed"])
            model = load_model()
            probe = next(p for n, p in model.named_parameters() if ".encoder.layer." in n and p.ndim == 2)
            initial_probe = probe.detach().cpu().clone()
            optimizer = torch.optim.AdamW(model.parameters(), lr=config["learning_rate"], weight_decay=.01)
            total_steps = math.ceil(len(comparisons) / config["batch_groups"]) * config["epochs"]
            scheduler = get_linear_schedule_with_warmup(optimizer, min(total_steps // 10, 50), total_steps)
            objective = RankingRetentionLoss(config["margin"], retention)
            name = "ranking-only" if retention == 0 else "ranking-retention"
            best, history, step = None, [], 0
            for epoch in range(config["epochs"]):
                order = batches(comparisons, config["batch_groups"], config["seed"] + epoch)
                replay_batches = replay_schedule(replay, len(order), config["seed"] + epoch)
                model.train()
                rank_sum, retention_sum, processed = 0., 0., 0
                for batch, replay_text in zip(order, replay_batches):
                    variants = [v for t in batch for v in t["variants"]]
                    role_texts = [[norm(rows[v["positive_record_id"]]["requirement"]) for v in variants],
                        [norm(rows[v["positive_record_id"]]["evidence"]) for v in variants],
                        [norm(rows[v["negative_record_id"]]["evidence"]) for v in variants]]
                    def encode(values):
                        return model({k: v.to(device) for k, v in model.tokenize(values).items()})["sentence_embedding"]
                    vectors = [encode(text) for text in role_texts]
                    replay_vector = encode(replay_text)
                    target = torch.tensor(np.stack([cache[t] for t in replay_text]), device=device)
                    raw_weights = [t["weight"] * v["variant_weight"] for t in batch for v in t["variants"]]
                    parts = objective(*vectors, replay_vector, target, torch.tensor(raw_weights, device=device))
                    ranking = parts["ranking_loss"] * ranking_scale(raw_weights, mean_variant_weight)
                    loss = ranking + retention * parts["retention_loss"]
                    if not torch.isfinite(loss):
                        raise ValueError("Nonfinite objective")
                    optimizer.zero_grad(set_to_none=True)
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1, error_if_nonfinite=True)
                    optimizer.step()
                    scheduler.step()
                    step += 1
                    processed += len(batch)
                    rank_sum += float(ranking.detach()) * len(batch)
                    retention_sum += float(parts["retention_loss"].detach()) * len(replay_text)
                    if step == 1 or step % 25 == 0:
                        print({"arm": name, "epoch": epoch + 1, "step": step, "total_steps": total_steps,
                               "ranking_loss": float(ranking.detach()), "retention_loss": float(parts["retention_loss"].detach())}, flush=True)
                reference = evaluate(model)
                actual = model.encode(replay, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
                drift = max(0., sum(1 - float(np.dot(v, cache[t])) for t, v in zip(replay, actual)) / len(replay))
                checks = candidate_checks(reference, baseline, drift, config)
                entry = {"epoch": epoch + 1, "steps": step, "source_groups_processed": processed,
                    "replay_texts_processed": sum(map(len, replay_batches)), "mean_ranking_loss": rank_sum / processed,
                    "mean_retention_loss": retention_sum / len(replay), "replay_eval_cosine_drift": drift,
                    "reference": {k: v for k, v in reference.items() if k != "records"}, "candidate_checks": checks}
                history.append(entry)
                if not smoke and all(checks.values()) and (best is None or reference["all"]["balanced"]["mrr"] > best["reference"]["all"]["balanced"]["mrr"]):
                    best = entry
                    model.save(str(output / "models" / name), safe_serialization=True)
                    save_json(output / (name + "_best_reference.json"), reference)
                save_json(output / (name + "_history.json"), history)
            changed = not torch.equal(initial_probe, probe.detach().cpu())
            if not changed:
                raise ValueError("Optimizer did not change parameter probe")
            del optimizer, scheduler, vectors, parts, loss, replay_vector, target, model, probe
            gc.collect()
            if device == "cuda":
                torch.cuda.empty_cache()
            arm = {"arm": name, "retention_weight": retention, "steps": step, "history": history,
                   "parameter_probe_changed": changed, "best": best, "model_exported": best is not None,
                   "automatic_entailment_approved": False}
            if best is not None:
                selected = SentenceTransformer(str(output / "models" / name), device=device,
                    trust_remote_code=False, model_kwargs={"use_safetensors": True})
                selected.max_seq_length = 256
                if evaluate(selected) != read_json(output / (name + "_best_reference.json")):
                    raise ValueError("Saved checkpoint retrieval replay differs")
                arm["pair_diagnostic"] = evaluate_model(selected,
                    [r for r in rows.values() if r["split"] == "train"],
                    [r for r in rows.values() if r["split"] == "validation"], families, 32)
                arm["weights_sha256"] = sha256(output / "models" / name / "model.safetensors")
                del selected
                gc.collect()
                if device == "cuda":
                    torch.cuda.empty_cache()
            receipt["arms"].append(arm)
            save_json(output / "experiment_results.json", receipt)
        receipt.update(status="completed", smoke_only=smoke, automatic_promotion=False,
            no_candidate_is_valid_outcome=True, baseline_reference={k: v for k, v in baseline.items() if k != "records"})
        save_json(output / "experiment_results.json", receipt)
        return receipt
    except BaseException as exc:
        receipt.update(status="failed", error_type=type(exc).__name__)
        save_json(output / "experiment_results.json", receipt)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), required=True)
    a = parser.parse_args()
    run(a.input_dir, a.model_dir, a.config, a.output_dir, a.device)
