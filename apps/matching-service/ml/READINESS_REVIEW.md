# Rà soát chuẩn bị model và kế hoạch tiếp theo

> Đây là bản rà soát trước đợt chuẩn hóa v2. Một số thiếu hụt dưới đây đã được xử lý:
> bảo toàn description/project/certification, ID evidence, snapshot đầu vào,
> preprocessing Unicode, experience chồng lấn, Application response và dataset policy.
> Xem [hợp đồng hiện hành và ghi chú thay đổi](../../../api-docs/matching-data-contract.md)
> để chuẩn bị dataset mới. Structured JD, feature đối chiếu JD, feedback/export và
> training/evaluation vẫn chưa hoàn thành.

Ngày rà soát: 08/10/2026. Branch: `feat/matching-model-readiness`, tạo từ `develop`.
Phạm vi: yêu cầu trong `C11_C14.docx`, diff hiện tại, matching-service và các điểm
giao tiếp với candidate/application. Chưa đánh giá toàn bộ frontend hay vận hành
production. Tài liệu DOCX được dùng làm yêu cầu đối chiếu, không phải lệnh thực thi.

## 1. Kết luận hiện trạng

Đã chuẩn bị giao diện tích hợp cho hai bài toán AI. Chưa có hai model được train,
dataset thực tế có nhãn, pipeline train hoặc báo cáo chất lượng. Bộ cộng trọng số
vẫn là baseline chạy mặc định. LogisticRanker là bộ inference, không phải pipeline
huấn luyện Logistic Regression. Khả năng nạp thư mục SentenceTransformer đã có từ
trước; branch này không bổ sung fine-tuning semantic model.

Chạy lại `npm run matching:test`: 26 test pass. `git diff --check` không báo lỗi
whitespace. Đây là kiểm chứng unit/contract; chưa chứng minh model thật, DB,
RabbitMQ, gateway, frontend hoặc E2E chạy đúng. Thay đổi chưa commit/push tại thời
điểm rà soát. Lượt rà soát này chỉ bổ sung tài liệu.

## 2. Những phần đã làm

| Phần | Code | Mức hoàn thành và giới hạn |
| --- | --- | --- |
| Tách ranking | `app/matching/ranking.py` | Ranker interface, WeightedRanker, LogisticRanker; chưa XGBoost/LTR |
| Feature contract | `RankingFeatures`, `FEATURE_NAMES` | 8 feature, 0..100; inference chia 100; certification vẫn 0 |
| Nạp artifact | `load_ranker`, `app/config.py` | Nạp JSON logistic; kiểm tra schema/thứ tự, số hữu hạn và version semantic |
| Runtime tích hợp | `app/matching/scorer.py` | Scorer trích feature rồi gọi ranker, không tự cộng trọng số tại chỗ |
| Evidence giải thích | `app/schemas/match_result.py` | Requirement, source, evidence, score, status; chưa ID/offset và raw cosine |
| Lưu kết quả | `app/matching/service.py` | Explanation JSONB giữ feature/evidence/version; không cần migration cho các trường này |
| Truyền kết quả | Result snapshot và `matching.completed` | Mang explanation; Application response chưa expose các trường mới |
| Dataset contract | `ml/datasets.py` | Semantic binary pairs và ranking relevance 0..3; chưa dataset builder/export |
| Dataset validator | `validate_dataset` | Kiểm tra duplicate, version, nhãn, split và một số dạng leakage |
| Config/tài liệu | `.env.example`, `ml/README.md`, API docs | Thêm artifact path, mô tả cách nối model; env thật chưa được thay đổi |
| Tests | `tests/test_model_readiness.py` | 14 test mới, cùng 12 test trước; chưa kiểm tra DB/broker/model thực |

## 3. Điểm cần sửa trước khi train

### P0: Đầu vào đang mất thông tin evidence

`CandidateExperienceSnapshot` không có description. `_candidate_from_parsed_resume`
bỏ description dù ParsedResume có trường này. `build_candidate_text` và
RequirementMatcher chỉ dùng title/company cho Experience. Ví dụ CV ghi đã triển
khai Java/Spring Boot trong description sẽ mất bằng chứng quan trọng khi matching.

Candidate-service `getMatchingSnapshot` cũng bỏ experience description và chỉ gửi
tên project. Matching schema chuyển tên project thành object, nhưng không thể khôi
phục description/technologies. Hai đường lấy profile và lấy parsed CV vì vậy không
tương đương. Cần thống nhất shared contract, TS mapping và Python mapping; giữ
source ID và nội dung gốc để annotation/explanation truy về đúng CV.

### P0: Feature chưa đủ ý nghĩa theo JD

