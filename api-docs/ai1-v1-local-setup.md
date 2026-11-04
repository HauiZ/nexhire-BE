# Chạy AI1 v1 trên feature branch

Dành cho thành viên phát triển NexHire. Branch BE `feat/matching-model-readiness`
và FE `feat/ai1-hr-review-ui` chứa source AI1 v1. Checkpoint được chọn là
`ranking-retention`, version `ai1-shadow:ranking-retention:871aeef8a305`.
Đây là retrieval hỗ trợ HR trong development/test, chưa được duyệt production.
Không có điểm tổng AI2 hoặc tự động xác nhận đáp ứng/tuyển/loại.

## 1. Nhận và giải nén model riêng

Clone/checkout BE branch `feat/matching-model-readiness`. Model không nằm trong
Git; nhận bundle `nexhire-ai1-v1-ranking-retention.zip` do người phụ trách dự án
gửi riêng. Không cần Git LFS. Giải nén vào một thư mục trống trước, kiểm tra danh
mục rồi đặt vào repo để có cấu trúc sau (không lồng thêm một tầng thư mục ZIP):

```text
trainning/ai1/exports/kaggle-ranking-v1/
├── shadow-ranking-retention.json
└── models/ranking-retention/
    ├── config.json
    ├── config_sentence_transformers.json
    ├── model.safetensors
    ├── modules.json
    ├── README.md
    ├── sentence_bert_config.json
    ├── special_tokens_map.json
    ├── tokenizer.json
    ├── tokenizer_config.json
    └── 1_Pooling/config.json
```

Người gửi chỉ đóng gói đúng 11 file trên, giữ nguyên cấu trúc và nội dung.
Weights khoảng 471 MB, tokenizer khoảng 17 MB; tổng bundle khoảng 488 MB trước
khi nén. Không gửi `.env`, credentials, CV cá nhân, dataset, training input,
checkpoint thử nghiệm khác hoặc source-v2. Thư mục `trainning/` vẫn được ignore.
Kiểm hash theo mục 4 trước khi chạy; không chạy script hoặc cài package từ ZIP.

## 2. Cài dependencies

Yêu cầu Node/npm, Python tương thích requirements (môi trường đã kiểm dùng Python
3.12), PostgreSQL/RabbitMQ và các service NexHire theo cấu hình local của nhóm.

```sh
npm ci
npm run matching:venv
npm run matching:install
```

Thiết lập DB và các service theo hướng dẫn dự án. Không chạy migration lên DB
chia sẻ/production nếu chưa được người quản lý DB cho phép. Evidence-only runtime
cần migration `apps/matching-service/migrations/003_evidence_only_runtime.sql`;
không coi tải model là đã hoàn tất chuẩn bị DB hoặc dữ liệu nghiệp vụ.

## 3. Cấu hình riêng trên từng máy

Tạo `.env` local từ `.env.example`, bổ sung DB/broker/internal service URLs và
credentials riêng. Không commit `.env` hoặc copy credentials giữa các máy.
Thêm các thiết lập dưới đây (path phải là đường dẫn tuyệt đối trên máy đó):

```dotenv
NODE_ENV=development
MATCHING_AI1_BACKEND=local_m1
MATCHING_AI1_MANIFEST_PATH=D:/your-checkout/nexhire-BE/trainning/ai1/exports/kaggle-ranking-v1/shadow-ranking-retention.json
MATCHING_AI1_MANIFEST_SHA256=bdfc4c0aef381cc73de2447251a27d4f1381f3787606833f79657931190620d4
```

Không chỉnh manifest hoặc các file model: runtime kiểm hash chính xác từng file.
Manifest tự giải đường dẫn model tương đối từ vị trí manifest, không phụ thuộc
đường dẫn training cũ. V1 không cần khóa ký/source-document flag của v2.
`NODE_ENV=production` không được phép nạp checkpoint shadow này.

Khởi động từng service cần thiết bằng scripts `start:<service>` của dự án:

```sh
npm run start:matching-service
```

Frontend: checkout branch `feat/ai1-hr-review-ui`, cài dependencies và cấu hình
API gateway theo môi trường local, rồi chạy `npm run dev`.

## 4. Kiểm tra bundle mà không gọi provider hoặc DB

Tại root BE, trên Windows:

```sh
apps/matching-service/.venv/Scripts/python.exe -B -c "import sys; sys.path.insert(0, 'apps/matching-service'); from app.matching.m1_runtime import verify_manifest; verify_manifest('trainning/ai1/exports/kaggle-ranking-v1/shadow-ranking-retention.json', 'bdfc4c0aef381cc73de2447251a27d4f1381f3787606833f79657931190620d4'); print('M1 bundle verified')"
```

Trên macOS/Linux dùng executable Python tương ứng trong `.venv/bin/`.
Chỉ khi cần smoke-load model thực mới gọi `LocalM1Runtime.load`; kiểm manifest
không tự tải model hoặc chứng minh DB/broker/UI hoạt động.

## 5. Sử dụng và giới hạn

Dùng application/CV đã parse hợp lệ và tài khoản recruiter có ownership để kiểm
matching/HR review. CV chưa parse có thể phát sinh request provider trả phí;
không dùng thao tác đó làm smoke test nếu chưa được cho phép.

- Kết quả M1 là Top-3 đoạn từ snapshot chuẩn hóa, không phải PDF/page/span đã xác minh.
- Similarity không phải phần trăm đáp ứng hay candidate-fit score.
- Sai pin/model không khả dụng phải hiện unavailable, không fallback giả thành M1.
- HR plan confirmation xác nhận cấu trúc JD, không xác nhận năng lực ứng viên.
- Code v2 còn local không thuộc bản v1 trên remote; không bật v2 theo tài liệu này.
