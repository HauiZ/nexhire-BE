"""Apply comprehensive human-approved commercial source repairs to resolve all 49 audit blocking issues."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any

BASE = Path(__file__).resolve().parent
SOURCES_PATH = BASE / "sources" / "sales-marketing.json"
SNAPSHOT_PATH = BASE / "snapshots" / "before-commercial-repairs-v4.json"
LOG_PATH = BASE / "commercial-repair-log-v4.json"


def main() -> None:
    if not SOURCES_PATH.exists():
        raise SystemExit(f"Missing source file: {SOURCES_PATH}")

    raw_bytes = SOURCES_PATH.read_bytes()
    SNAPSHOT_PATH.write_bytes(raw_bytes)
    data = json.loads(raw_bytes.decode("utf-8"))

    changes: list[dict[str, Any]] = []

    def log_change(ident: str, field: str, before: Any, after: Any, decision: str, reason: str) -> Any:
        if before != after:
            changes.append({
                "id": ident,
                "field": field,
                "before": before,
                "after": after,
                "decision": decision,
                "reason": reason,
            })
        return after

    # 1. Exact description synchronization (11 items)
    desc_replacements = {
        "SA-J01-C03-EXP-01": [
            ("Chưa sử dụng Salesforce hay HubSpot chuyên sâu, chủ yếu quản lý khách hàng bằng bảng tính Excel kết hợp Zalo.",
             "Quản lý khách hàng bằng bảng tính Excel kết hợp Zalo.")
        ],
        "SA-J02-C03-EXP-01": [
            (", chưa phụ trách tuyến đường thực địa hay đi kiểm tra tạp hóa bao giờ.", ".")
        ],
        "SA-J03-C03-EXP-01": [
            (", chưa tham gia quản lý hay phân chia chỉ tiêu cho nhân viên khác.", ".")
        ],
        "SA-J04-C04-EXP-01": [
            ("tại trung tâm thương mại Union Square.", "tại trung tâm thương mại lớn ở trung tâm thành phố.")
        ],
        "MK-J01-C03-EXP-01": [
            ("trên các trang báo điện tử VnExpress, Dân Trí, Tuổi Trẻ.", "trên các trang báo điện tử kinh tế và đời sống uy tín.")
        ],
        "MK-J02-C03-EXP-01": [
            ("Công việc chủ yếu thao tác viết trên máy tính, chưa từng tự quay video, đứng trước ống kính hay sử dụng ứng dụng dựng phim CapCut, Premiere.",
             "Công việc chủ yếu thao tác viết trên máy tính.")
        ],
        "MK-J03-C01-EXP-01": [
            ("phim quảng cáo truyền hình VTV3 (ATL)", "phim quảng cáo truyền hình quốc gia (ATL)"),
            ("agency quảng cáo quốc tế Ogilvy, Dentsu để sản xuất", "các agency sáng tạo quốc tế để sản xuất")
        ],
        "MK-J03-C03-EXP-01": [
            (", chưa chính thức quản lý đội ngũ nhân viên chính thức.", ".")
        ],
        "MK-J03-C03-EXP-02": [
            ("tại hệ thống siêu thị Co.opmart.", "tại các hệ thống siêu thị tiêu dùng.")
        ],
        "MK-J03-C04-EXP-01": [
            ("kênh siêu thị WinMart, Big C/Go! và Lotte Mart trên toàn miền Nam.", "các hệ thống siêu thị bán lẻ lớn trên toàn miền Nam.")
        ],
        "MK-J05-C04-EXP-01": [
            ("\nChưa trực tiếp chủ trì chiến lược GTM độc lập hay phân tích sâu các chỉ số vòng đời tài chính như CAC, LTV.", ""),
            ("Chưa trực tiếp chủ trì chiến lược GTM độc lập hay phân tích sâu các chỉ số vòng đời tài chính như CAC, LTV.", "")
        ],
    }

    # 2. Targeted role skills_used repairs (37 items)
    skills_used_repairs: dict[tuple[str, str], list[tuple[str, str, str | None]]] = {
        # SA-J02
        ("SA-J02-C02", "SA-J02-C02-EXP-01"): [("remove", "Trưng bày kệ hàng", None)],
        # SA-J03
        ("SA-J03-C01", "SA-J03-C01-EXP-01"): [
            ("remove", "Quan hệ lãnh đạo bệnh viện miền Bắc", None),
            ("remove", "Luật Đấu thầu", None),
        ],
        ("SA-J03-C02", "SA-J03-C02-EXP-01"): [
            ("remove", "Quan hệ phòng vật tư bệnh viện", None),
            ("remove", "Luật Đấu thầu", None),
        ],
        ("SA-J03-C03", "SA-J03-C03-EXP-01"): [
            ("remove", "Luật Đấu thầu", None),
            ("remove", "Quan hệ khoa chẩn đoán hình ảnh", None),
        ],
        ("SA-J03-C03", "SA-J03-C03-EXP-02"): [("remove", "Kỹ thuật Y sinh", None)],
        ("SA-J03-C06", "SA-J03-C06-EXP-01"): [("remove", "Quan hệ khoa Dược", None)],
        ("SA-J03-C08", "SA-J03-C08-EXP-01"): [("remove", "Hồ sơ thầu kỹ thuật theo Luật Đấu thầu", None)],
        ("SA-J03-C08", "SA-J03-C08-EXP-02"): [("remove", "Kỹ thuật Y sinh", None)],
        # SA-J04
        ("SA-J04-C01", "SA-J04-C01-EXP-01"): [
            ("remove", "Nội thất gỗ tự nhiên và sofa da", None),
            ("remove", "Theo dõi đơn hàng giao lắp", None),
        ],
        ("SA-J04-C01", "SA-J04-C01-EXP-02"): [("remove", "Thiết kế nội thất", None)],
        ("SA-J04-C02", "SA-J04-C02-EXP-01"): [("remove", "Đèn trang trí và tủ kệ", None)],
        ("SA-J04-C03", "SA-J04-C03-EXP-01"): [("remove", "Giới thiệu mẫu gạch men thiết bị", None)],
        ("SA-J04-C04", "SA-J04-C04-EXP-01"): [("remove", "Giao tiếp lịch thiệp", None)],
        ("SA-J04-C05", "SA-J04-C05-EXP-01"): [
            ("remove", "Tư vấn nội thất cao cấp", None),
            ("remove", "Phối màu và công năng không gian sống", None),
            ("remove", "Điều phối vận chuyển lắp đặt", None),
        ],
        ("SA-J04-C05", "SA-J04-C05-EXP-02"): [("remove", "Tư vấn nội thất cao cấp", None)],
        ("SA-J04-C06", "SA-J04-C06-EXP-01"): [("remove", "Thuyết phục khách hàng", None)],
        ("SA-J04-C07", "SA-J04-C07-EXP-01"): [("remove", "Theo dõi giao hàng lắp đặt", None)],
        ("SA-J04-C08", "SA-J04-C08-EXP-01"): [("remove", "Phối màu sắc và công năng", None)],
        # SA-J05
        ("SA-J05-C02", "SA-J05-C02-EXP-01"): [
            ("remove", "Cước tàu biển FCL LCL", None),
            ("remove", "Hợp đồng khung thường niên", None),
        ],
        ("SA-J05-C04", "SA-J05-C04-EXP-01"): [("replace", "Cước biển FCL", "Cước biển")],
        ("SA-J05-C08", "SA-J05-C08-EXP-01"): [("replace", "Báo giá cước FCL LCL", "Cước tàu biển FCL")],
        # MK-J01
        ("MK-J01-C05", "MK-J01-C05-EXP-01"): [
            ("remove", "Google Ads", None),
            ("remove", "TikTok Ads", None),
        ],
        # MK-J02
        ("MK-J02-C01", "MK-J02-C01-EXP-02"): [("remove", "Bắt trend xu hướng Gen Z", None)],
        ("MK-J02-C02", "MK-J02-C02-EXP-01"): [("remove", "Bắt nhịp xu hướng nhạc trend", None)],
        ("MK-J02-C04", "MK-J02-C04-EXP-01"): [("remove", "Diễn xuất trước ống kính", None)],
        ("MK-J02-C05", "MK-J02-C05-EXP-01"): [("remove", "Storytelling", None)],
        ("MK-J02-C05", "MK-J02-C05-EXP-02"): [("remove", "Storytelling", None)],
        ("MK-J02-C08", "MK-J02-C08-EXP-01"): [("remove", "Bắt trend du lịch ẩm thực", None)],
        # MK-J03
        ("MK-J03-C01", "MK-J03-C01-EXP-01"): [("replace", "Quản lý Creative PR Media Agency", "Quản lý Creative Agency")],
        ("MK-J03-C05", "MK-J03-C05-EXP-02"): [("remove", "Chiến lược danh mục đa thương hiệu", None)],
        ("MK-J03-C08", "MK-J03-C08-EXP-01"): [("remove", "Định vị thương hiệu Brand Positioning", None)],
        # MK-J04
        ("MK-J04-C01", "MK-J04-C01-EXP-01"): [("remove", "Xây dựng liên kết Off-page", None)],
        ("MK-J04-C03", "MK-J04-C03-EXP-02"): [("remove", "Quảng cáo tìm kiếm Google Ads", None)],
        ("MK-J04-C05", "MK-J04-C05-EXP-01"): [("replace", "Screaming Frog Enterprise", "Screaming Frog")],
        ("MK-J04-C07", "MK-J04-C07-EXP-02"): [("remove", "SEO On-page web nội thất", None)],
        # MK-J05
        ("MK-J05-C04", "MK-J05-C04-EXP-01"): [("remove", "Tài liệu tính năng Release notes", None)],
    }

    for job in data["jobs"]:
        for c in job["candidates"]:
            cid = c["candidate_id"]

            # Top-level skills fictionalization
            if cid == "MK-J03-C05":
                old_sk = list(c["skills"])
                new_sk = [s.replace("Hợp tác WPP Omnicom", "Hợp tác tập đoàn truyền thông toàn cầu") for s in old_sk]
                c["skills"] = log_change(cid, "skills", old_sk, new_sk, "HR-SOURCE-007", "Fictionalize WPP Omnicom in top skills")
            if cid == "SA-J05-C02":
                old_sk = list(c["skills"])
                new_sk = [s.replace("Hợp đồng khung thường niên", "Đàm phán giá cước thường niên") for s in old_sk]
                c["skills"] = log_change(cid, "skills", old_sk, new_sk, "HR-SOURCE-003", "Harmonize top skills to exact summary text")

            # MK-J05-C04: remove negative bullet from section text and rebuild cv_text
            if cid == "MK-J05-C04":
                for s in c["sections"]:
                    if s["kind"] == "experience":
                        old_txt = s["text"]
                        new_txt = re.sub(r"\n\s*-\s*Chưa trực tiếp chủ trì chiến lược GTM[^\n]*", "", old_txt)
                        s["text"] = log_change(s["section_id"], "text", old_txt, new_txt, "HR-SOURCE-006", "Remove templated negative denial bullet")
                old_cv = c["cv_text"]
                c["cv_text"] = log_change(cid, "cv_text", old_cv, "\n\n".join(s["text"] for s in c["sections"]), "HR-SOURCE-006", "Rebuild cv_text join")

            # Experience description repairs
            for exp in c["experiences"]:
                eid = exp["experience_id"]
                if eid in desc_replacements:
                    old_desc = exp["description"]
                    new_desc = old_desc
                    for old_sub, new_sub in desc_replacements[eid]:
                        new_desc = new_desc.replace(old_sub, new_sub)
                    new_desc = new_desc.strip()
                    exp["description"] = log_change(eid, "description", old_desc, new_desc, "HR-SOURCE-004/006/007", "Synchronize experience description with repaired section text")

                # Experience skills_used repairs
                pair_key = (cid, eid)
                if pair_key in skills_used_repairs:
                    old_su = list(exp.get("skills_used") or [])
                    cur_su = list(old_su)
                    for action, target, replacement in skills_used_repairs[pair_key]:
                        if action == "remove":
                            cur_su = [x for x in cur_su if x != target]
                        elif action == "replace" and replacement is not None:
                            cur_su = [replacement if x == target else x for x in cur_su]
                    exp["skills_used"] = log_change(eid, "skills_used", old_su, cur_su, "HR-SOURCE-003", "Role skills_used local grounding alignment")

    # Post-repair assertion: verify 100% of description lines in experiences & projects exist in cited section
    mismatches = []
    for job in data["jobs"]:
        for c in job["candidates"]:
            secs = {s["section_id"]: s["text"] for s in c["sections"]}
            for exp in c["experiences"]:
                sec_text = secs[exp["section_id"]]
                for line in (exp.get("description") or "").splitlines():
                    clean_line = line.strip()
                    if clean_line and clean_line not in sec_text:
                        mismatches.append(f"{exp['experience_id']}: {clean_line!r}")
            for prj in c["projects"]:
                sec_text = secs[prj["section_id"]]
                for line in (prj.get("description") or "").splitlines():
                    clean_line = line.strip()
                    if clean_line and clean_line not in sec_text:
                        mismatches.append(f"{prj['project_id']}: {clean_line!r}")

    if mismatches:
        raise RuntimeError(f"Repairs incomplete; {len(mismatches)} description mismatches remain:\n" + "\n".join(mismatches))

    # Write repaired file
    new_raw = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    SOURCES_PATH.write_text(new_raw, encoding="utf-8")

    after_sha256 = hashlib.sha256(new_raw.encode("utf-8")).hexdigest()
    log_record = {
        "schema_version": "ai2-pilot-commercial-repair-log-v4",
        "changes_count": len(changes),
        "after_sha256": after_sha256,
        "changes": changes,
    }
    LOG_PATH.write_text(json.dumps(log_record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(changes)} repairs successfully. New sales-marketing.json SHA-256: {after_sha256}")


if __name__ == "__main__":
    main()
