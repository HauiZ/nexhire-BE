"""Shared weak-label metrics; correlated bilingual variants have half weight."""


def metrics(rows, scores, threshold):
    if len(rows) != len(scores):
        raise ValueError("Each row requires exactly one score")
    counts = dict(tp=0.0, fp=0.0, tn=0.0, fn=0.0)
    hard_count = hard_fp = 0.0
    for row, score in zip(rows, scores):
        key = ("tp" if row["label"] else "fp") if score >= threshold else ("fn" if row["label"] else "tn")
        counts[key] += 0.5
        if row["label"] == 0 and row["negative_type"] == "hard":
            hard_count += 0.5
            hard_fp += 0.5 * (score >= threshold)
    tp, fp, tn, fn = (counts[k] for k in ("tp", "fp", "tn", "fn"))
    ratio = lambda n, d: n / d if d else None
    recall, specificity = ratio(tp, tp + fn), ratio(tn, tn + fp)
    return {"rows": len(rows), "effective_variant_weight": 0.5, "confusion_weighted": counts,
        "accuracy": ratio(tp + tn, tp + tn + fp + fn), "precision": ratio(tp, tp + fp),
        "recall": recall, "f1": ratio(2 * tp, 2 * tp + fp + fn),
        "balanced_accuracy": (recall + specificity) / 2 if recall is not None and specificity is not None else None,
        "hard_negative_false_positive_rate": ratio(hard_fp, hard_count), "hard_negative_effective_count": hard_count}


def choose_threshold(rows, scores):
    if {r["label"] for r in rows} != {0, 1}:
        raise ValueError("Threshold calibration needs both classes")
    candidates = [(threshold, metrics(rows, scores, threshold)) for threshold in range(101)]
    return max(candidates, key=lambda p: (p[1]["balanced_accuracy"], p[1]["f1"] or 0, p[0]))[0]
