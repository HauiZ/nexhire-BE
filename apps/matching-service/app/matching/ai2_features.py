"""Shared offline/online deterministic feature & AI1 signal extraction for AI2 (v1)."""

from __future__ import annotations

from datetime import date
import re
from typing import Any, Iterable, Sequence

from app.matching.normalizer import normalize_semantic_text, normalize_skill, normalize_text
from app.schemas.ai1 import Ai1Assessment, Ai1Requirement
from app.schemas.ai2 import (
    AI2_FEATURE_NAMES,
    Ai2CanonicalInput,
    Ai2ExtractionDiagnostics,
    Ai2FeatureExtractionResult,
    Ai2FeatureProvenance,
    Ai2FeatureVector,
    Ai2RequirementSpec,
)
from app.schemas.jd_plan import digest, snapshot_digest, source_blocks, source_requirements
from app.schemas.jd_plan_context import JobPlanContext
from app.schemas.snapshots import (
    CandidateCertificationSnapshot,
    CandidateEducationSnapshot,
    CandidateExperienceSnapshot,
    CandidateMatchingSnapshot,
    CandidateProjectSnapshot,
    CandidateSkillSnapshot,
    JobMatchingSnapshot,
)


AI2_TERM_ALIASES: dict[str, tuple[str, ...]] = {
    "node.js": ("nodejs", "node.js", "node"),
    "nodejs": ("node.js", "nodejs", "node"),
    "react": ("react", "reactjs", "react.js"),
    "reactjs": ("react", "reactjs", "react.js"),
    "react.js": ("react", "reactjs", "react.js"),
    "next.js": ("next.js", "nextjs"),
    "nextjs": ("next.js", "nextjs"),
    "nestjs": ("nestjs", "nest.js", "nest"),
    "nest.js": ("nestjs", "nest.js", "nest"),
    "typescript": ("typescript", "ts"),
    "ts": ("typescript", "ts"),
    "javascript": ("javascript", "js"),
    "js": ("javascript", "js"),
    "postgresql": ("postgresql", "postgres", "postgre sql"),
    "postgres": ("postgresql", "postgres", "postgre sql"),
    "kubernetes": ("kubernetes", "k8s"),
    "k8s": ("kubernetes", "k8s"),
    "ci/cd": ("ci/cd", "cicd"),
    "cicd": ("ci/cd", "cicd"),
    ".net": (".net", "dotnet", "asp.net", "asp.net core"),
    "dotnet": (".net", "dotnet", "asp.net", "asp.net core"),
    "asp.net": ("asp.net", ".net", "dotnet"),
    "c#": ("c#", "csharp"),
    "c++": ("c++", "cpp"),
    "golang": ("golang", "go"),
    "go": ("golang", "go"),
    "aws": ("aws", "amazon web services"),
    "gcp": ("gcp", "google cloud", "google cloud platform"),
    "ga4": ("ga4", "google analytics 4", "google analytics"),
    "google analytics 4": ("ga4", "google analytics 4", "google analytics"),
    "google analytics": ("google analytics", "ga4", "google analytics 4"),
    "meta ads": ("meta ads", "facebook ads"),
    "facebook ads": ("facebook ads", "meta ads"),
    "google ads": ("google ads", "google adwords"),
    "crm": ("crm", "quản trị quan hệ khách hàng"),
    "seo": ("seo", "tối ưu hóa công cụ tìm kiếm"),
    "b2b": ("b2b", "khách hàng doanh nghiệp"),
    "saas": ("saas", "phần mềm dịch vụ"),
    "restful api": ("restful api", "rest api"),
    "rest api": ("rest api", "restful api"),
    "scrum": ("scrum", "agile"),
    "agile": ("agile", "scrum"),
    "istqb": ("istqb", "istqb foundation", "istqb certified tester"),
}

KNOWN_SKILLS_CATALOG: tuple[str, ...] = (
    "Node.js", "TypeScript", "JavaScript", "NestJS", "Express.js", "React", "Next.js",
    "Vue.js", "Angular", "Flutter", "Dart", "Python", "FastAPI", "Django", "Flask",
    "Java", "Spring Boot", "Golang", "C#", ".NET", "ASP.NET Core", "C++", "PHP", "Laravel",
    "PostgreSQL", "MySQL", "MongoDB", "SQL", "BigQuery", "ClickHouse", "Redis",
    "Elasticsearch", "RabbitMQ", "Kafka", "Docker", "Kubernetes", "Terraform",
    "AWS", "GCP", "Azure", "Linux", "Git", "CI/CD", "Jenkins", "GitLab",
    "Microservices", "RESTful API", "GraphQL", "gRPC", "Apache Spark", "PySpark", "Apache Airflow",
    "PyTorch", "TensorFlow", "Scikit-learn", "Power BI", "Tableau", "Looker Studio",
    "Selenium", "Cypress", "Playwright", "Jest", "React Testing Library", "Appium",
    "Postman", "JMeter", "ISTQB", "Figma", "UI/UX", "Firebase", "HTML", "CSS", "WordPress",
    "Salesforce", "HubSpot", "CRM", "SaaS", "B2B", "B2C", "ERP", "Odoo", "SAP", "MISA",
    "SEO", "SEM", "Google Ads", "Meta Ads", "TikTok Ads", "GA4", "Google Tag Manager",
    "Google Search Console", "Ahrefs", "SEMrush", "Screaming Frog", "Email Marketing",
    "Content Marketing", "Copywriting", "Telesales", "Cold Calling", "Key Account",
    "Pipeline", "ROI", "KPI", "TOEIC", "IELTS", "PMP", "Excel",
)

_VI_STOPWORDS = frozenset({
    "và", "hoặc", "của", "cho", "với", "tại", "trên", "trong", "về", "đến", "từ", "theo",
    "các", "những", "một", "hai", "ba", "này", "đó", "là", "có", "được", "làm", "việc",
    "kinh", "nghiệm", "kỹ", "năng", "kiến", "thức", "hiểu", "biết", "thành", "thạo",
    "sử", "dụng", "làm", "tham", "gia", "phát", "triển", "xây", "dựng", "thiết", "kế",
    "quản", "lý", "vận", "hành", "triển", "khai", "tối", "ưu", "hóa", "bảo", "trì",
    "tối", "thiểu", "ít", "nhất", "năm", "tháng", "khả", "năng", "tốt", "yêu", "cầu",
    "bắt", "buộc", "ưu", "tiên", "tiêu", "chí", "lợi", "thế", "chuyên", "ngành",
    "tốt", "nghiệp", "đại", "học", "cao", "đẳng", "trung", "cấp", "liên", "quan",
    "công", "nghệ", "dự", "án", "quy", "mô", "lớn", "hệ", "thống", "ứng", "dụng",
    "giải", "pháp", "nền", "tảng", "cơ", "bản", "thực", "tế", "chiến", "công", "cụ",
    "giao", "tiếp", "trình", "bày", "hỗ", "trợ", "phối", "hợp", "chịu", "trách", "nhiệm",
    "như", "hoạt", "động", "bằng", "cấp", "độ", "cao", "môi", "trường", "vị", "trí",
    "nhân", "viên", "chuyên", "viên", "kỹ", "sư", "lập", "trình", "trưởng", "phó",
    "senior", "junior", "mid", "middle", "fresher", "intern", "executive", "manager",
    "developer", "engineer", "specialist", "lead", "to", "for", "and", "or", "with",
    "in", "on", "of", "the", "a", "an", "using", "experience", "years", "year",
})

