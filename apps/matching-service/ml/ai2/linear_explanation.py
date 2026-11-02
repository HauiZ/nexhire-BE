"""Exact linear logit accounting; not calibrated fit or a hiring explanation."""

import math
from numbers import Real


def explain_logit(feature_names, transformed_values, coefficients, intercept):
    """Account for an LR decision on an already fitted/transformed ordered vector.

    Caller must bind the fitted transform/model and retain raw observations/source
    provenance separately. Terms use the transformed origin, not a population
    baseline or counterfactual. No model fitting or source-value imputation here.
    """
    names = tuple(feature_names)
    values = tuple(transformed_values)
    weights = tuple(coefficients)
    if (not names or len(names) != len(values) or len(names) != len(weights)
            or any(not isinstance(name, str) or not name.strip() for name in names)
            or len(set(names)) != len(names)):
        raise ValueError("unique ordered feature names and equal nonzero lengths required")

    def number(value):
        if isinstance(value, bool) or not isinstance(value, Real) or not math.isfinite(value):
            raise ValueError("finite real numbers required")
        return float(value)

    bias = number(intercept)
    terms = []
    for name, value, weight in zip(names, values, weights):
        value, weight = number(value), number(weight)
        contribution = number(value * weight)
        terms.append({"feature": name, "transformed_value": value,
                      "coefficient": weight, "logit_contribution": contribution})
    try:
        logit = number(math.fsum([bias] + [term["logit_contribution"] for term in terms]))
    except OverflowError as exc:
        raise ValueError("nonfinite aggregate logit") from exc
    probability = 1 / (1 + math.exp(-logit)) if logit >= 0 else (
        math.exp(logit) / (1 + math.exp(logit)))
    return {"method": "linear-transformed-origin-v1", "output_space": "binary-logit",
            "intercept": bias, "terms": terms, "logit": logit,
            "classifier_score": probability,
            "score_meaning": "UNCALIBRATED_SILVER_RELEVANCE_CLASSIFIER_SCORE"}
