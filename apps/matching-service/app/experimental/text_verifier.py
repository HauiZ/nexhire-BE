"""Pure NumPy head for frozen, jointly attended NLI pair representations.

The caller supplies CLS and NLI probabilities in the frozen encoder's order.
Recruitment labels are learned: neutral NLI is never mapped manually to partial.
Predictions concern only the provided evidence, not full CV completeness.
"""

import re
from numbers import Real

import numpy as np


FEATURE_VERSION = "nli-joint-pair-cls-probs-v1"
LABELS = ("matched", "partial", "not_established_in_provided_evidence")


def _array(values):
    try:
        result = np.asarray(values, dtype=np.float64)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Finite numeric values required") from exc
    if not np.isfinite(result).all():
        raise ValueError("Finite numeric values required")
    return result


def _normalized(probs):
    return (not (probs < 0).any() and not (probs > 1).any()
            and np.allclose(probs.sum(axis=-1), 1., rtol=0., atol=1e-6))


def _threshold(value):
    if (isinstance(value, (bool, np.bool_)) or not isinstance(value, Real)
            or not np.isfinite(value) or not 0 <= value <= 1):
        raise ValueError("Finite confidence threshold in [0, 1] required")


def pair_features(hidden, nli_probs):
    """Return 384 unit CLS coordinates followed by three NLI probabilities."""
    hidden = _array(hidden)
    probs = _array(nli_probs)
    if hidden.shape != (384,) or probs.shape != (3,) or not _normalized(probs):
        raise ValueError("384 CLS coordinates and three normalized NLI probabilities required")
    # Scaling first avoids norm overflow or underflow for finite nonzero CLS.
    scale = np.max(np.abs(hidden))
    if scale == 0:
        raise ValueError("Nonzero CLS vector required")
    unit = hidden / scale
    unit /= np.linalg.norm(unit)
    return np.concatenate((unit, probs))


def validate_head(head, *, weights_sha256):
    """Validate an experimental artifact and return its coefficient arrays."""
    if (not isinstance(head, dict)
            or not isinstance(weights_sha256, str)
            or re.fullmatch(r"[0-9a-fA-F]{64}", weights_sha256) is None
            or head.get("schema") != "nexhire-text-verifier-experimental-v1"
            or head.get("feature_version") != FEATURE_VERSION
            or head.get("labels") != list(LABELS)
            or head.get("nli_weights_sha256") != weights_sha256
            or head.get("production_approved") is not False
            or head.get("independent_gold") is not False
            or not isinstance(head.get("coef"), list)
            or not all(isinstance(row, list) for row in head["coef"])
            or not isinstance(head.get("intercept"), list)):
        raise ValueError("Experimental head must bind the exact NLI weights and feature schema")
    coef = _array(head["coef"])
    intercept = _array(head["intercept"])
    if coef.shape != (3, 387) or intercept.shape != (3,):
        raise ValueError("3x387 coefficients and three intercepts required")
    _threshold(head.get("confidence_threshold"))
    return coef, intercept


def probabilities(head, features, *, weights_sha256):
    """Compute stable softmax probabilities for a batch of pair features."""
    coef, intercept = validate_head(head, weights_sha256=weights_sha256)
    features = _array(features)
    if features.ndim != 2 or features.shape[1] != 387:
        raise ValueError("Finite feature matrix with 387 columns required")
    with np.errstate(over="ignore", invalid="ignore"):
        logits = features @ coef.T + intercept
    if not np.isfinite(logits).all():
        raise ValueError("Head and features must produce finite logits")
    with np.errstate(over="ignore", under="ignore"):
        logits -= logits.max(axis=1, keepdims=True)
        exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


def decisions(probs, threshold):
    """Return class indices, or -1 when confidence is below the threshold."""
    probs = _array(probs)
    _threshold(threshold)
    if probs.ndim != 2 or probs.shape[1] != 3 or not _normalized(probs):
        raise ValueError("Three normalized class probabilities per row required")
    return np.where(probs.max(axis=1) >= threshold, probs.argmax(axis=1), -1)