_DOMAIN_TITLE_GENERIC = frozenset({
    "nhân", "viên", "chuyên", "kỹ", "sư", "lập", "trình", "công", "nghệ",
    "senior", "junior", "mid", "middle", "fresher", "intern", "lead", "manager",
    "executive", "specialist", "developer", "engineer", "analyst", "coordinator",
    "trưởng", "nhóm", "phòng", "tại", "về", "và", "hoặc",
})

_EDU_TIERS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (5, ("tiến sĩ", "phd", "doctorate", "tiến sỹ")),
    (4, ("thạc sĩ", "thạc sỹ", "master")),
    (3, ("đại học", "cử nhân", "kỹ sư", "bác sĩ", "dược sĩ", "bachelor", "university")),
    (2, ("cao đẳng", "cử nhân cao đẳng", "associate")),
    (1, ("trung cấp", "vocational")),
    (0, ("thpt", "trung học phổ thông", "high school")),
)

_EDU_FIELD_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({
        "công nghệ thông tin", "cntt", "khoa học máy tính", "kỹ thuật phần mềm",
        "công nghệ phần mềm", "hệ thống thông tin", "toán tin", "trí tuệ nhân tạo",
        "khoa học dữ liệu", "tin học", "kỹ thuật máy tính", "mạng máy tính",
        "software engineering", "computer science", "information technology",
        "data science", "artificial intelligence",
    }),
    frozenset({
        "marketing", "truyền thông", "báo chí", "quan hệ công chúng", "ngôn ngữ",
        "quản trị kinh doanh", "kinh tế", "thương mại", "tài chính", "ngân hàng",
        "hệ thống thông tin quản lý", "kinh doanh quốc tế", "thương mại điện tử",
    }),
    frozenset({
        "y khoa", "y đa khoa", "dược học", "dược", "kỹ thuật y sinh", "y tế",
        "quản trị kinh doanh",
    }),
    frozenset({
        "thiết kế nội thất", "mỹ thuật công nghiệp", "kiến trúc", "thiết kế",
        "kinh tế",
    }),
)

_LOCATION_CANONICAL: dict[str, tuple[str, ...]] = {
    "ho chi minh": ("tp hcm", "tp.hcm", "tphcm", "hồ chí minh", "ho chi minh", "sài gòn", "saigon", "hcm"),
    "ha noi": ("hà nội", "ha noi", "hanoi", "hn"),
    "da nang": ("đà nẵng", "da nang", "danang"),
    "hai phong": ("hải phòng", "hai phong"),
    "can tho": ("cần thơ", "can tho"),
    "binh duong": ("bình dương", "binh duong"),
    "dong nai": ("đồng nai", "dong nai"),
}

_REQUIRED_HEAD_RE = re.compile(r"(?:yêu cầu\s+bắt buộc|tiêu chuẩn\s+bắt buộc|bắt buộc|must\s+have|required)\s*:?$", re.IGNORECASE)
_PREFERRED_HEAD_RE = re.compile(r"(?:yêu cầu\s+ưu tiên|tiêu chí\s+ưu tiên|ưu tiên|preferred|nice\s+to\s+have|plus)\s*:?$", re.IGNORECASE)
_YEARS_PATTERNS = (
    re.compile(r"(?:tối thiểu|ít nhất|trên|từ|at least|minimum|min\.?)\s*(\d+(?:[.,]\d+)?)\s*(?:(?:-|đến|to)\s*\d+(?:[.,]\d+)?\s*)?năm\b", re.IGNORECASE),
    re.compile(r"(\d+(?:[.,]\d+)?)\s*\+?\s*năm\s+kinh\s+nghiệm", re.IGNORECASE),
    re.compile(r"(?:at least|minimum|min\.?)\s*(\d+(?:[.,]\d+)?)\+?\s*years?\b", re.IGNORECASE),
    re.compile(r"(\d+(?:[.,]\d+)?)\+\s*years?\b", re.IGNORECASE),
)
_KNOWN_CERT_TERMS = (
    "aws", "azure", "gcp", "google cloud", "cka", "ckad", "istqb", "pmp",
    "toeic", "ielts", "cambridge", "hubspot", "salesforce", "google ads",
    "google analytics", "ga4", "meta certified", "databricks", "scrum",
    "deeplearning.ai", "chứng chỉ",
)


def _term_variants(term: str) -> tuple[str, ...]:
    norm_sem = normalize_semantic_text(term)
    norm_sk = normalize_skill(term)
    variants: list[str] = []
    for candidate in (norm_sem, norm_sk, *AI2_TERM_ALIASES.get(norm_sem, ()), *AI2_TERM_ALIASES.get(norm_sk, ())):
        cleaned = normalize_semantic_text(candidate)
        if cleaned and cleaned not in variants:
            variants.append(cleaned)
    return tuple(variants)


def _contains_term(haystack_sem: str, haystack_ascii: str, term: str) -> bool:
    if not haystack_sem or not term:
        return False
    for variant in _term_variants(term):
        # Use Unicode-preserving boundary match first so Vietnamese diacritics remain distinct
        # (prevents short ASCII tokens like 'ai' or 'go' from matching Vietnamese words),
        # while still permitting sentence-ending '.' after a skill token (e.g. 'TypeScript.').
        # Disallow adjacent hyphens specifically on 'go' to prevent 'go-to-market' false positives.
        if variant == "go":
            pattern = r"(?<![0-9a-zA-ZÀ-ỹ+#.\-])" + re.escape(variant) + r"(?![0-9a-zA-ZÀ-ỹ+#\-]|\.[0-9a-zA-ZÀ-ỹ])"
        else:
            pattern = r"(?<![0-9a-zA-ZÀ-ỹ+#.])" + re.escape(variant) + r"(?![0-9a-zA-ZÀ-ỹ+#]|\.[0-9a-zA-ZÀ-ỹ])"
        if re.search(pattern, haystack_sem):
            return True
        # Only use ASCII-folded fallback for sufficiently specific multi-character phrases
        ascii_variant = normalize_text(variant)
        if ascii_variant and len(ascii_variant) >= 4 and " " in ascii_variant:
            ascii_pat = r"(?<![0-9a-z+#.])" + re.escape(ascii_variant) + r"(?![0-9a-z+#]|\.[0-9a-z])"
            if re.search(ascii_pat, haystack_ascii):
                return True
    return False


def _content_tokens(text: str) -> set[str]:
    norm = normalize_semantic_text(text)
    tokens = re.findall(r"[0-9a-zA-ZÀ-ỹ+#.]{2,}", norm)
    return {t for t in tokens if t not in _VI_STOPWORDS}


