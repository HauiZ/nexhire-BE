# Khôi phục công việc AI2 trên máy mới

Cập nhật: 2026-11-13. Dành cho người tiếp quản và phiên trợ lý mới.

## Trạng thái và quyền thực hiện

- Pilot synthetic development-only: 20 JD tiếng Việt, 8 CV/JD, 160 cặp; không phải untouched test, không phải dữ liệu production.
- Gate A đã được người dùng duyệt qua yêu cầu tiếp tục gán nhãn sau khi Sol hồi quota. Manifest nguồn vẫn giữ trạng thái kỹ thuật `READY_FOR_GATE_A_SIGNOFF` từ trước lần duyệt; không sửa hash nguồn.
- B02 và B03 hoàn tất độc lập bằng hai context mới, model yêu cầu `cx/gpt-6.1-sol`. Hai bộ nhãn gốc phải giữ nguyên, không ghi đè khi adjudicate.
- Mỗi bộ 160 cặp; validator: 0 lỗi/0 cảnh báo. Initial 34 cờ review; blind 36 cờ.
- Đồng thuận 146/160 (91,25%), 14 bất đồng (đều lệch 1 mức), quadratic weighted kappa 0,9322.
- Queue 56 ca: 14 bất đồng + 32 đồng nhãn nhưng có cờ + 10 mẫu đồng thuận kiểm tra. Chưa có quyết định adjudication nào.
- C01–C06 đã có code và audit 160 cặp/46 features; 0 lỗi invariance/missingness/forbidden overlap. Tương quan độ dài vẫn là hạn chế, không phải bằng chứng không có confounding.
- Plans D/E/F/G mới có proposal/protocol/design. Chưa train, deploy hoặc bật ranking. Giữ nguyên AI1/AI2 cũ; runtime evidence-only-v1.
- Người dùng cho phép commit/push branch mới để chuyển máy. Không suy ra quyền train, mở rộng dữ liệu hoặc production.
- Tối đa 2 agent cùng lúc. Subagent kế thừa model đang chọn; không tự đổi model. Không tự bật Superpowers. Không cần worktree cho các output riêng.
- Ngày tham chiếu dữ liệu luôn 2026-11-10, không đổi theo ngày làm việc.

## File cần đọc

1. `PROTOCOL.md`, `IDEA_REFERENCE.md`, `PRODUCTION_ROADMAP.md`.
2. `source-acceptance-manifest-v3.json`, `audits-v3/` (audit cũ trong `audits/` chỉ là lịch sử).
3. `ANNOTATION_RUBRIC_B01.md`.
4. `labels-initial-v1.json`, `labels-blind-v1.json`; bản per-JD trong `labels-initial/`, `labels-blind/` là output gốc.
5. `label-validation-v1.json`, `label-agreement-v1.json` (bao gồm toàn bộ human_review_queue).
6. `PLAN_C_CONTRACT.md`, `plan_c_feature_audit.json` và mã AI2 mới trong `apps/matching-service/`.

`human-review-decisions.json` giữ nguyên 11 quyết định sửa nguồn ban đầu với trạng thái lịch sử; không phải nhãn relevance được duyệt. Một số README/roadmap vẫn ghi chờ B02/B03: trạng thái hiện tại trong tài liệu này và output nhãn mới hơn.

## Ca đang chờ người dùng review

Ca đầu tiên đã trình bày: **IT-J01-C03**, chưa được trả lời.

- JD Backend Node.js/NestJS yêu cầu >=3 năm Node.js/TypeScript, REST API + microservices, PostgreSQL + tối ưu SQL.
- CV thiên frontend; fullstack từ 2023-09, hỗ trợ endpoint NestJS, PostgreSQL cơ bản; có dự án module backend NestJS.
- Initial=2, blind=1. Đề xuất của coordinator=1 vì ba tiêu chí chính đều mới có bằng chứng một phần; đề xuất chưa phải quyết định người dùng.
- Hỏi lần lượt từng ca như người dùng đã yêu cầu; lưu quyết định riêng, không sửa nhãn gốc. Chỉ áp dụng quy tắc cho ca tương đương sau khi người dùng chốt, giữ provenance và danh sách ca áp dụng.

## Khôi phục code và dữ liệu nhỏ từ Git

Clone repository, checkout branch được ghi trong thông báo bàn giao. Toàn bộ pilot, nhãn, audit, snapshots và code AI2 mới có trong commit; không cần copy lịch sử chat hoặc thư mục `.claude/worktrees`.

Chạy từ repo root:

```bash
python3 -I dataset/ai2-pilot-v1/validate_sources.py
python3 -I dataset/ai2-pilot-v1/test_pilot_validation.py -v
python3 dataset/ai2-pilot-v1/test_label_validation.py -v
python3 dataset/ai2-pilot-v1/validate_labels.py dataset/ai2-pilot-v1/labels-initial-v1.json --role initial
python3 dataset/ai2-pilot-v1/validate_labels.py dataset/ai2-pilot-v1/labels-blind-v1.json --role blind_review
```

Matching-service cần môi trường Python/dependencies cài từ cấu hình repo; `/tmp/ai2-dev-venv` trên máy cũ không portable. Kiểm tra trước đó: 6 source tests + 2 label tests + 16 feature/metrics/layout tests đều pass. Full matching suite chưa pass trên môi trường offline do thiếu `aio-pika`/`sentence-transformers`; không được tuyên bố full regression xanh.

Không chạy lại script repair lên nguồn đã sửa. `build_acceptance_manifest_v3.py` tham chiếu đường dẫn task tạm của máy cũ; dùng manifest/audits đã lưu, không cần chạy lại để tiếp tục adjudication.

## Trọng số lớn ngoài Git

`artifacts/` và `kaggle-ranking-v1/` là export thực nghiệm AI1 hiện có, không phải model AI2 vừa train. Archive local `local-transfer/ai2-machine-transfer.tar.gz` bảo toàn hai cây thư mục, bao gồm ZIP gốc, cùng các file offline AI1 đang bị Git ignore nếu có (xem manifest). Archive không tự được upload lên GitHub.

Copy archive bằng USB hoặc kênh riêng được phép. Copy `transfer-archive.sha256` cùng archive. Sau khi clone repo trên máy mới:

```bash
# Đặt hai file cạnh nhau trước khi kiểm tra.
sha256sum -c transfer-archive.sha256
# Tại repo root, dùng đường dẫn archive thực tế.
tar -xzf /path/to/ai2-machine-transfer.tar.gz -C .
```

Manifest `TRANSFER_FILES.json` ghi kích thước/SHA-256 từng file local cần chuyển; không chứa secrets, cấu hình tài khoản, `.env`, token hay chat transcript. Archive bảo toàn file, không tự kích hoạt hoặc xác minh độ tin cậy model.

## Prompt tiếp tục trên máy mới

> Đọc dataset/ai2-pilot-v1/TRANSFER_CONTEXT.md và các báo cáo nhãn được dẫn trong đó. Tiếp tục B06 human adjudication, bắt đầu IT-J01-C03 chưa được chốt. Trình bày từng ca, giữ nguyên hai bộ nhãn silver, lưu quyết định riêng; không train/deploy/đổi AI1 hoặc AI2 cũ. Kiểm tra SHA-256 và validator trước khi dùng dữ liệu. Tối đa hai agent, kế thừa model phiên hiện tại; không tự bật Superpowers.
