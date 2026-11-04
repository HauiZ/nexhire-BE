# Matching Service: cấu trúc hiện tại

## Evidence-only runtime — 2026-10-25

The main worker no longer constructs/calls `MatchingScorer`, `WeightedRanker`,
`LogisticRanker` or pretrained `SemanticScorer`. The legacy scorer/ranker/semantic
modules remain **offline only** for dataset feature reproduction and research
benchmarks. Shared requirement/evidence extraction and normalization remain in use
by AI1; their heuristic scoring methods are not called by the main worker.
No training/dataset/comparison artifacts have been removed.

Until AI2 is ready, latest-result and matching.completed always expose
`scoringStatus="NOT_AVAILABLE"`, `totalScore=null`, `matchLevel=null`, including
archived results. New results persist NULL for every aggregate/component score;
explanations contain no heuristic ranking features or fit/action/priority claims.
Runtime outputs allowlist evidence/provenance fields, suppressing archived fit
recommendations. HR baselineDiagnostics is always null even when explicitly requested.

AI1 runs independently on typed normalized snapshots, preserving source text,
input hashes, origin and reference date. Disabled means DISABLED / HR NOT_PERFORMED,
not a fallback assessment; no model or fixture sidecar is called. Invalid model/pins
mean UNAVAILABLE without lexical/pretrained/verifier fallback or queue retry.
The current local M1 remains development/test only, not production approved.

The BE migration owner must apply `migrations/003_evidence_only_runtime.sql` before
restarting this revision. It transactionally drops score NOT NULL/defaults, checks
the expected table/columns, uses a five-second lock timeout, and performs no
historical updates. It is safe to rerun. BE applied only SQL003 twice to the local
matching database on 2026-10-25: self-check confirmed eight nullable score columns
without defaults and unchanged full-row hashes for ten historical rows. Evidence
was `logs/baseline-005/sql003-applied.json` relative to the BE root; completed
receipts are now in the cleanup-006 archive described in [tests/README.md](tests/README.md).
Tester verified local metadata/history preservation and disposable PostgreSQL/HTTP
persistence; other environments still require migration before
rollout. The full `matching:migrate` command was not executed for this check because
it also replays SQL002's conditional UPDATE.
Consumers must support null scores before rollout; do not roll back null columns
to NOT NULL while evidence-only rows exist.

Focused checks without provider/model download/DB access:

```powershell
.venv/Scripts/python.exe -B -m unittest discover -s tests -p test_evidence_only_runtime.py
.venv/Scripts/python.exe -B -m unittest discover -s tests -p test_hr_review_view.py
.venv/Scripts/python.exe -B -m unittest discover -s tests -p test_ai1_pipeline.py
```

The older execution receipts and integration notes below describe historical
revisions and do not establish acceptance of this evidence-only revision.

| Thư mục | Vai trò |
|---|---|
| `app/main.py`, `app/api/`, `app/worker.py` | API và worker chính |
| `app/matching/` | Runtime AI1 và chuẩn hóa; scorer/ranker cũ chỉ phục vụ thực nghiệm offline |
| `app/schemas/`, `app/clients/`, `app/models/`, `app/publishers/` | Contract, gọi service, lưu trữ và sự kiện |
| `app/experimental/` | Shadow inference, kiểm tra thành phần/điều kiện và contract phân tích LLM; không tự đăng ký vào runtime |
| `ml/` | Code chuẩn bị dataset/train/evaluation, không chứa weights |
| `tests/` | 13 module hồi quy hiện hành; xem [hướng dẫn test và kho lưu trữ](tests/README.md) |
| `src/`, `migrations/`, `data-source.ts` | Phần NestJS/migration còn được cấu hình tham chiếu; không xóa trong lần tổ chức này |
| `.venv/` | Thư viện Python local, đã Git ignore |

## Backend AI1 độc lập trong worker

`app/matching/ai1.py` là bộ gọi model tách khỏi nghiệp vụ;
`app/matching/m1_runtime.py` nạp M1 local có kiểm hash, không verifier hoặc
HTTP sidecar. Contract riêng ở `app/schemas/ai1.py`; kết quả được lưu trong
`explanation.ai1Assessment` và đọc qua API HR hiện có.