def build_canonical_requirements(
    job: JobMatchingSnapshot,
    *,
    explicit_requirements: Sequence[Ai2RequirementSpec] | None = None,
    plan_context: JobPlanContext | None = None,
) -> tuple[Ai2RequirementSpec, ...]:
    if explicit_requirements is not None:
        return tuple(explicit_requirements)
    if plan_context is not None and plan_context.confirmed_plan is not None:
        specs: list[Ai2RequirementSpec] = []
        for req in plan_context.confirmed_plan.requirements:
            imp_set = {c.importance for c in req.components}
            if "core" in imp_set:
                importance = "required"
            elif "preferred" in imp_set or "supplementary" in imp_set:
                importance = "preferred"
            else:
                importance = "unknown"
            specs.append(
                Ai2RequirementSpec(
                    requirementId=req.requirement_id,
                    text=req.original_text,
                    importance=importance,
                    source="plan",
                )
            )
        return tuple(specs)

    specs = []
    for idx, skill in enumerate(job.skills):
        cleaned = skill.strip()
        if cleaned:
            specs.append(
                Ai2RequirementSpec(
                    requirementId=f"skills/{idx}",
                    text=cleaned,
                    importance="unknown",
                    source="skills",
                )
            )

    current_importance = "unknown"
    req_idx = 0
    for raw_line in (job.requirements or "").splitlines():
        stripped = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s+", "", raw_line).strip()
        if not stripped:
            continue
        if _REQUIRED_HEAD_RE.match(stripped):
            current_importance = "required"
            continue
        if _PREFERRED_HEAD_RE.match(stripped):
            current_importance = "preferred"
            continue
        for block in source_blocks(stripped):
            specs.append(
                Ai2RequirementSpec(
                    requirementId=f"requirements/{req_idx}",
                    text=block,
                    importance=current_importance,
                    source="requirements",
                )
            )
            req_idx += 1

    if not specs and job.description:
        for idx, block in enumerate(source_blocks(job.description)):
            specs.append(
                Ai2RequirementSpec(
                    requirementId=f"description/{idx}",
                    text=block,
                    importance="unknown",
                    source="description",
                )
            )
    return tuple(specs)


def _extract_jd_target_skills(
    job: JobMatchingSnapshot,
    requirements: tuple[Ai2RequirementSpec, ...],
) -> tuple[str, ...]:
    found: list[str] = []
    seen_keys: set[str] = set()

    def add_skill(raw: str) -> None:
        key = normalize_skill(raw) or normalize_semantic_text(raw)
        if not key or key in seen_keys:
            return
        seen_keys.add(key)
        found.append(raw.strip())

    for skill in job.skills:
        if skill.strip():
            add_skill(skill)

    req_text = "\n".join(r.text for r in requirements if r.source != "description")
    req_sem = normalize_semantic_text(req_text)
    req_ascii = normalize_text(req_text)
    for catalog_skill in KNOWN_SKILLS_CATALOG:
        if _contains_term(req_sem, req_ascii, catalog_skill):
            add_skill(catalog_skill)
    return tuple(found)


def _extract_min_years_required(requirements: tuple[Ai2RequirementSpec, ...], job: JobMatchingSnapshot) -> float | None:
    required_years: list[float] = []
    other_years: list[float] = []
    items = requirements or tuple(
        Ai2RequirementSpec(requirementId=f"raw/{i}", text=t, importance="unknown", source="requirements")
        for i, t in enumerate(source_blocks(job.requirements))
    )
    for req in items:
        matched_in_req = False
        for pat in _YEARS_PATTERNS:
            for match in pat.finditer(req.text):
                raw_num = match.group(1).replace(",", ".")
                try:
                    val = float(raw_num)
                except ValueError:
                    continue
                if 0.0 <= val <= 30.0:
                    if req.importance == "required":
                        required_years.append(val)
                    else:
                        other_years.append(val)
                    matched_in_req = True
            if matched_in_req:
                break
    if required_years:
        return max(required_years)
    if other_years:
        return max(other_years)
    return None


def _merge_intervals(intervals: Iterable[tuple[int, int]]) -> int:
    total = 0
    merged_end = -1
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if start >= merged_end:
            total += end - start
            merged_end = end
        elif end > merged_end:
            total += end - merged_end
            merged_end = end
    return total


def _canonical_location(value: str | None) -> str | None:
    if not value:
        return None
    norm = normalize_semantic_text(value)
    ascii_norm = normalize_text(value)
    for canonical, variants in _LOCATION_CANONICAL.items():
        for v in variants:
            if v in norm or v in ascii_norm:
                return canonical
    return ascii_norm or None


def _extract_education_features(
    requirements: tuple[Ai2RequirementSpec, ...],
    job: JobMatchingSnapshot,
    candidate: CandidateMatchingSnapshot,
) -> tuple[int | None, int, int | None, bool | None, bool | None, tuple[str, ...]]:
    edu_triggers = (
        "tốt nghiệp", "đại học", "cao đẳng", "trung cấp", "cử nhân",
        "kỹ sư", "thạc sĩ", "tiến sĩ", "bachelor", "master", "phd", "bằng cấp",
    )
    edu_reqs: list[Ai2RequirementSpec] = [
        r for r in requirements if any(k in normalize_semantic_text(r.text) for k in edu_triggers)
    ]
    if not edu_reqs and job.requirements:
        for i, blk in enumerate(source_blocks(job.requirements)):
            if any(k in normalize_semantic_text(blk) for k in edu_triggers):
                edu_reqs.append(Ai2RequirementSpec(requirementId=f"edu/{i}", text=blk, importance="unknown", source="requirements"))

    if not edu_reqs:
        cand_max = _candidate_max_edu_level(candidate)
        return None, 0, cand_max, None, None, ()

    importance_code = 2 if any(r.importance == "required" for r in edu_reqs) else 1
    req_levels: list[int] = []
    field_clauses: list[str] = []
    keywords: list[str] = []

    for req in edu_reqs:
        # Strip optional bonus clause like ", có bằng Thạc sĩ là lợi thế" before finding minimum degree floor
        base_text = re.split(r",\s*(?:có bằng|bằng|ưu tiên thêm)[^,.]*là\s+(?:lợi thế|điểm cộng)", req.text, flags=re.IGNORECASE)[0]
        base_sem = normalize_semantic_text(base_text)
        tiers_found = []
        for tier, phrases in _EDU_TIERS:
            if any(re.search(r"(?<![0-9a-zA-ZÀ-ỹ])" + re.escape(p) + r"(?![0-9a-zA-ZÀ-ỹ])", base_sem) for p in phrases):
                tiers_found.append(tier)
                keywords.append(phrases[0])
        if tiers_found:
            req_levels.append(min(tiers_found))

        m_field = re.search(r"(?:chuyên\s+ngành|các\s+ngành|ngành)\s+([^.;]+)", base_text, flags=re.IGNORECASE)
        if m_field:
            field_clauses.append(m_field.group(1))

    jd_req_level = max(req_levels) if req_levels else None
    cand_max = _candidate_max_edu_level(candidate)
    if jd_req_level is None or cand_max is None:
        meets_level = None
    else:
        meets_level = cand_max >= jd_req_level

    field_match: bool | None = None
    if field_clauses:
        if not candidate.educations:
            field_match = None
        else:
            cand_edu_texts = [
                normalize_semantic_text(f"{e.degree or ''} {e.fieldOfStudy or ''} {e.description or ''}")
                for e in candidate.educations
            ]
            cand_edu_texts = [t for t in cand_edu_texts if t]
            if not cand_edu_texts:
                field_match = None
            else:
                field_match = _match_education_fields(field_clauses, cand_edu_texts)

    return jd_req_level, importance_code, cand_max, meets_level, field_match, tuple(dict.fromkeys(keywords))


def _candidate_max_edu_level(candidate: CandidateMatchingSnapshot) -> int | None:
    if not candidate.educations:
        return None
    highest: int | None = None
    for edu in candidate.educations:
        haystack = normalize_semantic_text(f"{edu.degree or ''} {edu.fieldOfStudy or ''} {edu.description or ''}")
        if not haystack:
            continue
        for tier, phrases in _EDU_TIERS:
            if any(re.search(r"(?<![0-9a-zA-ZÀ-ỹ])" + re.escape(p) + r"(?![0-9a-zA-ZÀ-ỹ])", haystack) for p in phrases):
                highest = tier if highest is None else max(highest, tier)
                break
    return highest


