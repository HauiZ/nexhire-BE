"""Paired job-level bootstrap; no row resampling or automatic promotion decisions."""

import math
from numbers import Real
import random
from collections.abc import Mapping


def paired_bootstrap(candidate, baseline, *, seed=42, repetitions=2000, confidence=0.95):
    """Compare maps of job ID to a metric value or None using shared job draws.

    Undefined pairs are excluded and reported. Positive differences favor candidate
    only for higher-is-better metrics. Small-sample bootstrap intervals do not make
    synthetic silver independent gold or establish causal model superiority.
    """
    if not isinstance(candidate, Mapping) or not isinstance(baseline, Mapping):
        raise ValueError("metrics must be job-ID mappings")
    if not candidate or set(candidate) != set(baseline):
        raise ValueError("nonempty identical job sets required")
    if any(not isinstance(key, str) or not key.strip() for key in candidate):
        raise ValueError("job IDs must be nonempty strings")
    if type(seed) is not int:
        raise ValueError("seed must be an integer")
    if type(repetitions) is not int or not 100 <= repetitions <= 100000:
        raise ValueError("repetitions must be an integer in 100..100000")
    if (isinstance(confidence, bool) or not isinstance(confidence, Real)
            or not math.isfinite(confidence) or not 0 < confidence < 1):
        raise ValueError("confidence must be finite and between zero and one")
    differences = []
    excluded = []
    for job in sorted(candidate):
        values = (candidate[job], baseline[job])
        for value in values:
            if value is not None and (isinstance(value, bool)
                    or not isinstance(value, Real) or not math.isfinite(value)):
                raise ValueError("metric values must be finite numbers or None")
        if any(value is None for value in values):
            excluded.append(job)
        else:
            difference = values[0] - values[1]
            if not math.isfinite(difference):
                raise ValueError("metric difference must be finite")
            differences.append(difference)
    n = len(differences)
    result = {"method": "paired-job-percentile-bootstrap-v1", "seed": seed,
              "repetitions": repetitions, "confidence": confidence,
              "job_count": len(candidate), "eligible_jobs": n,
              "excluded_job_ids": excluded, "difference": None,
              "ci_lower": None, "ci_upper": None}
    if not n:
        return result
    # Divide before summation to avoid overflow of otherwise finite averages.
    result["difference"] = math.fsum(value / n for value in differences)
    rng = random.Random(seed)
    draws = sorted(math.fsum(differences[rng.randrange(n)] / n for _ in range(n))
                   for _ in range(repetitions))

    def quantile(probability):
        position = (len(draws) - 1) * probability
        lower = math.floor(position)
        fraction = position - lower
        upper = min(lower + 1, len(draws) - 1)
        return draws[lower] * (1 - fraction) + draws[upper] * fraction

    tail = (1 - confidence) / 2
    result.update(ci_lower=quantile(tail), ci_upper=quantile(1 - tail))
    return result
