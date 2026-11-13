"""Golden fixtures, offline/online parity, and leakage/sensitivity audit tests for AI2 features v1."""

from datetime import date
import json
import math
from pathlib import Path
import unittest

from app.matching.ai2_features import (
    AI2_FEATURE_PROVENANCE_REGISTRY,
    build_canonical_input,
    extract_ai2_features,
    pilot_pair_to_canonical,
)
from app.schemas.ai1 import Ai1Assessment, Ai1Hit, Ai1Requirement
from app.schemas.ai2 import (
    AI2_FEATURE_NAMES,
    AI2_FORBIDDEN_FEATURE_NAMES,
    Ai2RequirementSpec,
)
from app.schemas.jd_plan import digest, snapshot_digest
from app.schemas.snapshots import (
    CandidateCertificationSnapshot,
    CandidateEducationSnapshot,
    CandidateExperienceSnapshot,
    CandidateMatchingSnapshot,
    CandidateProjectSnapshot,
    CandidateSkillSnapshot,
    JobMatchingSnapshot,
)


REF_DATE = date(2026, 11, 10)
REPO_ROOT = Path(__file__).resolve().parents[3]


def _sample_job(**overrides) -> JobMatchingSnapshot:
    base = {
        "id": "job-backend-1",
        "title": "Kỹ sư Lập trình Backend (Node.js/NestJS)",
        "description": "Xây dựng microservices và API tại Hà Nội.",
        "requirements": (
            "Yêu cầu bắt buộc:\n"
            "- Tối thiểu 3 năm kinh nghiệm phát triển backend với Node.js và TypeScript.\n"
            "- Thành thạo NestJS và PostgreSQL.\n"
            "Yêu cầu ưu tiên:\n"
            "- Có kinh nghiệm sử dụng Redis và Docker.\n"
            "- Tốt nghiệp Đại học chuyên ngành Công nghệ thông tin hoặc ngành kỹ thuật liên quan."
        ),
        "skills": ["Node.js", "TypeScript", "NestJS", "PostgreSQL"],
        "workingType": "HYBRID",
        "experienceLevel": "MIDDLE",
        "location": "Hà Nội",
    }
    base.update(overrides)
    return JobMatchingSnapshot(**base)


def _sample_candidate(**overrides) -> CandidateMatchingSnapshot:
    base = {
        "snapshotSchemaVersion": "candidate-matching-v2",
        "dataOrigin": "PARSED_CV",
        "candidateId": "cand-1",
        "summary": "Lập trình viên Backend Node.js và TypeScript.",
        "location": "TP. Hà Nội",
        "skills": [
            CandidateSkillSnapshot(id="skills/0", name="NodeJS"),
            CandidateSkillSnapshot(id="skills/1", name="TS"),
            CandidateSkillSnapshot(id="skills/2", name="Nest.js"),
            CandidateSkillSnapshot(id="skills/3", name="Postgres"),
        ],
        "experiences": [
            CandidateExperienceSnapshot(
                id="exp-1",
                title="Lập trình viên Backend Node.js",
                company="Công ty A",
                description="Phát triển RESTful API bằng Node.js, TypeScript, NestJS và PostgreSQL.",
                startYear=2024,
                startMonth=1,
                isCurrent=True,
            ),
            CandidateExperienceSnapshot(
                id="exp-2",
                title="Gia sư Tiếng Anh",
                company="Trung tâm B",
                description="Giảng dạy giao tiếp cho học viên.",
                startYear=2021,
                startMonth=1,
                endYear=2023,
                endMonth=12,
                isCurrent=False,
            ),
        ],
        "projects": [
            CandidateProjectSnapshot(
                id="proj-1",
                name="Hệ thống Thanh toán",
                description="Dịch vụ API dùng Redis và Docker.",
                technologies=["NestJS", "PostgreSQL", "Redis", "Docker"],
            )
        ],
        "educations": [
            CandidateEducationSnapshot(
                id="edu-1",
                degree="Cử nhân",
                fieldOfStudy="Khoa học Máy tính",
                school="Trường Đại học A",
            )
        ],
        "certifications": [
            CandidateCertificationSnapshot(id="cert-1", name="AWS Certified Developer - Associate")
        ],
    }
    base.update(overrides)
    return CandidateMatchingSnapshot(**base)