def _match_education_fields(field_clauses: list[str], cand_edu_texts: list[str]) -> bool:
    joined_clauses = normalize_semantic_text(" ".join(field_clauses))
    allows_related = any(k in joined_clauses for k in ("liên quan", "tương đương", "related"))
    raw_items = re.split(r"[,/]|\bhoặc\b|\bor\b|\bvà\b", joined_clauses)
    target_phrases = []
    for item in raw_items:
        cleaned = re.sub(r"\b(?:các\s+ngành|ngành\s+kỹ\s+thuật|liên\s+quan|trở\s+lên|khác)\b", "", item).strip()
        if len(cleaned) >= 2:
            target_phrases.append(cleaned)

    for cand_text in cand_edu_texts:
        for tp in target_phrases:
            if tp in cand_text or (_content_tokens(tp) and _content_tokens(tp).issubset(_content_tokens(cand_text))):
                return True
        if allows_related:
            for group in _EDU_FIELD_GROUPS:
                jd_in_group = any(term in joined_clauses for term in group)
                cand_in_group = any(term in cand_text for term in group)
                if jd_in_group and cand_in_group:
                    return True
    return False


def _extract_certification_features(
    requirements: tuple[Ai2RequirementSpec, ...],
    job: JobMatchingSnapshot,
    candidate: CandidateMatchingSnapshot,
) -> tuple[bool, int, int, tuple[str, ...], tuple[str, ...]]:
    req_texts = [r.text for r in requirements]
    if not req_texts and job.requirements:
        req_texts = source_blocks(job.requirements)

    cert_reqs = [t for t in req_texts if "chứng chỉ" in normalize_semantic_text(t) or "certificate" in normalize_semantic_text(t) or "certification" in normalize_semantic_text(t)]
    jd_cert_present = bool(cert_reqs)

    jd_cert_keywords: list[str] = []
    for t in cert_reqs:
        t_sem = normalize_semantic_text(t)
        for kw in _KNOWN_CERT_TERMS:
            if kw != "chứng chỉ" and kw in t_sem and kw not in jd_cert_keywords:
                jd_cert_keywords.append(kw)

    matched_certs: list[str] = []
    if candidate.certifications:
        jd_full_sem = normalize_semantic_text(" ".join([job.title, *req_texts]))
        for cert in candidate.certifications:
            cert_sem = normalize_semantic_text(f"{cert.name} {cert.issuer or ''} {cert.description or ''}")
            if any(kw in cert_sem for kw in jd_cert_keywords):
                matched_certs.append(cert.name)
            elif jd_cert_present:
                # Match domain keywords from cert requirements (e.g., AWS / Google Ads / ISTQB / TOEIC / English)
                cert_tokens = _content_tokens(cert_sem)
                req_tokens = set().union(*(_content_tokens(ct) for ct in cert_reqs)) if cert_reqs else set()
                if len(cert_tokens & req_tokens) >= 1 and any(len(tok) >= 3 for tok in (cert_tokens & req_tokens)):
                    matched_certs.append(cert.name)
            else:
                # Even if JD didn't mandate a cert, check if cert directly supports a JD technical tool (e.g. HubSpot, AWS, CKA)
                if any(_contains_term(jd_full_sem, normalize_text(jd_full_sem), kw) and kw in cert_sem for kw in _KNOWN_CERT_TERMS if kw != "chứng chỉ"):
                    matched_certs.append(cert.name)

    return (
        jd_cert_present,
        len(matched_certs),
        len(candidate.certifications),
        tuple(jd_cert_keywords),
        tuple(dict.fromkeys(matched_certs)),
    )


def _extract_ai1_features(
    ai1: Ai1Assessment | None,
    requirements: tuple[Ai2RequirementSpec, ...],
) -> dict[str, Any]:
    if ai1 is None:
        return {
            "ai1_status_str": "NOT_PROVIDED",
            "ai1_available": False,
            "ai1_missing_indicator": 1.0,
            "ai1_status_code": 0,
            "ai1_model_version": None,
            "ai1_mean_top1_similarity": None,
            "ai1_min_top1_similarity": None,
            "ai1_required_mean_top1_similarity": None,
            "ai1_required_min_top1_similarity": None,
            "ai1_preferred_mean_top1_similarity": None,
            "ai1_coverage_ratio_above_ref": None,
            "ai1_required_coverage_ratio": None,
            "ai1_review_required_ratio": None,
            "ai1_negation_cue_count": None,
            "ai1_exact_keyword_match_ratio": None,
            "ai1_truncated_texts_count": None,
        }

    if ai1.status == "DISABLED":
        code = 1
    elif ai1.status == "UNAVAILABLE":
        code = 2
    elif ai1.status == "READY":
        code = 3
    else:
        raise ValueError(f"Unsupported AI1 status: {ai1.status}")

    if code != 3:
        return {
            "ai1_status_str": ai1.status,
            "ai1_available": False,
            "ai1_missing_indicator": 1.0,
            "ai1_status_code": code,
            "ai1_model_version": ai1.modelVersion,
            "ai1_mean_top1_similarity": None,
            "ai1_min_top1_similarity": None,
            "ai1_required_mean_top1_similarity": None,
            "ai1_required_min_top1_similarity": None,
            "ai1_preferred_mean_top1_similarity": None,
            "ai1_coverage_ratio_above_ref": None,
            "ai1_required_coverage_ratio": None,
            "ai1_review_required_ratio": None,
            "ai1_negation_cue_count": None,
            "ai1_exact_keyword_match_ratio": None,
            "ai1_truncated_texts_count": None,
        }

    imp_by_id = {r.requirementId: r.importance for r in requirements}
    imp_by_text = {normalize_semantic_text(r.text): r.importance for r in requirements}

    all_sims: list[float] = []
    req_sims: list[float] = []
    pref_sims: list[float] = []
    above_ref_flags: list[bool] = []
    req_above_ref_flags: list[bool] = []
    review_flags: list[bool] = []
    negation_count = 0
    exact_match_flags: list[bool] = []

    ai1_reqs: tuple[Ai1Requirement, ...] = ai1.requirements
    for item in ai1_reqs:
        if item.retrievalStatus == "SCORER_UNAVAILABLE":
            continue
        importance = imp_by_id.get(item.requirementId) or imp_by_text.get(normalize_semantic_text(item.text), "unknown")
        top_sim = float(item.evidence[0].similarityScore) if item.evidence else 0.0
        all_sims.append(top_sim)
        above = item.retrievalStatus == "CANDIDATE_EVIDENCE"
        above_ref_flags.append(above)
        review_flags.append(item.retrievalStatus == "REVIEW_REQUIRED")

        if importance == "required":
            req_sims.append(top_sim)
            req_above_ref_flags.append(above)
        elif importance == "preferred":
            pref_sims.append(top_sim)

        if item.evidence:
            top_codes = set(item.evidence[0].reasonCodes)
            if "EXPLICIT_NEGATION_CUE" in top_codes or any("EXPLICIT_NEGATION_CUE" in h.reasonCodes for h in item.evidence):
                negation_count += 1
            if "EXACT_KEYWORD_MATCH" in top_codes or "LEXICAL_ABSENT_PENALTY" in top_codes:
                exact_match_flags.append("EXACT_KEYWORD_MATCH" in top_codes)

    if not all_sims:
        return {
            "ai1_status_str": "READY",
            "ai1_available": True,
            "ai1_missing_indicator": 0.0,
            "ai1_status_code": 3,
            "ai1_model_version": ai1.modelVersion,
            "ai1_mean_top1_similarity": None,
            "ai1_min_top1_similarity": None,
            "ai1_required_mean_top1_similarity": None,
            "ai1_required_min_top1_similarity": None,
            "ai1_preferred_mean_top1_similarity": None,
            "ai1_coverage_ratio_above_ref": None,
            "ai1_required_coverage_ratio": None,
            "ai1_review_required_ratio": None,
            "ai1_negation_cue_count": 0,
            "ai1_exact_keyword_match_ratio": None,
            "ai1_truncated_texts_count": ai1.truncatedTexts,
        }

    return {
        "ai1_status_str": "READY",
        "ai1_available": True,
        "ai1_missing_indicator": 0.0,
        "ai1_status_code": 3,
        "ai1_model_version": ai1.modelVersion,
        "ai1_mean_top1_similarity": round(sum(all_sims) / len(all_sims), 4),
        "ai1_min_top1_similarity": round(min(all_sims), 4),
        "ai1_required_mean_top1_similarity": round(sum(req_sims) / len(req_sims), 4) if req_sims else None,
        "ai1_required_min_top1_similarity": round(min(req_sims), 4) if req_sims else None,
        "ai1_preferred_mean_top1_similarity": round(sum(pref_sims) / len(pref_sims), 4) if pref_sims else None,
        "ai1_coverage_ratio_above_ref": round(sum(1 for f in above_ref_flags if f) / len(above_ref_flags), 4),
        "ai1_required_coverage_ratio": round(sum(1 for f in req_above_ref_flags if f) / len(req_above_ref_flags), 4) if req_above_ref_flags else None,
        "ai1_review_required_ratio": round(sum(1 for f in review_flags if f) / len(review_flags), 4),
        "ai1_negation_cue_count": negation_count,
        "ai1_exact_keyword_match_ratio": round(sum(1 for f in exact_match_flags if f) / len(exact_match_flags), 4) if exact_match_flags else None,
        "ai1_truncated_texts_count": ai1.truncatedTexts,
    }


