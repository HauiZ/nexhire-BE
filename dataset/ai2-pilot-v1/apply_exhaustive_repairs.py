"""Apply comprehensive human-approved source repairs to IT and Sales-Marketing sources."""
import hashlib
import json
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent
SNAPSHOT_DIR = BASE / 'snapshots' / 'before-exhaustive-repairs-v3'
LOG_PATH = BASE / 'exhaustive-repair-log-v3.json'
MAP_PATH = BASE / 'organization-mapping-v3.json'


def main():
    if SNAPSHOT_DIR.exists():
        raise SystemExit('Snapshot directory already exists; refusing overwrite.')
    SNAPSHOT_DIR.mkdir(parents=True)

    changes = []
    def log_change(ident, field, before, after, decision, reason):
        if before != after:
            changes.append({
                'id': ident,
                'field': field,
                'before': before,
                'after': after,
                'decision': decision,
                'reason': reason
            })
        return after

    # ==========================================
    # 1. REPAIR IT SOURCE
    # ==========================================
    it_path = BASE / 'sources' / 'it.json'
    it_raw = it_path.read_bytes()
    (SNAPSHOT_DIR / 'it.json').write_bytes(it_raw)
    it_data = json.loads(it_raw)

    it_org_map = {
        'Công ty Cổ phần Công nghệ SmartLog': 'Công ty Cổ phần Công nghệ LogiSmart Việt Nam',
        'Công ty Cổ phần Khởi nghiệp NextTech Việt': 'Công ty Cổ phần Khởi nghiệp NextGen Việt',
        'Công ty Cổ phần Giải pháp Trí tuệ Nhân tạo VinaAI': 'Công ty Cổ phần Giải pháp Trí tuệ Nhân tạo VinaSmart AI',
    }

    for job in it_data['jobs']:
        jid = job['job_id']
        # IT-J08 JD company rename Gotech -> TechNova
        if jid == 'IT-J08' and 'Gotech' in job['jd_text']:
            old_text = job['jd_text']
            new_text = old_text.replace('Công ty Cổ phần Công nghệ Mạng Đa Điểm Gotech', 'Công ty Cổ phần Công nghệ Mạng Đa Điểm TechNova')
            job['jd_text'] = log_change(jid, 'jd_text', old_text, new_text, 'HR-SOURCE-007', 'Fictionalize Gotech trademark')

        for c in job['candidates']:
            cid = c['candidate_id']
            # Organization renames in sections
            for s in c['sections']:
                old_sec = s['text']
                new_sec = old_sec
                for old_org, new_org in it_org_map.items():
                    if old_org in new_sec:
                        new_sec = new_sec.replace(old_org, new_org)
                if 'Hệ thống Giám sát Vận tải SmartLogistics' in new_sec:
                    new_sec = new_sec.replace('Hệ thống Giám sát Vận tải SmartLogistics', 'Hệ thống Giám sát Vận tải LogiSmart')
                s['text'] = log_change(s['section_id'], 'text', old_sec, new_sec, 'HR-SOURCE-007', 'Fictionalize trademark org')

            # Update structured experiences & projects
            for exp in c['experiences']:
                if exp['company'] in it_org_map:
                    exp['company'] = log_change(exp['experience_id'], 'company', exp['company'], it_org_map[exp['company']], 'HR-SOURCE-007', 'Fictionalize company')

            for prj in c['projects']:
                if prj['name'] == 'Hệ thống Giám sát Vận tải SmartLogistics':
                    prj['name'] = log_change(prj['project_id'], 'name', prj['name'], 'Hệ thống Giám sát Vận tải LogiSmart', 'HR-SOURCE-007', 'Fictionalize project name')

            # Skill removals/alias harmonization in IT
            # IT-J02-C01-E01: remove React.js
            if cid == 'IT-J02-C01':
                e = c['experiences'][0]
                if 'React.js' in e['skills_used']:
                    old_sk = list(e['skills_used'])
                    new_sk = [x for x in old_sk if x != 'React.js']
                    e['skills_used'] = log_change(e['experience_id'], 'skills_used', old_sk, new_sk, 'HR-SOURCE-003', 'React.js not in role 1 text')

            # Alias harmonizations
            for exp in c['experiences']:
                eid = exp['experience_id']
                remap = {
                    'IT-J01-C03-E02': [('ReactJS', 'React')],
                    'IT-J06-C08-E02': [('Apache JMeter', 'JMeter')],
                    'IT-J08-C04-E02': [('Golang', 'Go')],
                    'IT-J09-C02-E02': [('Microsoft SQL Server', 'SQL Server')],
                    'IT-J09-C03-E02': [('React.js', 'React')],
                    'IT-J09-C07-E02': [('React.js', 'React')],
                    'IT-J09-C08-E02': [('Microsoft SQL Server', 'SQL Server')],
                }
                if eid in remap:
                    for old_v, new_v in remap[eid]:
                        if old_v in exp['skills_used']:
                            old_sk = list(exp['skills_used'])
                            new_sk = [new_v if x == old_v else x for x in old_sk]
                            exp['skills_used'] = log_change(eid, 'skills_used', old_sk, new_sk, 'HR-SOURCE-003', f'Harmonize alias {old_v} -> {new_v}')

            # Rebuild cv_text
            c['cv_text'] = log_change(cid, 'cv_text', c['cv_text'], '\n\n'.join(s['text'] for s in c['sections']), 'HR-SOURCE-006', 'Rebuild cv_text join')

    it_path.write_text(json.dumps(it_data, ensure_ascii=False, indent=2) + '\n')

    # ==========================================
    # 2. REPAIR COMMERCIAL SOURCE
    # ==========================================
    sm_path = BASE / 'sources' / 'sales-marketing.json'
    sm_raw = sm_path.read_bytes()
    (SNAPSHOT_DIR / 'sales-marketing.json').write_bytes(sm_raw)
    sm_data = json.loads(sm_raw)

    sm_org_map = {
        'Tập Đoàn Bán Lẻ Tiêu Dùng Quốc Tế SunGroup': 'Tập Đoàn Bán Lẻ Tiêu Dùng Quốc Tế SunRetail',
        'Chuỗi Cửa hàng Tiện lợi V-Mart': 'Chuỗi Cửa hàng Tiện lợi EcoMart',
        'Công ty Cổ phần Nội Thất Nhà Xinh': 'Công ty Cổ phần Nội Thất Không Gian Đẹp',
        'Công ty Cổ phần Công nghệ SmartTech Global': 'Công ty Cổ phần Công nghệ Giải Pháp Phần Mềm SmartSoft',
        'Công ty Cổ phần Giải Trí Tuổi Trẻ': 'Công ty Cổ phần Giải Trí Trẻ Vina',
    }

    # Text replacements in sections for orgs, real institutions, age descriptors, negative clauses
    cand_text_replacements = {
        # SA-J01
        'SA-J01-C03': [
            ('- Chưa sử dụng Salesforce hay HubSpot chuyên sâu, chủ yếu quản lý khách hàng bằng bảng tính Excel kết hợp Zalo.',
             '- Quản lý khách hàng bằng bảng tính Excel kết hợp Zalo.')
        ],
        'SA-J01-C08': [
            ('(Làm việc song song song/Freelance)', '(Làm việc song song/Freelance)')
        ],
        # SA-J02
        'SA-J02-C03': [
            ('- Công việc chủ yếu ngồi tại văn phòng công ty, chưa phụ trách tuyến đường thực địa hay đi kiểm tra tạp hóa bao giờ.',
             '- Công việc chủ yếu ngồi tại văn phòng công ty.')
        ],
        'SA-J02-C04': [
            ('Tóm lược hồ sơ:\nNhân viên phát triển thị trường trẻ tuổi với 6 tháng kinh nghiệm',
             'Tóm lược hồ sơ:\nNhân viên phát triển thị trường với 6 tháng kinh nghiệm')
        ],
        # SA-J03
        'SA-J03-C03': [
            ('Chưa từng giữ chức danh quản lý đội nhóm, mong muốn tìm kiếm cơ hội thăng tiến lên cấp quản lý.',
             'Mong muốn tìm kiếm cơ hội thăng tiến lên cấp quản lý.'),
            ('- Tự lập kế hoạch kinh doanh cá nhân, chưa tham gia quản lý hay phân chia chỉ tiêu cho nhân viên khác.',
             '- Tự lập kế hoạch kinh doanh cá nhân.')
        ],
        'SA-J03-C04': [
            (' Chưa có kinh nghiệm thực tế về thiết bị lâm sàng bệnh viện.', '')
        ],
        'SA-J03-C08': [
            ('Bệnh viện Bạch Mai, Bệnh viện Việt Đức và Bệnh viện Đa khoa Thái Nguyên',
             'Bệnh viện Đa khoa Trung tâm Hà Nội, Bệnh viện Ngoại khoa Thủ Đô và Bệnh viện Đa khoa Tỉnh Thái An')
        ],
        # SA-J04
        'SA-J04-C03': [
            ('Ứng viên trẻ trung, hoạt bát có 4 tháng', 'Ứng viên hoạt bát có 4 tháng')
        ],
        'SA-J04-C04': [
            ('tại trung tâm thương mại Union Square.', 'tại trung tâm thương mại lớn ở trung tâm thành phố.')
        ],
        'SA-J04-C08': [
            ('Sunrise Riverside', 'Riverside Park')
        ],
        # MK-J01
        'MK-J01-C03': [
            ('trên các trang báo điện tử VnExpress, Dân Trí, Tuổi Trẻ.',
             'trên các trang báo điện tử kinh tế và đời sống uy tín.')
        ],
        'MK-J01-C04': [
            ('Nhân viên Digital Marketing trẻ tuổi với 1 năm kinh nghiệm',
             'Nhân viên Digital Marketing với 1 năm kinh nghiệm')
        ],
        # MK-J02
        'MK-J02-C03': [
            ('- Công việc chủ yếu thao tác viết trên máy tính, chưa từng tự quay video, đứng trước ống kính hay sử dụng ứng dụng dựng phim CapCut, Premiere.',
             '- Công việc chủ yếu thao tác viết trên máy tính.')
        ],
        'MK-J02-C04': [
            ('Sáng tạo nội dung trẻ tuổi với 6 tháng kinh nghiệm',
             'Sáng tạo nội dung với 6 tháng kinh nghiệm')
        ],
        # MK-J03
        'MK-J03-C01': [
            ('phim quảng cáo truyền hình VTV3 (ATL)', 'phim quảng cáo truyền hình quốc gia (ATL)'),
            ('agency quảng cáo quốc tế Ogilvy, Dentsu để sản xuất',
             'các agency sáng tạo quốc tế để sản xuất')
        ],
        'MK-J03-C03': [
            ('- Hướng dẫn công việc hàng ngày cho 1 thực tập sinh thương hiệu, chưa chính thức quản lý đội ngũ nhân viên chính thức.',
             '- Hướng dẫn công việc hàng ngày cho 1 thực tập sinh thương hiệu.'),
            ('tại hệ thống siêu thị Co.opmart.', 'tại các hệ thống siêu thị tiêu dùng.')
        ],
        'MK-J03-C04': [
            (' Không chuyên về định vị thương hiệu dài hạn hay chiến dịch truyền thông đa phương tiện ATL/TVC.', ''),
            ('kênh siêu thị WinMart, Big C/Go! và Lotte Mart trên toàn miền Nam.',
             'các hệ thống siêu thị bán lẻ lớn trên toàn miền Nam.')
        ],
        'MK-J03-C05': [
            ('tập đoàn truyền thông toàn cầu (WPP, Omnicom)', 'các tập đoàn truyền thông toàn cầu')
        ],
        'MK-J03-C06': [
            (' Chưa từng tham gia xây dựng chiến lược định vị thương hiệu tổng thể, truyền thông truyền hình ATL hay kích hoạt tại điểm bán BTL.', '')
        ],
        # MK-J04
        'MK-J04-C04': [
            ('Nhân viên SEO trẻ tuổi với 1 năm kinh nghiệm',
             'Nhân viên SEO với 1 năm kinh nghiệm')
        ],
        # MK-J05
        'MK-J05-C04': [
            ('Nhân viên Tiếp thị Sản phẩm trẻ tuổi với 2 năm kinh nghiệm',
             'Nhân viên Tiếp thị Sản phẩm với 2 năm kinh nghiệm')
        ],
        'MK-J05-C06': [
            (' Chưa có kinh nghiệm thực tế về ứng dụng công nghệ tài chính số Fintech, phân tích phễu chuyển đổi số hay các chỉ số vòng đời trực tuyến như CAC, LTV, Activation Rate.', '')
        ],
    }

    # Skill adjustments per experience/project in commercial
    commercial_skill_repairs = {
        # SA-J01
        'SA-J01-C06-EXP-01': [('remove', 'Đàm phán hợp đồng đặt cọc')],
        'SA-J01-C06-EXP-02': [('remove', 'Kỹ năng tạo dựng quan hệ')],
        'SA-J01-C08-EXP-02': [('remove', 'Tư vấn giải pháp Pre-sales')],
        # SA-J02
        'SA-J02-C03-EXP-02': [('remove', 'Xe máy cá nhân')],
        'SA-J02-C04-EXP-01': [('remove', 'Trưng bày kệ bánh kẹo'), ('remove', 'Kiểm tra tồn kho date hàng')],
        'SA-J02-C04-EXP-02': [('remove', 'Đi tuyến bằng xe máy')],
        'SA-J02-C05-EXP-01': [('remove', 'Quản lý tuyến MCP'), ('remove', 'Làm việc nhà phân phối')],
        'SA-J02-C06-EXP-01': [('remove', 'Đảo date hàng hóa'), ('remove', 'Kiểm kê tồn kho cửa hàng')],
        'SA-J02-C07-EXP-01': [('remove', 'Mở rộng điểm bán hóa mỹ phẩm'), ('remove', 'Treo hanger quảng cáo')],
        'SA-J02-C07-EXP-02': [('remove', 'Xe máy di chuyển thị trường')],
        'SA-J02-C08-EXP-01': [('remove', 'Thông thạo đường sá Gò Vấp'), ('remove', 'Xe máy cá nhân')],
        # SA-J03
        'SA-J03-C02-EXP-02': [('remove', 'Tiếng Anh đọc tài liệu kỹ thuật')],
        'SA-J03-C05-EXP-01': [('remove', 'Mối quan hệ viện trưởng và sở y tế'), ('remove', 'Tiếng Anh cấp độ chuyên gia')],
        'SA-J03-C08-EXP-01': [('remove', 'Tiếng Anh IELTS 7.5')],
        # SA-J04
        'SA-J04-C03-EXP-01': [('remove', 'Giọng nói chuẩn')],
        'SA-J04-C04-EXP-02': [('remove', 'Tư vấn hàng cao cấp')],
        'SA-J04-C06-EXP-01': [('remove', 'Giọng nói chuẩn')],
        'SA-J04-C07-EXP-01': [('remove', 'Tư vấn nội thất gỗ công nghiệp'), ('remove', 'Giọng nói hòa nhã')],
        'SA-J04-C08-EXP-01': [('remove', 'Thiết kế 3D SketchUp')],
        'SA-J04-C08-PRJ-01': [('remove', 'Phối màu sắc và công năng'), ('remove', 'Thiết kế 3D SketchUp')],
        # SA-J05
        'SA-J05-C01-EXP-01': [('remove', 'Tiếng Anh TOEIC 890'), ('replace', 'Cước đường biển FCL LCL', 'Cước đường biển FCL')],
        'SA-J05-C01-EXP-02': [('replace', 'Cước đường biển FCL LCL', 'Cước đường biển FCL')],
        'SA-J05-C02-EXP-02': [('replace', 'Cước tàu biển FCL LCL', 'Cước hàng lẻ LCL')],
        'SA-J05-C04-EXP-01': [('remove', 'Tiếng Anh gửi email báo cước')],
        'SA-J05-C05-EXP-01': [('remove', 'Cước đường biển FCL và hàng không Charter'), ('remove', 'Tiếng Anh cấp độ thành thạo')],
        'SA-J05-C06-EXP-01': [('remove', 'Chỉ số giao hàng đúng hạn OTIF')],
        'SA-J05-C07-EXP-01': [('replace', 'Cước tàu biển FCL LCL', 'Cước tàu biển FCL')],
        'SA-J05-C07-EXP-02': [('remove', 'Cước tàu biển FCL LCL')],
        'SA-J05-C08-EXP-01': [('remove', 'Khai thuê hải quan VNACCS'), ('remove', 'Mã HS Code')],
        'SA-J05-C08-EXP-02': [('remove', 'Khai thuê hải quan VNACCS')],
        # MK-J01
        'MK-J01-C03-EXP-01': [('remove', 'Quản lý KOL KOC')],
        'MK-J01-C04-EXP-01': [('remove', 'Canva')],
        'MK-J01-C05-EXP-01': [('replace', 'Tối ưu ROAS và CAC', 'Tối ưu ROAS')],
        'MK-J01-C06-EXP-01': [('remove', 'Adobe Photoshop Illustrator'), ('remove', 'Biên tập video ngắn CapCut Premiere')],
        'MK-J01-C07-EXP-01': [('replace', 'Quảng cáo đa kênh Meta TikTok Google', 'Quảng cáo Meta và TikTok'), ('remove', 'Google Analytics 4 (GA4)')],
        'MK-J01-C08-EXP-01': [('remove', 'Google Analytics 4 (GA4)'), ('remove', 'Đo lường quảng cáo Meta TikTok Google')],
        'MK-J01-C08-EXP-02': [('remove', 'Google Analytics 4 (GA4)')],
        # MK-J02
        'MK-J02-C03-EXP-02': [('remove', 'Dịch thuật tiếng Anh')],
        'MK-J02-C06-EXP-01': [('remove', 'Pancake Harasocial')],
        'MK-J02-C08-PRJ-01': [('remove', 'Tự quay và dựng Premiere CapCut'), ('remove', 'Bắt trend du lịch ẩm thực')],
        # MK-J03
        'MK-J03-C01-EXP-02': [('remove', 'Chiến lược định vị thương hiệu')],
        'MK-J03-C02-EXP-02': [('remove', 'Chiến dịch IMC bán lẻ mỹ phẩm')],
        'MK-J03-C03-EXP-01': [('replace', 'Làm việc với Creative và Media Agency', 'Làm việc với Creative Agency')],
        'MK-J03-C04-EXP-01': [('replace', 'Kênh siêu thị MT và CVS', 'Kênh siêu thị MT')],
        'MK-J03-C04-EXP-02': [('remove', 'Shopper Activation và POSM')],
        'MK-J03-C05-EXP-01': [('remove', 'Hợp tác WPP Omnicom')],
        'MK-J03-C06-EXP-01': [('replace', 'Tối ưu ROAS và CPA', 'Tối ưu ROAS')],
        'MK-J03-C06-EXP-02': [('remove', 'Quảng cáo số E-commerce')],
        'MK-J03-C08-EXP-02': [('remove', 'Định vị thương hiệu Brand Positioning')],
        # MK-J04
        'MK-J04-C02-EXP-01': [('remove', 'Google Search Console')],
        'MK-J04-C03-EXP-01': [('remove', 'Nghiên cứu từ khóa Keyword Planner')],
        'MK-J04-C05-EXP-01': [('remove', 'Technical SEO triệu trang'), ('remove', 'Ahrefs và BigQuery')],
        'MK-J04-C06-EXP-01': [('remove', 'Yoast SEO Rank Math')],
        'MK-J04-C07-EXP-01': [('remove', 'Nghiên cứu từ khóa Ahrefs Content Gap'), ('remove', 'WordPress')],
        'MK-J04-C08-EXP-01': [('remove', 'Cấu trúc dữ liệu Schema'), ('remove', 'Google Search Console và Ahrefs'), ('replace', 'Core Web Vitals HTML CSS JS', 'Tối ưu hiệu năng JavaScript')],
        'MK-J04-C08-EXP-02': [('replace', 'WordPress Custom Theme', 'Lập trình giao diện Responsive Web')],
        # MK-J05
        'MK-J05-C01-EXP-01': [('replace', 'Chỉ số CAC LTV Retention Activation', 'Chỉ số CAC và Retention Rate')],
        'MK-J05-C02-EXP-01': [('remove', 'Đồng bộ Product Sales CS'), ('remove', 'Tiếng Anh TOEIC 860')],
        'MK-J05-C02-EXP-02': [('remove', 'Product Marketing Fintech thanh toán')],
        'MK-J05-C03-EXP-02': [('remove', 'Scrum Agile')],
        'MK-J05-C04-EXP-01': [('remove', 'Slide hội thảo trực tuyến')],
        'MK-J05-C05-EXP-01': [('remove', 'Hệ sinh thái ví điện tử đa quốc gia')],
        'MK-J05-C06-EXP-01': [('replace', 'Chương trình tích điểm hoàn tiền', 'Chương trình hoàn tiền')],
        'MK-J05-C08-EXP-01': [('replace', 'Amplitude Mixpanel', 'Phân tích dữ liệu Amplitude'), ('replace', 'Activation Rate và Retention Rate', 'Tối ưu Activation Rate')],
    }

    # Project description exact bullet alignments
    prj_desc_alignments = {
        'SA-J04-C08-PRJ-01': 'Tư vấn trọn gói bộ bàn ăn thông minh kéo dài và hệ tủ tivi treo tường cho gia chủ trẻ, nhận được đánh giá rất hài lòng sau bàn giao nghiệm thu.',
        'MK-J02-C08-PRJ-01': 'Sản xuất loạt 10 tập video ngắn giới thiệu các quán ăn lâu đời trong hẻm nhỏ, đạt tổng cộng 4,5 triệu lượt xem trên nền tảng TikTok.',
    }

    for job in sm_data['jobs']:
        jid = job['job_id']
        for c in job['candidates']:
            cid = c['candidate_id']

            # Section text replacements (orgs, real names, bias/negative phrases)
            for s in c['sections']:
                old_sec = s['text']
                new_sec = old_sec
                # Orgs
                for old_org, new_org in sm_org_map.items():
                    if old_org in new_sec:
                        new_sec = new_sec.replace(old_org, new_org)
                # Specific cand replacements
                if cid in cand_text_replacements:
                    for old_sub, new_sub in cand_text_replacements[cid]:
                        if old_sub in new_sec:
                            new_sec = new_sec.replace(old_sub, new_sub)
                s['text'] = log_change(s['section_id'], 'text', old_sec, new_sec, 'HR-SOURCE-006/007', 'Apply approved textual repairs')

            # Update structured experiences
            for exp in c['experiences']:
                eid = exp['experience_id']
                if exp['company'] in sm_org_map:
                    exp['company'] = log_change(eid, 'company', exp['company'], sm_org_map[exp['company']], 'HR-SOURCE-007', 'Fictionalize company')

                # SA-J01-C08-EXP-02 description alignment
                if eid == 'SA-J01-C08-EXP-02':
                    new_desc = 'Hỗ trợ rà soát quy trình và tư vấn lựa chọn gói phần mềm SaaS phù hợp cho 6 doanh nghiệp vừa và nhỏ trong nước.'
                    exp['description'] = log_change(eid, 'description', exp['description'], new_desc, 'HR-SOURCE-004', 'Align description to exact source bullet')

                # Skill repairs
                if eid in commercial_skill_repairs:
                    old_sk = list(exp['skills_used'])
                    cur_sk = list(old_sk)
                    for action, *args in commercial_skill_repairs[eid]:
                        if action == 'remove':
                            target = args[0]
                            cur_sk = [x for x in cur_sk if x != target]
                        elif action == 'replace':
                            old_val, new_val = args
                            cur_sk = [new_val if x == old_val else x for x in cur_sk]
                    exp['skills_used'] = log_change(eid, 'skills_used', old_sk, cur_sk, 'HR-SOURCE-003', 'Role skill explicit support alignment')

            # Update structured projects
            for prj in c['projects']:
                pid = prj['project_id']
                if pid in prj_desc_alignments:
                    prj['description'] = log_change(pid, 'description', prj['description'], prj_desc_alignments[pid], 'HR-SOURCE-004', 'Align project description to exact source bullet')
                if pid in commercial_skill_repairs:
                    old_tm = list(prj['technologies_or_methods'])
                    cur_tm = list(old_tm)
                    for action, *args in commercial_skill_repairs[pid]:
                        if action == 'remove':
                            target = args[0]
                            cur_tm = [x for x in cur_tm if x != target]
                        elif action == 'replace':
                            old_val, new_val = args
                            cur_tm = [new_val if x == old_val else x for x in cur_tm]
                    prj['technologies_or_methods'] = log_change(pid, 'technologies_or_methods', old_tm, cur_tm, 'HR-SOURCE-003', 'Project methods explicit support alignment')

            # Rebuild cv_text
            c['cv_text'] = log_change(cid, 'cv_text', c['cv_text'], '\n\n'.join(s['text'] for s in c['sections']), 'HR-SOURCE-006', 'Rebuild cv_text join')

    sm_path.write_text(json.dumps(sm_data, ensure_ascii=False, indent=2) + '\n')

    # Combined org map
    combined_org_map = {
        'it': it_org_map,
        'sales_marketing': sm_org_map,
        'institutions_fictionalized': {
            'Phòng Thí nghiệm Đại học Bách Khoa': 'Phòng Thí nghiệm Trí tuệ Nhân tạo AlphaLab (IT-J10-C04)',
            'Bạch Mai, Việt Đức, Thái Nguyên': 'Hệ thống bệnh viện đa khoa trung ương và tuyến tỉnh hư cấu (SA-J03-C08)'
        },
        'disclaimer': 'All organization names are fictional designations for synthetic pilot research only. No claim of external verified nonexistence or existence.'
    }
    MAP_PATH.write_text(json.dumps(combined_org_map, ensure_ascii=False, indent=2) + '\n')

    # Save log
    log_data = {
        'schema_version': 'ai2-pilot-exhaustive-repair-log-v3',
        'changes_count': len(changes),
        'changes': changes,
        'after_sha256': {
            'it.json': hashlib.sha256(it_path.read_bytes()).hexdigest(),
            'sales-marketing.json': hashlib.sha256(sm_path.read_bytes()).hexdigest(),
        }
    }
    LOG_PATH.write_text(json.dumps(log_data, ensure_ascii=False, indent=2) + '\n')
    print(f"Exhaustive repairs applied successfully: {len(changes)} changes logged.")


if __name__ == '__main__':
    main()
