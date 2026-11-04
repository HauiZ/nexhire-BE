"""Experimental supervised status head, separate from retrieval and hiring fit."""

import math

import numpy as np


LABELS = ("matched", "partial", "not_established_in_provided_evidence")
FEATURE_VERSION = "query-top3-context-interaction-v1"


def context_features(query, evidence_vectors, evidence_ids):
    """Use actual retrieved context, never a reviewed reference or target label."""
    q = np.asarray(query, dtype=np.float64)
    passages = np.asarray(evidence_vectors, dtype=np.float64)
    if (q.shape != (384,) or passages.ndim != 2 or passages.shape[1] != 384
            or not len(passages) or len(passages) != len(evidence_ids)
            or len(set(evidence_ids)) != len(evidence_ids)
            or any(not isinstance(i, str) or not i.strip() for i in evidence_ids)
            or not np.isfinite(q).all() or not np.isfinite(passages).all()
            or not np.isclose(np.linalg.norm(q), 1, atol=1e-4)
            or not np.allclose(np.linalg.norm(passages, axis=1), 1, atol=1e-4)):
        raise ValueError("Unique source IDs and finite unit 384-dimensional embeddings required")
    scores = passages @ q
    order = sorted(range(len(passages)), key=lambda i: (-float(scores[i]), evidence_ids[i]))
    top = order[:3]
    context = passages[top].mean(axis=0)
    top_scores = [float(scores[i]) for i in top]
    padded = top_scores + [-1.] * (3 - len(top))
    features = np.concatenate((q, context, np.abs(q - context), q * context,
        np.array([*padded, padded[0] - padded[1], padded[1] - padded[2], len(top) / 3])))
    return features, [evidence_ids[i] for i in top], top_scores


def validate_head(head, *, weights_sha256):
    if (head["schema"] != "nexhire-ai1-status-head-experimental-v1"
            or head["feature_version"] != FEATURE_VERSION
            or head["labels"] != list(LABELS) or head["weights_sha256"] != weights_sha256
            or head["encoder_dimension"] != 384 or head["max_sequence_length"] != 256
            or head["production_approved"] is not False or head["independent_gold"] is not False):
        raise ValueError("Experimental head must bind the exact encoder and feature schema")
    coef = np.asarray(head["coef"], dtype=float)
    intercept = np.asarray(head["intercept"], dtype=float)
    threshold = head["confidence_threshold"]
    if (coef.shape != (3, 1542) or intercept.shape != (3,)
            or not np.isfinite(coef).all() or not np.isfinite(intercept).all()
            or isinstance(threshold, bool) or not isinstance(threshold, (int, float))
            or not math.isfinite(threshold) or not 0 <= threshold <= 1):
        raise ValueError("Finite multiclass coefficients and probability threshold required")
    return coef, intercept


def probabilities(head, features, *, weights_sha256):
    coef, intercept = validate_head(head, weights_sha256=weights_sha256)
    x = np.asarray(features, dtype=float)
    if x.ndim != 2 or x.shape[1] != 1542 or not np.isfinite(x).all():
        raise ValueError("Finite feature matrix required")
    logits = x @ coef.T + intercept
    logits -= logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


def decisions(probs, threshold):
    probs = np.asarray(probs, dtype=float)
    if (probs.ndim != 2 or probs.shape[1] != 3 or not np.isfinite(probs).all()
            or (probs < 0).any() or (probs > 1).any()
            or not np.allclose(probs.sum(axis=1), 1)
            or isinstance(threshold, bool) or not isinstance(threshold, (int, float))
            or not math.isfinite(threshold) or not 0 <= threshold <= 1):
        raise ValueError("Three normalized class probabilities and finite threshold required")
    best = probs.argmax(axis=1)
    return np.where(probs.max(axis=1) >= threshold, best, -1)


def status_metrics(targets, predictions):
    y = np.asarray(targets)
    pred = np.asarray(predictions)
    if (y.ndim != 1 or pred.shape != y.shape or not len(y)
            or not np.isin(y, [0, 1, 2]).all() or not np.isin(pred, [-1, 0, 1, 2]).all()):
        raise ValueError("Nonempty aligned status labels required; -1 means abstention")
    # Abstention contributes a false negative, never disappears from macro-F1.
    confusion = [[int(((y == i) & (pred == j)).sum()) for j in [0, 1, 2, -1]] for i in range(3)]
    f1 = []
    for label in range(3):
        tp = int(((y == label) & (pred == label)).sum())
        fp = int(((y != label) & (pred == label)).sum())
        fn = int(((y == label) & (pred != label)).sum())
        f1.append(2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.)
    nonfull = int((y != 0).sum())
    false_full = int(((y != 0) & (pred == 0)).sum())
    return {"count": len(y), "macro_f1_including_abstention": float(np.mean(f1)),
        "class_f1": dict(zip(LABELS, f1)), "coverage": float((pred != -1).mean()),
        "accuracy_including_abstention": float((y == pred).mean()),
        "nonfull_count": nonfull, "false_matched_count": false_full,
        "false_matched_rate": false_full / nonfull if nonfull else None,
        "confusion_rows_true_columns_matched_partial_not_established_abstain": confusion}