def build_canonical_input(
    job: JobMatchingSnapshot,
    candidate: CandidateMatchingSnapshot,
    *,
    reference_date: date,
    ai1_assessment: Ai1Assessment | None = None,
    explicit_requirements: Sequence[Ai2RequirementSpec] | None = None,
    plan_context: JobPlanContext | None = None,
) -> Ai2CanonicalInput:
    reqs = build_canonical_requirements(
        job,
        explicit_requirements=explicit_requirements,
        plan_context=plan_context,
    )
    return Ai2CanonicalInput(
        job=job,
        candidate=candidate,
        jobSnapshotSha256=snapshot_digest(job),
        candidateSnapshotSha256=digest(candidate.model_dump(mode="json")),
        scoreReferenceDate=reference_date,
        requirements=reqs,
        ai1Assessment=ai1_assessment,
    )


def extract_ai2_features(canonical: Ai2CanonicalInput) -> Ai2FeatureExtractionResult:
    job = canonical.job
    candidate = canonical.candidate
    reqs = canonical.requirements
    ref_date = canonical.scoreReferenceDate

    # 1. Target JD skills & requirement-level coverage
    jd_target_skills = _extract_jd_target_skills(job, reqs)
    declared_skill_text_sem = normalize_semantic_text(" , ".join(s.name for s in candidate.skills))
    declared_skill_text_ascii = normalize_text(declared_skill_text_sem)

    role_evidence_parts: list[str] = []
    for exp in candidate.experiences:
        role_evidence_parts.append(f"{exp.title or ''} {exp.description or ''}")
    for proj in candidate.projects:
        role_evidence_parts.append(f"{proj.name or ''} {proj.description or ''} {' '.join(proj.technologies)}")
    role_evidence_sem = normalize_semantic_text(" \n ".join(role_evidence_parts))
    role_evidence_ascii = normalize_text(role_evidence_sem)

    project_evidence_sem = normalize_semantic_text(
        " \n ".join(f"{p.name or ''} {p.description or ''} {' '.join(p.technologies)}" for p in candidate.projects)
    )
    project_evidence_ascii = normalize_text(project_evidence_sem)

    matched_declared: list[str] = []
    matched_role_verified: list[str] = []
    matched_project_skills: list[str] = []
    for sk in jd_target_skills:
        if _contains_term(declared_skill_text_sem, declared_skill_text_ascii, sk):
            matched_declared.append(sk)
        if _contains_term(role_evidence_sem, role_evidence_ascii, sk):
            matched_role_verified.append(sk)
        if candidate.projects and _contains_term(project_evidence_sem, project_evidence_ascii, sk):
            matched_project_skills.append(sk)

    jd_skill_count = len(jd_target_skills)
    declared_skill_cov = round(len(matched_declared) / jd_skill_count, 4) if jd_skill_count else None
    role_verified_cov = round(len(matched_role_verified) / jd_skill_count, 4) if jd_skill_count else None
    project_skill_cov = round(len(matched_project_skills) / jd_skill_count, 4) if jd_skill_count else None

    full_cand_sem = normalize_semantic_text(" \n ".join([
        declared_skill_text_sem,
        role_evidence_sem,
        " ".join(f"{c.name} {c.issuer or ''} {c.description or ''}" for c in candidate.certifications),
        " ".join(f"{e.degree or ''} {e.fieldOfStudy or ''} {e.description or ''}" for e in candidate.educations),
        candidate.headline or "",
        candidate.summary or "",
    ]))
    full_cand_tokens = _content_tokens(full_cand_sem)

    def _req_term_coverage(specs: list[Ai2RequirementSpec]) -> float | None:
        if not specs:
            return None
        scores: list[float] = []
        for req in specs:
            tokens = _content_tokens(req.text)
            if not tokens:
                continue
            matched_cnt = 0
            for tok in tokens:
                if tok in full_cand_tokens or _contains_term(full_cand_sem, normalize_text(full_cand_sem), tok):
                    matched_cnt += 1
            scores.append(matched_cnt / len(tokens))
        return round(sum(scores) / len(scores), 4) if scores else None

    required_specs = [r for r in reqs if r.importance == "required"]
    preferred_specs = [r for r in reqs if r.importance == "preferred"]
    required_term_cov = _req_term_coverage(required_specs)
    preferred_term_cov = _req_term_coverage(preferred_specs)

    # 2. Task-linked relevant experience tenure + interval union + unknown-date accounting
    jd_min_years = _extract_min_years_required(reqs, job)
    jd_title_tokens = {
        tok for tok in _content_tokens(job.title) if tok not in _DOMAIN_TITLE_GENERIC
    }
    jd_domain_tokens = set(jd_title_tokens)
    for req in (required_specs or list(reqs)):
        jd_domain_tokens |= _content_tokens(req.text)
    for sk in jd_target_skills:
        jd_domain_tokens |= _content_tokens(sk)

    ref_ym = ref_date.year * 12 + (ref_date.month - 1)
    all_intervals: list[tuple[int, int]] = []
    relevant_intervals: list[tuple[int, int]] = []
    relevant_exp_ids: list[str] = []
    unknown_date_exp_ids: list[str] = []
    unknown_current_count = 0
    title_match_count = 0
    has_rel_unknown = False

    for idx, exp in enumerate(candidate.experiences):
        exp_id = exp.id or f"experiences/{idx}"
        exp_title_tokens = {
            tok for tok in _content_tokens(exp.title or "") if tok not in _DOMAIN_TITLE_GENERIC
        }
        exp_text_sem = normalize_semantic_text(f"{exp.title or ''} {exp.description or ''}")
        exp_text_ascii = normalize_text(exp_text_sem)
        exp_tokens = _content_tokens(exp_text_sem)

        title_overlap = bool(jd_title_tokens and (jd_title_tokens & exp_title_tokens))
        if title_overlap:
            title_match_count += 1
        skill_overlap = any(_contains_term(exp_text_sem, exp_text_ascii, sk) for sk in jd_target_skills)
        token_overlap_count = len(jd_domain_tokens & exp_tokens)
        is_relevant = title_overlap or skill_overlap or token_overlap_count >= 2
        if is_relevant:
            relevant_exp_ids.append(exp_id)

        if exp.isCurrent is None:
            unknown_current_count += 1

        interval: tuple[int, int] | None = None
        if exp.startYear is not None and 1950 <= exp.startYear <= ref_date.year:
            start_ym = exp.startYear * 12 + ((exp.startMonth or 1) - 1)
            if start_ym <= ref_ym:
                if exp.isCurrent is True:
                    end_ym_excl = max(start_ym + 1, ref_ym)
                    interval = (start_ym, end_ym_excl)
                elif exp.endYear is not None and 1950 <= exp.endYear <= ref_date.year + 1:
                    end_ym_excl = min(ref_ym + 1, exp.endYear * 12 + (exp.endMonth or 12))
                    if end_ym_excl > start_ym:
                        interval = (start_ym, end_ym_excl)

        if interval is None:
            unknown_date_exp_ids.append(exp_id)
            if is_relevant:
                has_rel_unknown = True
        else:
            all_intervals.append(interval)
            if is_relevant:
                relevant_intervals.append(interval)

    total_months = _merge_intervals(all_intervals)
    relevant_months = _merge_intervals(relevant_intervals)

    if jd_min_years is not None and jd_min_years > 0:
        rel_years = relevant_months / 12.0
        rel_ratio = round(rel_years / jd_min_years, 4)
        rel_gap = round(rel_years - jd_min_years, 4)
    else:
        rel_ratio = None
        rel_gap = round((relevant_months / 12.0) - 0.0, 4) if jd_min_years == 0 else None

    # 3. Projects
    relevant_project_ids: list[str] = []
    for idx, proj in enumerate(candidate.projects):
        pid = proj.id or f"projects/{idx}"
        proj_sem = normalize_semantic_text(f"{proj.name or ''} {proj.description or ''} {' '.join(proj.technologies)}")
        proj_ascii = normalize_text(proj_sem)
        proj_tokens = _content_tokens(proj_sem)
        if any(_contains_term(proj_sem, proj_ascii, sk) for sk in jd_target_skills) or len(jd_domain_tokens & proj_tokens) >= 2:
            relevant_project_ids.append(pid)

    # 4. Education (only evaluated against explicit JD degree/field requirements; zero school prestige)
    jd_edu_level, jd_edu_imp, cand_max_edu, meets_edu, edu_field_match, edu_kws = _extract_education_features(
        reqs, job, candidate
    )

    # 5. Certifications
    jd_cert_present, jd_cert_matched, cand_cert_cnt, cert_kws, matched_certs = _extract_certification_features(
        reqs, job, candidate
    )

    # 6. Work conditions (remote & city location)
    jd_work_norm = normalize_semantic_text(f"{job.workingType} {job.description}")
    jd_is_remote = any(k in jd_work_norm for k in ("remote", "từ xa hoàn toàn", "làm việc từ xa 100%"))
    if jd_is_remote:
        loc_match: bool | None = True
        loc_missing = 0.0
    else:
        jd_loc = _canonical_location(job.location)
        cand_loc = _canonical_location(candidate.location)
        if not jd_loc or not cand_loc:
            loc_match = None
            loc_missing = 1.0
        else:
            loc_match = jd_loc == cand_loc
            loc_missing = 0.0

    # 7. Frozen AI1 signal adapter
    ai1_signals = _extract_ai1_features(canonical.ai1Assessment, reqs)

    # 8. Build vector & diagnostics
    features = Ai2FeatureVector(
        ai1_available=ai1_signals["ai1_available"],
        ai1_missing_indicator=ai1_signals["ai1_missing_indicator"],
        ai1_status_code=ai1_signals["ai1_status_code"],
        ai1_mean_top1_similarity=ai1_signals["ai1_mean_top1_similarity"],
        ai1_min_top1_similarity=ai1_signals["ai1_min_top1_similarity"],
        ai1_required_mean_top1_similarity=ai1_signals["ai1_required_mean_top1_similarity"],
        ai1_required_min_top1_similarity=ai1_signals["ai1_required_min_top1_similarity"],
        ai1_preferred_mean_top1_similarity=ai1_signals["ai1_preferred_mean_top1_similarity"],
        ai1_coverage_ratio_above_ref=ai1_signals["ai1_coverage_ratio_above_ref"],
        ai1_required_coverage_ratio=ai1_signals["ai1_required_coverage_ratio"],
        ai1_review_required_ratio=ai1_signals["ai1_review_required_ratio"],
        ai1_negation_cue_count=ai1_signals["ai1_negation_cue_count"],
        ai1_exact_keyword_match_ratio=ai1_signals["ai1_exact_keyword_match_ratio"],
        ai1_truncated_texts_count=ai1_signals["ai1_truncated_texts_count"],
        jd_skill_count=jd_skill_count,
        declared_skill_coverage_ratio=declared_skill_cov,
        role_verified_skill_coverage_ratio=role_verified_cov,
        required_term_coverage_ratio=required_term_cov,
        preferred_term_coverage_ratio=preferred_term_cov,
        jd_min_years_required=jd_min_years,
        total_verified_experience_months=total_months,
        relevant_experience_months=relevant_months,
        relevant_to_required_years_ratio=rel_ratio,
        relevant_years_gap=rel_gap,
        relevant_role_title_match_count=title_match_count,
        unknown_date_experience_count=len(unknown_date_exp_ids),
        unknown_current_status_count=unknown_current_count,
        has_relevant_experience_with_unknown_dates=has_rel_unknown,
        has_projects=bool(candidate.projects),
        relevant_project_count=len(relevant_project_ids),
        project_skill_coverage_ratio=project_skill_cov,
        jd_education_required_level=jd_edu_level,
        jd_education_importance_code=jd_edu_imp,
        candidate_max_education_level=cand_max_edu,
        meets_jd_education_level=meets_edu,
        education_field_match=edu_field_match,
        jd_certification_requirement_present=jd_cert_present,
        jd_certification_matched_count=jd_cert_matched,
        candidate_certification_count=cand_cert_cnt,
        jd_is_remote=jd_is_remote,
        location_match=loc_match,
        location_missing_indicator=loc_missing,
        missing_experiences_section=len(candidate.experiences) == 0,
        missing_skills_section=len(candidate.skills) == 0,
        missing_education_section=len(candidate.educations) == 0,
        has_any_unknown_dates=len(unknown_date_exp_ids) > 0 or unknown_current_count > 0,
    )

    limitations: list[str] = []
    if not ai1_signals["ai1_available"]:
        limitations.append(f"AI1_{ai1_signals['ai1_status_str']}")
    if unknown_date_exp_ids:
        limitations.append("EXPERIENCE_DATES_UNKNOWN")
    if unknown_current_count:
        limitations.append("CURRENT_ROLE_STATUS_UNKNOWN")
    if loc_missing:
        limitations.append("LOCATION_MISSING")

    diagnostics = Ai2ExtractionDiagnostics(
        jdTargetSkills=jd_target_skills,
        matchedDeclaredSkills=tuple(matched_declared),
        matchedRoleVerifiedSkills=tuple(matched_role_verified),
        matchedProjectSkills=tuple(matched_project_skills),
        relevantExperienceIds=tuple(relevant_exp_ids),
        unknownDateExperienceIds=tuple(unknown_date_exp_ids),
        relevantProjectIds=tuple(relevant_project_ids),
        jdEducationKeywords=edu_kws,
        jdCertificationKeywords=cert_kws,
        matchedCertifications=matched_certs,
        limitations=tuple(limitations),
    )

    return Ai2FeatureExtractionResult(
        jobSnapshotSha256=canonical.jobSnapshotSha256,
        candidateSnapshotSha256=canonical.candidateSnapshotSha256,
        scoreReferenceDate=ref_date,
        ai1Status=ai1_signals["ai1_status_str"],
        ai1ModelVersion=ai1_signals["ai1_model_version"],
        features=features,
        diagnostics=diagnostics,
    )


