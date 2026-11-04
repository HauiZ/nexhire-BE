"""Insert reproducible case-by-case content findings into the single report."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
r=json.loads((ROOT/'trainning/_maintenance/ai-business-quality-results.json').read_text(encoding='utf-8'))
def cell(text):
    return str(text).replace('|','\\|').replace('\n',' ')
labels={'PASS':'Đúng hướng','TIE':'Đồng điểm','REVERSED':'Đảo thứ tự'}
lines=['## Thử nghiệm chất lượng và giá trị nghiệp vụ — 2026-10-30','',
'### Thiết kế và giới hạn',
'- 12 cặp synthetic/24 hồ sơ: HR, Finance, Sales và IT; thêm 2 phép thử đổi/bỏ tên. Kỳ vọng hướng so sánh được ghi trong spec trước inference. Cùng assistant viết tình huống và đánh giá nên là AI-reviewed silver, không phải chuyên gia hoặc benchmark độc lập.',
'- Không train, không sửa model/feature/điểm theo các ca. Không DB write hoặc provider ngoài. Các ca này từ nay là dữ liệu đã lộ, không dùng làm test mới cho model kế tiếp.',
'- So sánh token overlap đơn giản, AI1 mean Top1 similarity và frozen AI2. Một yêu cầu/JD; không đo khả năng tổng hợp nhiều yêu cầu, không suy ra NDCG/recall trên pool tuyển dụng thực tế.',
'- Candidate summary và experience chứa cùng nội dung synthetic; ngày cấu trúc cố định 2020–2022. Ca tenure chỉ đối chiếu nội dung text, không kiểm khả năng tính đúng 5 năm kinh nghiệm liên quan.',
'', '### Tổng kết hướng so sánh',
'|Phương pháp|Đúng hướng|Đồng điểm|Đảo thứ tự|', '|---|---:|---:|---:|']
for method,name in [('lexical','Token overlap'),('semantic','AI1 semantic'),('ai2','AI2 frozen')]:
    s=r['summaries'][method];lines.append(f"|{name}|{s['PASS']}/12|{s['TIE']}/12|{s['REVERSED']}/12|")
lines+=['','Đây là tỷ lệ trên challenge set chọn có chủ đích, **không phải độ chính xác toàn hệ thống**. AI1 có11ca đúng hướng còn AI2 có9; AI2 không thể hiện lợi ích bổ sung trên tập nhỏ này. Cả3phương pháp đều đảo thứ tự ở ca nhồi từ khóa.','',
'### Từng ca: nguồn, kỳ vọng và kết quả',
'Kỳ vọng chung: nguồn có hành động đáp ứng cụ thể phải đứng trên nguồn đối chứng; đây là ưu tiên về bằng chứng, không kết luận năng lực cá nhân.']
for c in r['cases']:
    a,b=c['rows'];lines+=['',f"#### {c['id']} — {c['family']}",f"- **JD:** {c['requirement']}",f"- **Nguồn kỳ vọng mạnh hơn:** {c['stronger']}",f"- **Đối chứng:** {c['contrast']}",
    '- **Kết quả:** '+ '; '.join(f"{m}: {labels[c['results'][m]]}" for m in ('lexical','semantic','ai2'))+'.',
    f"- **AI1 mean Top1:** {a['semantic']:.6f} so với {b['semantic']:.6f}; **AI2 raw:** {a['ai2']:.6f} so với {b['ai2']:.6f}. Các số chỉ để chẩn đoán, không phải phần trăm phù hợp.",
    f"- **Rủi ro nghiệp vụ:** {c['risk']}",
    f"- **Top1 mạnh hơn:** {a['hits'][0]['text'] if a['hits'] else '(không có)'}",f"- **Top1 đối chứng:** {b['hits'][0]['text'] if b['hits'] else '(không có)'}"]
lines+=['','### Lợi ích, tác hại và quyết định sử dụng',
'- **HR:** semantic retrieval tìm được hướng bằng chứng đúng trong nhiều cặp hơn token overlap (11so với8). Đây là tín hiệu về ích lợi tìm kiếm, chưa chứng minh tiết kiệm thời gian hoặc quyết định tuyển dụng tốt hơn. Giữ khả năng xem quote/source, tránh gọi similarity là đáp ứng.',
'- **HR:** AI2 nén hai cặp còn phân biệt được bằng similarity thành đồng điểm: Salesforce context-vs-listing và Kubernetes+Terraform đầy đủ-vs-thiếu Terraform. Không có lợi ích ranking bổ sung được chứng minh ở đây; giữ quality gate, không khôi phục thứ tự.',
'- **Ứng viên:** nhồi nguyên cụm authentication/RBAC đứng trên mô tả triển khai thật ở cả3cách. Có nguy cơ thưởng keyword stuffing, làm thiệt CV diễn đạt thực tế. Không tự động loại ứng viên hoặc đưa kết quả này thành khuyến nghị sửa CV để nhồi từ khóa.',
'- **Ứng viên:** ca tiếng Việt, trộn Việt/Anh và OR đúng hướng trong lượt này; không suy ra mọi ngôn ngữ/phủ định đều được xử lý đúng. Probe Python phủ định trước đó vẫn đồng điểm; hành vi không ổn định theo cách diễn đạt.',
'- **Tên:**2/2phép đổi/bỏ tên giữ nguyên feature/điểm. Chỉ xác nhận hai perturbation cụ thể; không chứng minh công bằng giới tính, tuổi, dân tộc, trường học hoặc nhóm dân số.',
'- Chưa đo HR task completion time, số lần click so với đọc CV thủ công, tỷ lệ sửa kết luận, mức hài lòng ứng viên hoặc tuyển dụng thực tế. Các lợi ích này **chưa xác minh**, không báo thành công từ mô phỏng.',
'- Chưa chạy đánh giá bằng LLM ngoài; cần quyết định provider, dữ liệu và chi phí riêng. Không thêm một phương pháp chưa chạy vào bảng so sánh.',
'', '### Artifact tái lập',
'- Spec: trainning/ai2/content-review-v1/business-quality-cases.json; SHA256 '+r['spec_sha256']+'.',
'- Kết quả từng hit/feature/score/latency: trainning/_maintenance/ai-business-quality-results.json. Runner scripts/ai-business-quality.py, model frozen local-only.',
'- Cảnh báo tokenizer regex Mistral xuất hiện từ thư viện như các lượt trước; không tự bật fix flag hoặc sửa tokenizer/model. Giữ cảnh báo trong giới hạn tái lập, không khẳng định hoàn toàn vô hại.',
'']
p=ROOT/'trainning/BAO_CAO_AI_TONG_HOP.md'
text=p.read_text(encoding='utf-8');marker='## Mở rộng review nguồn và preference — 2026-10-30'
if '## Thử nghiệm chất lượng và giá trị nghiệp vụ — 2026-10-30' in text: raise ValueError('Section already exists')
p.write_text(text.replace(marker,'\n'.join(lines)+'\n'+marker,1),encoding='utf-8')
print('Inserted 12 case results and business limitations into consolidated report')