Mặc định `MATCHING_AI1_BACKEND=disabled`. Để kiểm thử local, cấu hình cho
process `local_m1`, `MATCHING_AI1_MANIFEST_PATH` tuyệt đối và
`MATCHING_AI1_MANIFEST_SHA256` đúng bytes, rồi restart. Không cần sửa worker
để đổi checkpoint cùng kiến trúc; giữ thư mục/config cũ để rollback. Manifest
hiện tại shadow-only nên backend chỉ chạy development/test, chưa production.
Tắt backend không sửa kết quả cũ. Sai pin/model lỗi trả AI1 UNAVAILABLE,
không lexical fallback, không tự retry queue hoặc tự tuyển/loại.

Đã chạy10 request thật qua HTTP/DB/worker/M1/result/HR, gồm lỗi pin, khôi phục,
tắt/bật lại; không nạp verifier. Raw fixture receipt:
`training/ai1/review/local-ai1-worker-v1/results.json`.

```powershell
$env:RUN_JD_PLAN_POSTGRES_TEST='1'
$env:RUN_JD_PLAN_MODEL_FLOW='1'
$env:AI1_WORKER_TEST_BACKEND='local_m1'
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath apps/job-service/src/job/requirement-plan/requirement-plan.postgres.spec.ts
```

Lệnh trên chạy từ repo root với Docker local đang bật, tạo/dọn DB test riêng;
không ghi vào DB ứng dụng/deploy. Chưa phải upload/PDF, JWT gateway hoặc
RabbitMQ/application consumer toàn luồng. Xem [API contract](../../api-docs/matching-data-contract.md).

## Chạy Và Kiểm Tra

Từ root repo: `npm run start:matching-service` chạy API chính.
Dev reload chỉ theo dõi `apps/matching-service/app`; sửa file trong `trainning/`,
`dataset/` hoặc service khác không khởi động lại matching-service. Sau khi thay
đổi launcher, cần chạy lại lệnh một lần để watcher nhận cấu hình mới.
Dockerfile vẫn khởi chạy `app.main:app`, không chạy experimental.

Từ thư mục service:

```powershell
.venv/Scripts/python.exe -B -m unittest discover -s tests
```

Chỉ khi chủ động thử shadow, đặt `MATCHING_SHADOW_MANIFEST` trỏ tới manifest đã
kiểm chứng và `MATCHING_SHADOW_TOKEN` riêng, rồi chạy từ thư mục service:

```powershell
.venv/Scripts/python.exe -m uvicorn app.experimental.shadow_main:create_app --factory --host 127.0.0.1 --port 3017
```

Không dùng token production; không mở cổng public. API shadow không ghi DB,
không gọi LLM và không đưa quyết định tuyển dụng. Model vẫn chưa được promote vào runtime.

### HR Shadow Có Đề Xuất Verifier

Entry riêng `app.experimental.hr_shadow_main:create_app` giữ token/giới hạn/timeout
của shadow cũ, thêm `hr_proposals` bằng checkpoint verifier fine-tune thật.
`model_suggestion` là đề xuất chưa xác thực; trạng thái quyết định vẫn pending HR.
Không có kế hoạch nhóm ý JD thì báo `NOT_PERFORMED`, không tự suy ra thiếu kỹ năng.
Entry cũ và production không thay đổi.

Ngoài `MATCHING_SHADOW_MANIFEST` và token shadow riêng, cần cấu hình:

- `MATCHING_SHADOW_VERIFIER_DIR`: thư mục
  `training/ai1/experiments/text-verifier-supervision-v2/corpus600/corrected_crossencoder/`
  (đường dẫn tuyệt đối hoặc đúng theo working directory).
- `MATCHING_SHADOW_VERIFIER_RESULTS_SHA256`:
  `96e4d7585a01a93b9ee8477adfe42f87116aa5a7d74f1ecc8cf75dd1a318ed86`.
- Tùy chọn `MATCHING_SHADOW_JD_PLANS`: file theo schema
  `nexhire-hr-shadow-plans-v1`, khớp chính xác job/requirement ID/text. Fixture ở
  `training/ai1/experiments/hr-shadow-integration-v1/jd_plan_config.json` chỉ dành
  cho bốn JD hư cấu của phép kiểm tra, không dùng như taxonomy chung cho mọi JD.

Từ thư mục service, sau khi đặt cấu hình riêng cho process:

```powershell
.venv/Scripts/python.exe -m uvicorn app.experimental.hr_shadow_main:create_app --factory --host 127.0.0.1 --port 3018
```