def _parse_ym(raw: str | None) -> tuple[int | None, int | None]:
    if not raw or not isinstance(raw, str):
        return None, None
    m = re.fullmatch(r"(\d{4})-(0[1-9]|1[0-2])", raw.strip())
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


def _infer_pilot_jd_work_conditions(jd_text: str) -> tuple[str, str]:
    loc = ""
    work_type = ""
    norm = normalize_semantic_text(jd_text)
    if "remote" in norm or "từ xa hoàn toàn" in norm:
        work_type = "REMOTE"
    elif "hybrid" in norm or "kết hợp linh hoạt" in norm:
        work_type = "HYBRID"
    elif "toàn thời gian" in norm or "tại văn phòng" in norm:
        work_type = "ONSITE"

    for line in jd_text.splitlines():
        if "địa điểm" in normalize_semantic_text(line) or "tại văn phòng" in normalize_semantic_text(line):
            c_loc = _canonical_location(line)
            if c_loc:
                loc = c_loc
                break
    if not loc:
        loc = _canonical_location(jd_text) or ""
    return work_type, loc


def pilot_pair_to_canonical(
    job_dict: dict[str, Any],
    candidate_dict: dict[str, Any],
    *,
    reference_date: date,
    ai1_assessment: Ai1Assessment | None = None,
) -> Ai2CanonicalInput:
    """Convert an offline ai2-pilot-v1 (job, candidate) dict pair into canonical online-parity inputs."""
    work_type, location = _infer_pilot_jd_work_conditions(job_dict["jd_text"])
    reqs = tuple(
        Ai2RequirementSpec(
            requirementId=r["requirement_id"],
            text=r["text"],
            importance=r["importance"],
            source="source_record",
        )
        for r in job_dict["requirements"]
    )
    job = JobMatchingSnapshot(
        id=job_dict["job_id"],
        title=job_dict["title"],
        description=job_dict["jd_text"],
        requirements="\n".join(r.text for r in reqs),
        skills=[],
        workingType=work_type,
        experienceLevel=job_dict["level"].upper(),
        location=location,
    )

    sections_by_kind: dict[str, list[str]] = {}
    for sec in candidate_dict.get("sections", []):
        sections_by_kind.setdefault(sec["kind"], []).append(sec["text"])
    summary_text = "\n\n".join(sections_by_kind.get("summary", [])) or None

    experiences = []
    for e in candidate_dict.get("experiences", []):
        sy, sm = _parse_ym(e.get("start_date"))
        ey, em = _parse_ym(e.get("end_date"))
        experiences.append(
            CandidateExperienceSnapshot(
                id=e.get("experience_id"),
                title=e.get("title"),
                company=e.get("company"),
                description=e.get("description"),
                startYear=sy,
                startMonth=sm,
                endYear=ey,
                endMonth=em,
                isCurrent=e.get("is_current"),
            )
        )

    projects = [
        CandidateProjectSnapshot(
            id=p.get("project_id"),
            name=p.get("name"),
            description=p.get("description"),
            technologies=list(p.get("technologies_or_methods") or []),
        )
        for p in candidate_dict.get("projects", [])
    ]

    educations = [
        CandidateEducationSnapshot(
            id=f"educations/{idx}",
            degree=ed.get("degree"),
            fieldOfStudy=ed.get("field"),
            school=None,
            description="\n".join(sections_by_kind.get("education", [])) if idx == 0 else None,
        )
        for idx, ed in enumerate(candidate_dict.get("education", []))
    ]

    certifications = [
        CandidateCertificationSnapshot(
            id=f"certifications/{idx}",
            name=cert["name"],
        )
        for idx, cert in enumerate(candidate_dict.get("certifications", []))
    ]

    skills = [
        CandidateSkillSnapshot(id=f"skills/{idx}", name=s)
        for idx, s in enumerate(candidate_dict.get("skills", []))
    ]

    candidate = CandidateMatchingSnapshot(
        snapshotSchemaVersion="candidate-matching-v2",
        dataOrigin="PARSED_CV",
        candidateId=candidate_dict["candidate_id"],
        summary=summary_text,
        location=None,
        skills=skills,
        experiences=experiences,
        educations=educations,
        certifications=certifications,
        projects=projects,
    )

    return build_canonical_input(
        job,
        candidate,
        reference_date=reference_date,
        ai1_assessment=ai1_assessment,
        explicit_requirements=reqs,
    )