class Ai2FeatureExtractionTests(unittest.TestCase):
    def test_overlapping_experience_intervals_merge_without_double_counting(self):
        job = _sample_job()
        cand = _sample_candidate(
            experiences=[
                CandidateExperienceSnapshot(
                    id="exp-a",
                    title="Backend Developer",
                    description="Xây dựng dịch vụ Node.js và TypeScript.",
                    startYear=2022,
                    startMonth=1,
                    endYear=2024,
                    endMonth=12,
                    isCurrent=False,
                ),
                CandidateExperienceSnapshot(
                    id="exp-b",
                    title="Senior Backend Consultant",
                    description="Tối ưu PostgreSQL và NestJS.",
                    startYear=2023,
                    startMonth=1,
                    endYear=2025,
                    endMonth=12,
                    isCurrent=False,
                ),
            ]
        )
        res = extract_ai2_features(build_canonical_input(job, cand, reference_date=REF_DATE))
        # Union of [2022-01..2024-12] (36m) and [2023-01..2025-12] (36m) is 48 months, NOT 72.
        self.assertEqual(res.features.total_verified_experience_months, 48)
        self.assertEqual(res.features.relevant_experience_months, 48)
        self.assertEqual(res.features.relevant_to_required_years_ratio, round(4.0 / 3.0, 4))
        self.assertEqual(res.features.relevant_years_gap, 1.0)

    def test_irrelevant_experience_excluded_from_relevant_tenure(self):
        job = _sample_job()
        cand = _sample_candidate()
        res = extract_ai2_features(build_canonical_input(job, cand, reference_date=REF_DATE))
        # exp-1: 2024-01 -> 2026-11 (ref month) = 34 months relevant;
        # exp-2: 2021-01 -> 2023-12 = 36 months English tutor (irrelevant).
        self.assertEqual(res.features.relevant_experience_months, 34)
        self.assertEqual(res.features.total_verified_experience_months, 70)
        self.assertEqual(res.diagnostics.relevantExperienceIds, ("exp-1",))

    def test_unknown_dates_and_null_is_current_tracked_never_zero_fabricated(self):
        job = _sample_job()
        cand = _sample_candidate(
            experiences=[
                CandidateExperienceSnapshot(
                    id="exp-freelance",
                    title="Lập trình viên Backend Freelance",
                    description="Xây dựng API Node.js và PostgreSQL cho khách hàng.",
                    startYear=None,
                    endYear=None,
                    isCurrent=None,
                )
            ]
        )
        res = extract_ai2_features(build_canonical_input(job, cand, reference_date=REF_DATE))
        self.assertEqual(res.features.relevant_experience_months, 0)
        self.assertEqual(res.features.unknown_date_experience_count, 1)
        self.assertEqual(res.features.unknown_current_status_count, 1)
        self.assertTrue(res.features.has_relevant_experience_with_unknown_dates)
        self.assertTrue(res.features.has_any_unknown_dates)

    def test_education_only_scored_against_explicit_jd_and_no_school_prestige(self):
        job_no_edu = _sample_job(
            requirements="Yêu cầu bắt buộc:\n- Tối thiểu 2 năm kinh nghiệm Node.js.",
            description="Backend team",
        )
        cand_no_edu = _sample_candidate(educations=[])
        res = extract_ai2_features(build_canonical_input(job_no_edu, cand_no_edu, reference_date=REF_DATE))
        self.assertIsNone(res.features.jd_education_required_level)
        self.assertEqual(res.features.jd_education_importance_code, 0)
        self.assertIsNone(res.features.meets_jd_education_level)
        self.assertIsNone(res.features.education_field_match)

        # JD requires education, candidate omits section -> None (unknown), not False
        job_with_edu = _sample_job()
        res2 = extract_ai2_features(build_canonical_input(job_with_edu, cand_no_edu, reference_date=REF_DATE))
        self.assertEqual(res2.features.jd_education_required_level, 3)
        self.assertIsNone(res2.features.meets_jd_education_level)

        # Candidate explicitly has high school (tier 0) < required university (tier 3) -> False
        cand_hs = _sample_candidate(educations=[CandidateEducationSnapshot(degree="Tốt nghiệp THPT")])
        res3 = extract_ai2_features(build_canonical_input(job_with_edu, cand_hs, reference_date=REF_DATE))
        self.assertEqual(res3.features.candidate_max_education_level, 0)
        self.assertFalse(res3.features.meets_jd_education_level)

    def test_education_disjunction_and_master_bonus_clause(self):
        job_disj = _sample_job(
            requirements="Yêu cầu ưu tiên:\n- Tốt nghiệp Cao đẳng hoặc Đại học chuyên ngành Công nghệ thông tin.",
            skills=[],
        )
        cand_college = _sample_candidate(
            educations=[CandidateEducationSnapshot(degree="Cao đẳng", fieldOfStudy="Công nghệ thông tin")]
        )
        res = extract_ai2_features(build_canonical_input(job_disj, cand_college, reference_date=REF_DATE))
        self.assertEqual(res.features.jd_education_required_level, 2)
        self.assertTrue(res.features.meets_jd_education_level)
        self.assertTrue(res.features.education_field_match)

        # Master bonus clause must not raise minimum floor above Đại học (3)
        job_master_bonus = _sample_job(
            requirements="Yêu cầu ưu tiên:\n- Tốt nghiệp đại học chuyên ngành Marketing, Truyền thông hoặc Kinh tế, có bằng Thạc sĩ là lợi thế.",
            skills=[],
        )
        cand_bachelor = _sample_candidate(
            educations=[CandidateEducationSnapshot(degree="Cử nhân", fieldOfStudy="Marketing")]
        )
        res_m = extract_ai2_features(build_canonical_input(job_master_bonus, cand_bachelor, reference_date=REF_DATE))
        self.assertEqual(res_m.features.jd_education_required_level, 3)
        self.assertTrue(res_m.features.meets_jd_education_level)
        self.assertTrue(res_m.features.education_field_match)

    def test_vietnamese_aliases_and_no_gotomarket_false_positive(self):
        job_mk = _sample_job(
            title="Product Marketing Specialist",
            requirements=(
                "Yêu cầu bắt buộc:\n"
                "- Có từ 4 năm kinh nghiệm Product Marketing.\n"
                "- Chủ trì xây dựng chiến lược Go-to-Market (GTM) cho sản phẩm công nghệ."
            ),
            skills=[],
        )
        cand_mk = _sample_candidate(skills=[CandidateSkillSnapshot(name="Go-to-Market")])
        res = extract_ai2_features(build_canonical_input(job_mk, cand_mk, reference_date=REF_DATE))
        self.assertNotIn("Golang", res.diagnostics.jdTargetSkills)
        self.assertEqual(res.features.jd_min_years_required, 4.0)

        job_go = _sample_job(
            title="Golang Backend Developer",
            requirements="Yêu cầu bắt buộc:\n- Có từ 1 đến 2 năm kinh nghiệm lập trình với ngôn ngữ Golang (Go).",
            skills=[],
        )
        cand_go = _sample_candidate(
            skills=[CandidateSkillSnapshot(name="Go")],
            experiences=[
                CandidateExperienceSnapshot(
                    id="e1",
                    title="Backend Developer",
                    description="Xây dựng API bằng ngôn ngữ Go và PostgreSQL.",
                    startYear=2024,
                    startMonth=1,
                    isCurrent=True,
                )
            ],
        )
        res_go = extract_ai2_features(build_canonical_input(job_go, cand_go, reference_date=REF_DATE))
        self.assertIn("Golang", res_go.diagnostics.jdTargetSkills)
        self.assertEqual(res_go.features.jd_min_years_required, 1.0)
        self.assertEqual(res_go.features.declared_skill_coverage_ratio, 1.0)
        self.assertEqual(res_go.features.role_verified_skill_coverage_ratio, 1.0)

    def test_ai1_ready_and_missingness_never_error_as_zero(self):
        job = _sample_job()
        cand = _sample_candidate()
        job_sha = snapshot_digest(job)
        cand_sha = digest(cand.model_dump(mode="json"))

        # 1. DISABLED -> explicit None similarity, ai1_missing_indicator == 1.0
        disabled = Ai1Assessment(
            status="DISABLED",
            backend="disabled",
            reason="AI1_BACKEND_DISABLED",
            jobId=job.id,
            candidateId=cand.candidateId,
            jobSnapshotSha256=job_sha,
            candidateSnapshotSha256=cand_sha,
            planStatus="UNPREPARED",
        )
        res_dis = extract_ai2_features(
            build_canonical_input(job, cand, reference_date=REF_DATE, ai1_assessment=disabled)
        )
        self.assertFalse(res_dis.features.ai1_available)
        self.assertEqual(res_dis.features.ai1_missing_indicator, 1.0)
        self.assertEqual(res_dis.features.ai1_status_code, 1)
        self.assertIsNone(res_dis.features.ai1_mean_top1_similarity)
        self.assertIsNone(res_dis.features.ai1_required_coverage_ratio)

        # 2. UNAVAILABLE -> explicit code 2, None similarity
        unavail = disabled.model_copy(update={"status": "UNAVAILABLE", "backend": "local_m1", "reason": "AI1_BACKEND_UNAVAILABLE"})
        res_unav = extract_ai2_features(
            build_canonical_input(job, cand, reference_date=REF_DATE, ai1_assessment=unavail)
        )
        self.assertEqual(res_unav.features.ai1_status_code, 2)
        self.assertIsNone(res_unav.features.ai1_mean_top1_similarity)

        # 3. READY -> exact semantic signals preserved
        reqs = (
            Ai2RequirementSpec(requirementId="requirements/0", text="Node.js & TypeScript", importance="required", source="requirements"),
            Ai2RequirementSpec(requirementId="requirements/1", text="Redis", importance="preferred", source="requirements"),
        )
        ready = Ai1Assessment(
            status="READY",
            backend="local_m1",
            reason="RETRIEVED_EVIDENCE_REQUIRES_HR_REVIEW",
            jobId=job.id,
            candidateId=cand.candidateId,
            jobSnapshotSha256=job_sha,
            candidateSnapshotSha256=cand_sha,
            modelVersion="m1-v1",
            weightsSha256="a" * 64,
            manifestSha256="b" * 64,
            planStatus="UNPREPARED",
            requirements=(
                Ai1Requirement(
                    requirementId="requirements/0",
                    text="Node.js & TypeScript",
                    retrievalStatus="CANDIDATE_EVIDENCE",
                    evidence=(
                        Ai1Hit(
                            evidenceId="exp-1",
                            source="experience",
                            text="Node.js and TypeScript",
                            similarityScore=91.5,
                            reasonCodes=("EXACT_KEYWORD_MATCH",),
                        ),
                    ),
                ),
                Ai1Requirement(
                    requirementId="requirements/1",
                    text="Redis",
                    retrievalStatus="REVIEW_REQUIRED",
                    evidence=(
                        Ai1Hit(
                            evidenceId="exp-2",
                            source="experience",
                            text="Chưa từng dùng Redis",
                            similarityScore=42.0,
                            reasonCodes=("LEXICAL_ABSENT_PENALTY", "EXPLICIT_NEGATION_CUE"),
                        ),
                    ),
                ),
            ),
            truncatedTexts=1,
        )
        res_ready = extract_ai2_features(
            build_canonical_input(job, cand, reference_date=REF_DATE, ai1_assessment=ready, explicit_requirements=reqs)
        )
        self.assertTrue(res_ready.features.ai1_available)
        self.assertEqual(res_ready.features.ai1_missing_indicator, 0.0)
        self.assertEqual(res_ready.features.ai1_mean_top1_similarity, 66.75)
        self.assertEqual(res_ready.features.ai1_min_top1_similarity, 42.0)
        self.assertEqual(res_ready.features.ai1_required_mean_top1_similarity, 91.5)
        self.assertEqual(res_ready.features.ai1_preferred_mean_top1_similarity, 42.0)
        self.assertEqual(res_ready.features.ai1_coverage_ratio_above_ref, 0.5)
        self.assertEqual(res_ready.features.ai1_required_coverage_ratio, 1.0)
        self.assertEqual(res_ready.features.ai1_review_required_ratio, 0.5)
        self.assertEqual(res_ready.features.ai1_negation_cue_count, 1)
        self.assertEqual(res_ready.features.ai1_exact_keyword_match_ratio, 0.5)
        self.assertEqual(res_ready.features.ai1_truncated_texts_count, 1)

        # 4. Snapshot mismatch fails closed
        tampered = ready.model_copy(update={"candidateSnapshotSha256": "f" * 64})
        with self.assertRaisesRegex(ValueError, "binding mismatch"):
            build_canonical_input(job, cand, reference_date=REF_DATE, ai1_assessment=tampered)

    def test_offline_pilot_adapter_matches_online_snapshot_extraction(self):
        it_path = REPO_ROOT / "dataset/ai2-pilot-v1/sources/it.json"
        it_data = json.loads(it_path.read_text(encoding="utf-8"))
        job_dict = it_data["jobs"][0]
        cand_dict = job_dict["candidates"][0]

        offline_can = pilot_pair_to_canonical(job_dict, cand_dict, reference_date=REF_DATE)
        offline_res = extract_ai2_features(offline_can)

        # Build equivalent online JobMatchingSnapshot + CandidateMatchingSnapshot manually
        online_can = build_canonical_input(
            offline_can.job.model_copy(deep=True),
            offline_can.candidate.model_copy(deep=True),
            reference_date=REF_DATE,
            explicit_requirements=offline_can.requirements,
        )
        online_res = extract_ai2_features(online_can)
        self.assertEqual(offline_res.features, online_res.features)

    def test_leakage_invariance_id_school_prestige_and_whitespace(self):
        job = _sample_job()
        cand_a = _sample_candidate(
            candidateId="IT-J01-C01",
            fullName="Nguyễn Văn A",
            educations=[
                CandidateEducationSnapshot(
                    id="edu-1",
                    degree="Cử nhân",
                    fieldOfStudy="Khoa học Máy tính",
                    school="Đại học Bách Khoa Hà Nội",
                )
            ],
        )
        cand_b = _sample_candidate(
            candidateId="ANON-999",
            fullName="Trần Thị B",
            summary="   Lập trình viên   Backend Node.js   và   TypeScript.   ",
            educations=[
                CandidateEducationSnapshot(
                    id="edu-99",
                    degree="Cử nhân",
                    fieldOfStudy="Khoa học Máy tính",
                    school="Trường Đại học Tư thục Địa phương X",
                )
            ],
        )
        res_a = extract_ai2_features(build_canonical_input(job, cand_a, reference_date=REF_DATE))
        res_b = extract_ai2_features(build_canonical_input(job, cand_b, reference_date=REF_DATE))
        self.assertEqual(res_a.features, res_b.features)

    def test_provenance_registry_covers_every_feature_without_forbidden_names(self):
        self.assertEqual(tuple(p.name for p in AI2_FEATURE_PROVENANCE_REGISTRY), AI2_FEATURE_NAMES)
        self.assertEqual(len(set(AI2_FEATURE_NAMES)), len(AI2_FEATURE_NAMES))
        self.assertTrue(set(AI2_FEATURE_NAMES).isdisjoint(AI2_FORBIDDEN_FEATURE_NAMES))

    def test_all_160_pilot_pairs_extract_cleanly_without_nan_or_errors(self):
        total = 0
        for fname in ("it.json", "sales-marketing.json"):
            data = json.loads((REPO_ROOT / "dataset/ai2-pilot-v1/sources" / fname).read_text(encoding="utf-8"))
            for job_dict in data["jobs"]:
                for cand_dict in job_dict["candidates"]:
                    can = pilot_pair_to_canonical(job_dict, cand_dict, reference_date=REF_DATE)
                    res = extract_ai2_features(can)
                    row = res.features.to_matrix_row(missing_value=None)
                    self.assertEqual(len(row), len(AI2_FEATURE_NAMES))
                    for val in row:
                        if val is not None:
                            self.assertTrue(math.isfinite(val))
                    total += 1
        self.assertEqual(total, 160)


if __name__ == "__main__":
    unittest.main()