Đã kiểm tra HTTP loopback với hai model thật:12 CV hư cấu/bốn ngành,24 đề xuất
component, quote gốc và provenance giữ đúng; CV rỗng, token sai, review injection
và context vượt512 được xử lý. Output ở
`training/ai1/experiments/hr-shadow-integration-v1/results.json`. Đây không phải
parse PDF -> hệ thống -> HR lưu quyết định; API chưa nhận review có xác thực.

## File Dữ Liệu Và Model

- [Dataset chính](../../dataset/README.md): `dataset/current/`.
- [Model, input train và kết quả](../../training/ai1/README.md): `training/ai1/`.
- [API/data contract](../../api-docs/matching-data-contract.md).
- [Chuẩn bị trước dataset/train](../../api-docs/PRETRAIN_READINESS.md): giữ nguyên.

## Tổ Chức Lại 23/10/2026

Tám module thử nghiệm chuyển vào `app/experimental/`; không thay thuật toán,
checkpoint, nhãn, endpoint hoặc payload. Các import Python dùng đường dẫn mới,
không giữ alias cũ. Nếu từng chạy `app.shadow_main:create_app`, đổi lệnh như trên.
Kết quả mới dùng revision `experimental-layout-v3`; JSON/prompt/receipt lịch sử
không được viết lại. Các runner pilot trả phí vẫn giữ journal/hạn mức cũ:
đổi code không cấp lại quyền gọi API, và prompt hash khác sẽ bị chặn.

## Kiểm Chứng Sau Khi Tách

- HTTP loopback hai checkpoint: 128 requirement variants giữ nguyên Top-K/trích dẫn;
  không thay runtime production, không gọi DB/LLM, server thử đã dừng.
- `training/ai1/check_no_answer.py` thử 4 CV hư cấu mới / 16 yêu cầu mỗi model:
  8 có bằng chứng, 8 không có bằng chứng đầy đủ. **Cả hai model đưa 7/8 yêu cầu
  không có bằng chứng vượt pair-reference**; không được dùng cờ này làm nhãn đáp ứng.
- Bộ nhỏ do assistant biên soạn, không phải gold hay đánh giá thực địa. Mỗi CV chỉ
  có 3 đoạn, nên Hit@3 của các positive không chứng minh khả năng xếp hạng.
- Giữ bắt buộc review; chưa promote model, chưa hiệu chỉnh threshold hay train lại.

## Bước Xác Nhận Bằng Chứng 23/10/2026

`app/experimental/evidence_assessment.py` tạo trạng thái `PENDING_REVIEW` khi chưa
có review, dù cosine cao. Review rõ nguồn mới được đưa vào phép kiểm tra thành phần;
có thể ra đầy đủ, một phần, chưa được chứng minh trong Top-K, hoặc cần xem xét thêm.
Review cũ bị từ chối nếu đổi JD/CV ID, model, yêu cầu, đoạn trích, thứ tự hoặc điểm.
Đây không phải xác thực danh tính HR và chưa mở endpoint nhận review.

API shadow hiện có hai endpoint dùng cùng token riêng:
- `POST /api/v1/shadow/requirements`: giữ nguyên output truy hồi.
- `POST /api/v1/shadow/assessments`: cùng input `{job, candidate}`, thêm
  `assessments[]` với `PENDING_REVIEW`, điểm/trích dẫn giữ nguyên; không nhận review
  hay suy ra thiếu kỹ năng từ cosine. JD/CV ID phải có nội dung.

Đã chạy HTTP với hai checkpoint: 128 assessment và 128 retrieval variants qua
4 ngành, JD EN/VI. Token sai, review giả, CV rỗng và khóa encoder dùng chung đã
kiểm tra. Kết quả mới ở `training/ai1/experiments/shadow-http-v1/revisions/pending-assessment-v4/`.
Chưa mở API review có xác thực HR, chưa tích hợp gateway/DB/worker production.

Đã replay 64 trường hợp bằng `training/ai1/check_evidence_assessment.py`, không chạy
API trả phí hay sửa dữ liệu/model. Kết quả ở
`training/ai1/experiments/evidence-assessment-v1/revisions/json-canonical-v2/`. Quan hệ do assistant review,
**không phải model tự phát hiện thiếu sót**, không phải gold hoặc nhãn train mới.