def _build_provenance_registry() -> tuple[Ai2FeatureProvenance, ...]:
    defs: list[tuple[str, str, str, bool, float | None, float | None, str, tuple[str, ...]]] = [
        ("ai1_available", "ai1_semantic", "bool", False, None, None, "False when AI1 is NOT_PROVIDED, DISABLED, or UNAVAILABLE.", ("ai1Assessment.status",)),
        ("ai1_missing_indicator", "ai1_semantic", "float", False, 0.0, 1.0, "1.0 whenever AI1 semantic signals are absent.", ("ai1Assessment.status",)),
        ("ai1_status_code", "ai1_semantic", "int", False, 0.0, 3.0, "Discrete status code: 0=NOT_PROVIDED, 1=DISABLED, 2=UNAVAILABLE, 3=READY.", ("ai1Assessment.status",)),
        ("ai1_mean_top1_similarity", "ai1_semantic", "float", True, 0.0, 100.0, "None when AI1 not READY.", ("ai1Assessment.requirements[*].evidence[0].similarityScore",)),
        ("ai1_min_top1_similarity", "ai1_semantic", "float", True, 0.0, 100.0, "None when AI1 not READY.", ("ai1Assessment.requirements[*].evidence[0].similarityScore",)),
        ("ai1_required_mean_top1_similarity", "ai1_semantic", "float", True, 0.0, 100.0, "None when AI1 not READY or JD lacks explicit required items.", ("ai1Assessment.requirements", "requirements[*].importance")),
        ("ai1_required_min_top1_similarity", "ai1_semantic", "float", True, 0.0, 100.0, "None when AI1 not READY or JD lacks explicit required items.", ("ai1Assessment.requirements", "requirements[*].importance")),
        ("ai1_preferred_mean_top1_similarity", "ai1_semantic", "float", True, 0.0, 100.0, "None when AI1 not READY or JD lacks explicit preferred items.", ("ai1Assessment.requirements", "requirements[*].importance")),
        ("ai1_coverage_ratio_above_ref", "ai1_semantic", "float", True, 0.0, 1.0, "None when AI1 not READY.", ("ai1Assessment.requirements[*].retrievalStatus",)),
        ("ai1_required_coverage_ratio", "ai1_semantic", "float", True, 0.0, 1.0, "None when AI1 not READY or no explicit required items.", ("ai1Assessment.requirements[*].retrievalStatus", "requirements[*].importance")),
        ("ai1_review_required_ratio", "ai1_semantic", "float", True, 0.0, 1.0, "None when AI1 not READY.", ("ai1Assessment.requirements[*].retrievalStatus",)),
        ("ai1_negation_cue_count", "ai1_semantic", "int", True, 0.0, None, "None when AI1 not READY.", ("ai1Assessment.requirements[*].evidence[*].reasonCodes",)),
        ("ai1_exact_keyword_match_ratio", "ai1_semantic", "float", True, 0.0, 1.0, "None when AI1 not READY or no short-skill lexical checks.", ("ai1Assessment.requirements[*].evidence[0].reasonCodes",)),
        ("ai1_truncated_texts_count", "ai1_semantic", "int", True, 0.0, None, "None when AI1 not READY.", ("ai1Assessment.truncatedTexts",)),
        ("jd_skill_count", "skills", "int", False, 0.0, None, "0 if JD specifies no structured or recognized target skills.", ("job.skills", "requirements")),
        ("declared_skill_coverage_ratio", "skills", "float", True, 0.0, 1.0, "None when jd_skill_count == 0.", ("job.skills", "candidate.skills")),
        ("role_verified_skill_coverage_ratio", "skills", "float", True, 0.0, 1.0, "None when jd_skill_count == 0.", ("job.skills", "candidate.experiences", "candidate.projects")),
        ("required_term_coverage_ratio", "skills", "float", True, 0.0, 1.0, "None when no explicit required items exist.", ("requirements", "candidate")),
        ("preferred_term_coverage_ratio", "skills", "float", True, 0.0, 1.0, "None when no explicit preferred items exist.", ("requirements", "candidate")),
        ("jd_min_years_required", "experience", "float", True, 0.0, None, "None when JD states no numeric experience years.", ("requirements",)),
        ("total_verified_experience_months", "experience", "int", False, 0.0, None, "Interval union over dated experiences; unknown dates excluded and flagged separately.", ("candidate.experiences", "scoreReferenceDate")),
        ("relevant_experience_months", "experience", "int", False, 0.0, None, "Interval union over JD-relevant dated experiences only.", ("job", "candidate.experiences", "scoreReferenceDate")),
        ("relevant_to_required_years_ratio", "experience", "float", True, 0.0, None, "None when jd_min_years_required is None or <= 0.", ("relevant_experience_months", "jd_min_years_required")),
        ("relevant_years_gap", "experience", "float", True, None, None, "None when jd_min_years_required is None.", ("relevant_experience_months", "jd_min_years_required")),
        ("relevant_role_title_match_count", "experience", "int", False, 0.0, None, "0 when no experience title matches JD core title tokens.", ("job.title", "candidate.experiences[*].title")),
        ("unknown_date_experience_count", "experience", "int", False, 0.0, None, "Count of experiences with unquantifiable start/end dates.", ("candidate.experiences",)),
        ("unknown_current_status_count", "experience", "int", False, 0.0, None, "Count of experiences with isCurrent is None.", ("candidate.experiences[*].isCurrent",)),
        ("has_relevant_experience_with_unknown_dates", "experience", "bool", False, None, None, "True if any JD-relevant role lacks valid start/end bounds.", ("job", "candidate.experiences")),
        ("has_projects", "projects", "bool", False, None, None, "True if candidate.projects is non-empty.", ("candidate.projects",)),
        ("relevant_project_count", "projects", "int", False, 0.0, None, "Count of projects matching JD skills or >=2 JD domain tokens.", ("job", "candidate.projects")),
        ("project_skill_coverage_ratio", "projects", "float", True, 0.0, 1.0, "None when jd_skill_count == 0.", ("job.skills", "candidate.projects")),
        ("jd_education_required_level", "education", "int", True, 0.0, 5.0, "None when JD mentions no education/degree requirement.", ("requirements",)),
        ("jd_education_importance_code", "education", "int", False, 0.0, 2.0, "0=none, 1=preferred/unspecified, 2=required.", ("requirements",)),
        ("candidate_max_education_level", "education", "int", True, 0.0, 5.0, "None when candidate has no education or unmapped degree text.", ("candidate.educations",)),
        ("meets_jd_education_level", "education", "bool", True, None, None, "None when JD specifies no degree OR candidate education missing.", ("jd_education_required_level", "candidate_max_education_level")),
        ("education_field_match", "education", "bool", True, None, None, "None when JD specifies no field OR candidate education missing.", ("requirements", "candidate.educations")),
        ("jd_certification_requirement_present", "certifications", "bool", False, None, None, "True when JD explicitly mentions certifications.", ("requirements",)),
        ("jd_certification_matched_count", "certifications", "int", False, 0.0, None, "Count of candidate certifications aligned with JD cert keywords/tools.", ("requirements", "candidate.certifications")),
        ("candidate_certification_count", "certifications", "int", False, 0.0, None, "0 when candidate lists no certifications.", ("candidate.certifications",)),
        ("jd_is_remote", "work_conditions", "bool", False, None, None, "True when JD workingType/description specifies full remote.", ("job.workingType", "job.description")),
        ("location_match", "work_conditions", "bool", True, None, None, "None when JD is non-remote and either location is absent.", ("job.location", "candidate.location")),
        ("location_missing_indicator", "work_conditions", "float", False, 0.0, 1.0, "1.0 when non-remote JD cannot compare location due to missing data.", ("job.location", "candidate.location")),
        ("missing_experiences_section", "data_quality", "bool", False, None, None, "True when candidate.experiences is empty.", ("candidate.experiences",)),
        ("missing_skills_section", "data_quality", "bool", False, None, None, "True when candidate.skills is empty.", ("candidate.skills",)),
        ("missing_education_section", "data_quality", "bool", False, None, None, "True when candidate.educations is empty.", ("candidate.educations",)),
        ("has_any_unknown_dates", "data_quality", "bool", False, None, None, "True when any experience has unknown dates or isCurrent=None.", ("candidate.experiences",)),
    ]
    registry = tuple(
        Ai2FeatureProvenance(
            name=name,
            group=group,
            dtype=dtype,
            nullable=nullable,
            minValue=min_v,
            maxValue=max_v,
            missingnessSemantics=miss,
            sourceInputs=srcs,
        )
        for name, group, dtype, nullable, min_v, max_v, miss, srcs in defs
    )
    assert tuple(p.name for p in registry) == AI2_FEATURE_NAMES
    return registry


AI2_FEATURE_PROVENANCE_REGISTRY: tuple[Ai2FeatureProvenance, ...] = _build_provenance_registry()