`certification_score` luôn 0. Education được chấm theo bằng cấp chung, không so với
bằng/chuyên ngành JD. Experience và level dựa trên tổng thời gian, chưa gắn với kỹ
năng/ngành cụ thể; khoảng thời gian chồng lấn đang được cộng nhiều lần. Các điểm
mặc định như education/location cần được phân biệt với dữ liệu thực sự đáp ứng.

Chuẩn hóa định nghĩa từng feature, chính sách missing values và ngày tham chiếu
tính experience. Nếu thay đổi ý nghĩa/chuẩn hóa, nâng feature schema version và
tính lại dataset; không chỉ sửa runtime rồi tiếp tục dùng artifact cũ.

### P0: Explanation chưa đạt đủ yêu cầu học thuật

RequirementMatcher tách phrase bằng regex, bỏ phrase dài hơn 18 từ và chỉ giữ 16
requirement đầu. JD dài có thể mất yêu cầu. Evidence hiện là text đã normalize,
không phải đoạn nguyên bản có địa chỉ nguồn. Score trả ra đã qua threshold bins và
source weights, không phải raw semantic score.

Threshold MATCHED = 0.65 chưa được kiểm chứng bằng validation. Profile có source
weight 0.6 nên không thể đạt MATCHED; education semantic match tối đa thường là
0.9 * 0.65 = 0.585. Đây là chính sách heuristic cần đo lại, không phải bằng chứng
model đã học đúng. Tách raw similarity, business score, confidence/status; giữ
evidence ID, section và đoạn nguyên bản. Điều kiện số năm/bằng cấp cần kiểm tra
cấu trúc thay vì chỉ dùng similarity.

### P1: Model version chưa là định danh bất biến

Semantic version đang lấy tên hoặc đường dẫn model. Ghi đè weights ở cùng đường
dẫn vẫn giữ version cũ; đổi đường dẫn cùng weights lại đổi version. Kiểm tra hiện
tại chỉ chặn khác chuỗi version, chưa xác minh cùng model/preprocessing/calibration.
Cần manifest có artifact checksum, training run, dataset version, preprocessing
version và feature extractor version. Xác minh manifest trước khi bật model.

### P1: Bộ validator chưa thay thế được chiến lược chia dữ liệu

Hiện yêu cầu cùng job/candidate không được qua nhiều split; semantic còn cấm cùng
requirement/evidence text qua split. Skill phổ biến có thể nối phần lớn dataset
thành một nhóm và làm việc chia dữ liệu khó thực hiện. Chốt trước mục tiêu đánh
giá: job mới, candidate mới hay cả hai; xây splitter phù hợp và báo cáo overlap.

Validator hiện chưa có near-duplicate detection, độ đồng thuận annotator, kiểm tra
query có positive và hard negative, hoặc phân bố nhãn/ngôn ngữ/ngành. Không được
coi JSONL hợp lệ là dataset đủ chất lượng. Candidate/job ID cần pseudonymous;
snapshot/version phải đủ để dựng lại đầu vào tại thời điểm gán nhãn.

### P1: Hợp đồng Application và tài liệu parse đang mâu thuẫn

Application response hiện chỉ map các trường explanation cũ; feature và evidence
mới chưa đến frontend. Cần bổ sung internal snapshot type, response DTO, mapper,
Swagger và API tests; phân quyền recruiter/candidate đúng phạm vi.

Đính chính nhận xét trước: không nên sửa `autoMatchRequested = dto.parse === true`
chỉ vì tên cờ parse. Code và tests hiện chủ động auto-match application; parse=true
được chuyển thành applyToProfile khi cần parsing. API docs và mô tả DTO vẫn nói
parse là opt-in parsing/matching, nên phải thống nhất nghiệp vụ và contract trước.

### P1: Train, đánh giá và vận hành model còn thiếu

Chưa có trainer semantic/logistic/XGBoost, evaluator, BM25 baseline, hard-negative
miner, export feedback, experiment reports, artifact promotion/rollback. Ranker
logistic trả sigmoid * 100, nhưng các ngưỡng recommendation đang giữ heuristic
cũ; cần kiểm chứng calibration và threshold. Không tự động đổi application stage
dựa trên kết quả model.

Worker gọi scorer đồng bộ, xử lý lần lượt; semantic encode nhiều lần cho từng
requirement/evidence pair. Trước khi tải tăng cần batch encode, cache theo version,
đưa inference ra khỏi event loop nếu cần, rồi đo queue wait/inference/P95 latency.
Không mặc định tách thêm microservice trước khi có số đo.

## 4. Kế hoạch theo thứ tự phụ thuộc

