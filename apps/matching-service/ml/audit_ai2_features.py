"""C06 leakage, missingness, and document-length sensitivity audit for ai2-features-v1."""

from __future__ import annotations

from datetime import date
import json
import math
from pathlib import Path
import statistics
import sys
from typing import Any

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.matching.ai2_features import (  # noqa: E402
    AI2_FEATURE_PROVENANCE_REGISTRY,
    build_canonical_input,
    extract_ai2_features,
    pilot_pair_to_canonical,
)
from app.schemas.ai1 import Ai1Assessment  # noqa: E402
from app.schemas.ai2 import (  # noqa: E402
    AI2_FEATURE_EXTRACTOR_VERSION,
    AI2_FEATURE_NAMES,
    AI2_FEATURE_SCHEMA_VERSION,
    AI2_FORBIDDEN_FEATURE_NAMES,
    AI2_PREPROCESSING_VERSION,
)
from app.schemas.jd_plan import digest, snapshot_digest  # noqa: E402


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if den_x == 0.0 or den_y == 0.0:
        return None
    return round(num / (den_x * den_y), 4)


def run_audit(sources_dir: Path, ref_date: date) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    word_counts: list[float] = []
    invariance_failures: list[str] = []
    missingness_failures: list[str] = []

    for fname in ("it.json", "sales-marketing.json"):
        data = json.loads((sources_dir / fname).read_text(encoding="utf-8"))
        for job_dict in data["jobs"]:
            for cand_dict in job_dict["candidates"]:
                can = pilot_pair_to_canonical(job_dict, cand_dict, reference_date=ref_date)
                res = extract_ai2_features(can)
                fdict = res.features.model_dump(mode="json")
                rows.append({"job_id": job_dict["job_id"], "candidate_id": cand_dict["candidate_id"], **fdict})
                word_counts.append(float(len(cand_dict["cv_text"].split())))

                # 1. ID + school-prestige + whitespace invariance test
                mutated_cand = can.candidate.model_copy(
                    update={
                        "candidateId": "ANON-CHECK",
                        "summary": f"   {can.candidate.summary or ''}   \n\n  ",
                        "educations": [
                            e.model_copy(update={"school": "Anon Local University"})
                            for e in can.candidate.educations
                        ],
                    }
                )
                mutated_res = extract_ai2_features(
                    build_canonical_input(
                        can.job,
                        mutated_cand,
                        reference_date=ref_date,
                        explicit_requirements=can.requirements,
                    )
                )
                if mutated_res.features != res.features:
                    invariance_failures.append(cand_dict["candidate_id"])

                # 2. Missingness sensitivity & no error-as-zero checks
                no_edu_cand = can.candidate.model_copy(update={"educations": []})
                no_edu_res = extract_ai2_features(
                    build_canonical_input(
                        can.job,
                        no_edu_cand,
                        reference_date=ref_date,
                        explicit_requirements=can.requirements,
                    )
                )
                if (
                    not no_edu_res.features.missing_education_section
                    or no_edu_res.features.candidate_max_education_level is not None
                    or no_edu_res.features.meets_jd_education_level is not None
                ):
                    missingness_failures.append(f"{cand_dict['candidate_id']}:education_missingness")

                no_dates_cand = can.candidate.model_copy(
                    update={
                        "experiences": [
                            e.model_copy(update={"startYear": None, "startMonth": None, "endYear": None, "endMonth": None, "isCurrent": None})
                            for e in can.candidate.experiences
                        ]
                    }
                )
                no_dates_res = extract_ai2_features(
                    build_canonical_input(
                        can.job,
                        no_dates_cand,
                        reference_date=ref_date,
                        explicit_requirements=can.requirements,
                    )
                )
                if no_dates_res.features.total_verified_experience_months != 0 or (
                    can.candidate.experiences and not no_dates_res.features.has_any_unknown_dates
                ):
                    missingness_failures.append(f"{cand_dict['candidate_id']}:date_missingness")

                ai1_unavail = Ai1Assessment(
                    status="UNAVAILABLE",
                    backend="local_m1",
                    reason="AI1_BACKEND_UNAVAILABLE",
                    jobId=can.job.id,
                    candidateId=can.candidate.candidateId,
                    jobSnapshotSha256=snapshot_digest(can.job),
                    candidateSnapshotSha256=digest(can.candidate.model_dump(mode="json")),
                    planStatus="UNPREPARED",
                )
                unavail_res = extract_ai2_features(
                    build_canonical_input(
                        can.job,
                        can.candidate,
                        reference_date=ref_date,
                        ai1_assessment=ai1_unavail,
                        explicit_requirements=can.requirements,
                    )
                )
                if (
                    unavail_res.features.ai1_available
                    or unavail_res.features.ai1_missing_indicator != 1.0
                    or unavail_res.features.ai1_mean_top1_similarity is not None
                ):
                    missingness_failures.append(f"{cand_dict['candidate_id']}:ai1_unavailable")

    feature_summary: dict[str, Any] = {}
    high_length_corr: list[dict[str, Any]] = []
    for name in AI2_FEATURE_NAMES:
        vals: list[float] = []
        paired_wc: list[float] = []
        null_count = 0
        for row, wc in zip(rows, word_counts):
            v = row[name]
            if v is None:
                null_count += 1
            else:
                num = 1.0 if isinstance(v, bool) else float(v)
                vals.append(num)
                paired_wc.append(wc)
        corr = _pearson(paired_wc, vals)
        if corr is not None and abs(corr) >= 0.5:
            high_length_corr.append({"feature": name, "corr_with_cv_words": corr})
        feature_summary[name] = {
            "non_null_count": len(vals),
            "null_count": null_count,
            "min": round(min(vals), 4) if vals else None,
            "max": round(max(vals), 4) if vals else None,
            "mean": round(statistics.fmean(vals), 4) if vals else None,
            "corr_with_cv_words": corr,
        }

    return {
        "feature_schema_version": AI2_FEATURE_SCHEMA_VERSION,
        "feature_extractor_version": AI2_FEATURE_EXTRACTOR_VERSION,
        "preprocessing_version": AI2_PREPROCESSING_VERSION,
        "score_reference_date": ref_date.isoformat(),
        "pairs_evaluated": len(rows),
        "feature_count": len(AI2_FEATURE_NAMES),
        "provenance_count": len(AI2_FEATURE_PROVENANCE_REGISTRY),
        "forbidden_feature_overlap": sorted(set(AI2_FEATURE_NAMES) & AI2_FORBIDDEN_FEATURE_NAMES),
        "id_school_whitespace_invariance_failures": invariance_failures,
        "missingness_ablation_failures": missingness_failures,
        "cv_word_count_range": {
            "min": int(min(word_counts)),
            "max": int(max(word_counts)),
            "mean": round(statistics.fmean(word_counts), 2),
        },
        "features_with_abs_length_corr_ge_0_5": high_length_corr,
        "feature_distributions": feature_summary,
    }


def main() -> None:
    sources_dir = REPO_ROOT / "dataset/ai2-pilot-v1/sources"
    out_path = REPO_ROOT / "dataset/ai2-pilot-v1/plan_c_feature_audit.json"
    report = run_audit(sources_dir, date(2026, 11, 10))
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "pairs_evaluated": report["pairs_evaluated"],
        "feature_count": report["feature_count"],
        "invariance_failures": len(report["id_school_whitespace_invariance_failures"]),
        "missingness_failures": len(report["missingness_ablation_failures"]),
        "forbidden_overlap": len(report["forbidden_feature_overlap"]),
        "high_length_corr": report["features_with_abs_length_corr_ge_0_5"],
    }, indent=2))


if __name__ == "__main__":
    main()