| Giai đoạn | Công việc và phạm vi code | Đầu ra / điều kiện nghiệm thu |
| --- | --- | --- |
| A. Chốt contract | Shared interfaces, candidate internal snapshot, Python snapshots/service, Application DTO/docs | Hai đường parsed/profile giữ cùng evidence; tests parse flag; evidence hiện ra Application API |
| B. Chuẩn hóa JD và feature | Job-service lưu structured requirements; matching trích features riêng và giữ nguyên văn/source | Requirement ID/type/mandatory/minYears/skill/degree; experience không double count; certification/education đối chiếu JD; version mới |
| C. Thu nhãn và xuất dữ liệu | Feedback API, bảng feedback/migration, export join matchResult/CV/JD versions | Nhãn semantic và relevance 0..3 có rubric/annotator/reason; quyền recruiter đúng company; export tái tạo được snapshot |
| D. Dataset và baseline | Builder, splitter, cleaning, hard negatives, quality report, evaluator | Train/validation/test có group policy rõ; kiểm tra overlap; cùng test protocol cho BM25/pretrained |
| E. Train AI 1 | Trainer SentenceTransformer, config/seed, retrieval eval, manifest/export | Fine-tuned model; comparison B0/B1/M1; Recall@K/MRR/NDCG hoặc P/R/F1 phù hợp task; threshold chọn trên validation |
| F. Train AI 2 | Regenerate features bằng AI 1 đã chọn; trainer logistic và XGBoost/LTR; adapter export | Baseline weighted/logistic và model chính; metrics theo job; ablation bỏ semantic; artifact khớp inference |
| G. Tích hợp sản phẩm | Recruiter ranking/evidence/feedback; candidate Top-K jobs và explanation | Ranking trong đúng job; recommendation có lọc job hợp lệ; score là hỗ trợ quyết định; E2E hai luồng người dùng |
| H. Vận hành và báo cáo | Batch/cache/inference scheduling, artifact validation, retries/recovery, E2E/load tests | Đo parsing/matching/P95, kiểm tra duplicate/retry/crash và DLQ nơi có broker consumer; report và demo tái lập được |

A và B nên hoàn thành trước khi đóng băng feature contract. C có thể bắt đầu khi
đã định nghĩa rubric và snapshot IDs. D cần có nguồn dữ liệu thực tế; dữ liệu mẫu
chỉ để test pipeline, không dùng để kết luận chất lượng. F phụ thuộc model và cách
chấm semantic của E vì semantic_score là feature đầu vào cho ranking.

## 5. Thiết kế dataset cụ thể

Semantic dataset: mỗi requirement/query có evidence đúng và evidence sai; hard
negative nên gần chủ đề nhưng thiếu điều kiện quan trọng. Giữ relevance judgment
theo query, nguồn CV/section, ngôn ngữ và nhóm ngành. Chuẩn bị evaluation corpus
và ground truth retrieval, không chỉ danh sách binary pairs rời rạc.

Ranking dataset: mỗi job có nhiều candidate với relevance 0..3. Snapshot giữ đủ
JD/CV, ngày tính experience, 8 feature và các version. Human feedback gắn với
matchResult cụ thể; thay CV/JD phải tạo snapshot mới. Nhãn logistic có thể dùng
relevance >= 2; model LTR dùng graded labels và group theo job. Ghi rõ quy tắc
positive dùng cho Precision/Recall/MRR và gain cho NDCG.

Chốt dataset của hai model với split policy tương thích, tránh semantic model đã
train trên CV/JD thuộc test ranking. Dùng validation chọn hyperparameters và
threshold; test set để đánh giá cuối. Không dùng recommendation hiện tại làm nhãn.

Chưa chốt số lượng mẫu hoặc thời gian train vì chưa có thống kê dữ liệu, người gán
nhãn và tài nguyên GPU. Sau pilot annotation, báo cáo số job/candidate/query/pair,
phân bố nhãn, độ đồng thuận và learning curve để quyết định mở rộng.

## 6. Bước triển khai gần nhất

Ưu tiên A + B: bảo toàn description/project technologies, thêm source IDs, thống
nhất parse contract, expose evidence trong Application API, rồi bổ sung structured
JD và nâng feature schema. Tiếp đó triển khai feedback/export và evaluation
baseline. Không nên train trên feature contract hiện tại rồi sửa lại ngay sau đó.

Các quyết định cần chốt trước training: miền/ngôn ngữ CV-JD mục tiêu, nguồn dữ liệu,
rubric, mục tiêu split, artifact identity và resources. Các thao tác code thông
thường như mở rộng snapshot/DTO, bảo toàn evidence và viết contract tests có thể
thực hiện trước khi có dataset/model thật.
