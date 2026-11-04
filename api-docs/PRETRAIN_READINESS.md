# Kiểm tra trước khi lấy dataset và train model

Ngày kiểm tra: 14/10/2026. Branch: `feat/matching-model-readiness`.
Đây là kết quả kiểm tra code hiện tại, không phải thông báo đã hoàn thành training.
Lượt kiểm tra chỉ bổ sung tài liệu; không sửa runtime, lấy dataset hoặc train model.

## Kết luận

Có thể bắt đầu thu CV/JD thô và pilot gán nhãn có người kiểm tra. Chưa nên đóng
băng dataset ranking hoặc chạy thực nghiệm training chính thức. Hợp đồng dữ liệu
và bộ inference đã có, nhưng feature JD-specific, export/annotation workflow,
train/evaluate pipeline và định danh model bất biến chưa hoàn thành.

## Kiểm chứng đã thực hiện

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run matching:test` | 38 test pass |
| Candidate/Application service tests | 38 test pass trong 2 suite |
| `npx tsc --noEmit -p tsconfig.json` | Pass |
| Kiểm tra hệ số Logistic NaN | Artifact bị từ chối đúng |
| Tái hiện Java vs JavaScript | MATCHED, 90, CONTAINMENT: false positive |
| Tái hiện yêu cầu 5 năm Java vs skill Java | MATCHED, 90, CONTAINMENT dù candidate không có experience |

Test hiện tại chứng minh unit/contract đang hoạt động, không chứng minh chất lượng
semantic matching hoặc model đã train. Các ca false positive chưa được bao phủ
bằng regression tests yêu cầu hành vi đúng. Chưa chạy model thật, DB/RabbitMQ E2E,
load test hoặc đánh giá với dữ liệu có nhãn.

## Những việc cần xử lý

### 1. Sửa containment và điều kiện định lượng trước khi dùng output để hỗ trợ nhãn

[RequirementMatcher](../apps/matching-service/app/matching/requirement_matcher.py)
so khớp substring hai chiều trước khi gọi semantic. Điều này coi Java nằm trong
JavaScript là đủ và coi skill Java là đủ cho cả câu yêu cầu 5 năm kinh nghiệm.

Sửa matching theo boundary/skill entity thay vì substring bất kỳ. Tách điều kiện
skill, số năm, bằng cấp và mandatory/optional để kiểm tra riêng. Thêm regression
tests Java/JavaScript, C/C++/C#, skill đúng nhưng số năm thiếu, phủ định và điều kiện
AND/OR. Không lấy status/score hiện tại làm nhãn positive tự động.

Đây không phải lý do hoãn thu dữ liệu thô; nó ảnh hưởng auto-labeling, feature
extraction và việc đánh giá explanation. Người gán nhãn vẫn có thể đọc CV/JD gốc.

### 2. Chốt feature trước khi đóng băng ranking dataset

[MatchingScorer](../apps/matching-service/app/matching/scorer.py) vẫn đặt
certification_score = 0. Education chấm bằng cấp chung, experience/level theo
thời gian và cấp bậc chung, chưa đối chiếu điều kiện cụ thể của JD.

Chốt định nghĩa 8 feature, missing values và requirement schema. Nếu làm feature
JD-specific, nâng version và tính lại rows. Có thể chạy baseline thử với feature
hiện tại nếu công khai các hạn chế, nhưng không trình bày đó là bộ feature đã đáp
ứng đầy đủ yêu cầu đề tài. Ranking dataset cuối phải dùng semantic model đã chọn;
không trộn feature từ semantic-disabled/lexical/pretrained/fine-tuned không khai báo.

### 3. Hoàn thiện đường dữ liệu từ nguồn đến JSONL

[datasets.py](../apps/matching-service/ml/datasets.py) chỉ validate JSONL. Nó không
lấy dữ liệu từ DB/dataset ngoài, không export inputSnapshots, không dựng cặp,
không gán nhãn, chia tập hoặc mine hard negatives. Hiện chưa có feedback API,
trainer/evaluator hoặc dataset builder trong phần code đã kiểm tra.

Xây importer nguồn CV/JD, bản lưu snapshot, công cụ annotation và exporter.
Export toàn bộ evidence cần xét từ input snapshots, không chỉ top evidence của
requirementMatches: top match không đủ tạo negatives hoặc ground truth retrieval.
Đối chiếu requirement/evidence IDs và snapshot hashes với source archive; validator
hiện kiểm tra format/nhóm, không chứng minh text/feature thật sự đến từ snapshot đó.

Dataset ngoài có dạng CV-category hoặc CV-JD binary label không mặc nhiên đáp ứng
Requirement-Evidence và graded candidate ranking. Phải có bước ánh xạ, hoặc gán
thêm nhãn. Không cần hoàn tất frontend feedback để pilot annotation offline.

### 4. Chốt rubric, split policy và bộ đánh giá

Semantic: mô tả positive/negative và cách xử lý partial evidence, phủ định,
skill-related-but-insufficient, điều kiện số năm. Ranking: định nghĩa relevance
0..3 và ngưỡng positive dùng cho Precision/Recall/MRR. Lưu annotator/reason và
review một tập giao nhau để kiểm tra tính nhất quán giữa người gán nhãn.

Chia train/validation/test theo mục tiêu job mới hoặc job/candidate mới trước khi
mining negatives. Split của AI 1 và AI 2 phải tương thích; không train semantic
trên CV/JD thuộc test ranking. Validator mỗi file chưa kiểm tra leakage giữa hai
dataset. Chuẩn bị query/corpus/relevance ground truth cho retrieval metrics;
binary pair JSONL riêng lẻ chưa đủ mô tả toàn bộ bài toán truy xuất Top-K.

### 5. Chuẩn bị trainer và artifact reproducibility

[LogisticRanker](../apps/matching-service/app/matching/ranking.py) là inference
JSON, không phải trainer. Chưa có BM25 evaluator, semantic fine-tuner, logistic
trainer, XGBoost/LTR adapter, experiment configs/reports và hard-negative miner.

[SemanticScorer](../apps/matching-service/app/matching/semantic.py) đang định danh
model bằng tên/path; thay weights trong cùng path không đổi version. Cần manifest
ghi checksum/revision, dataset version, preprocessing, feature extractor,
hyperparameters và seed. Cần gate phân biệt embedding thật với lexical fallback
khi tạo feature cho thực nghiệm AI 1/AI 2. Threshold status và recommendation
phải chọn trên validation; giữ test set cho so sánh cuối.

## Trình tự có thể bắt đầu ngay

| Bước | Đầu ra cần có để chuyển bước |
| --- | --- |
| A. Chốt phạm vi dữ liệu | Miền tuyển dụng, ngôn ngữ, nguồn CV/JD và task cần gán nhãn |
| B. Thu/pilot annotation | CV/JD gốc, snapshot có ID/hash, rubric và mẫu được review thủ công |
| C. Sửa feature/matching + xây export | Regression cases đúng; rows truy được nguồn; version feature chốt |
| D. Xây dataset và evaluator | Split thống nhất, kiểm tra overlap/nhãn, BM25/pretrained baseline có báo cáo |
| E. Train AI 1 | Fine-tuned semantic, validation thresholds, test comparison và manifest |
| F. Regenerate feature + train AI 2 | Feature từ AI 1 đã chọn; logistic/XGBoost-LTR comparison theo từng job |
| G. Tích hợp và E2E | Model thật, parsing/matching/event/detail hoạt động, đo latency |

Việc thu dữ liệu và gán nhãn pilot có thể làm song song với C. Không dùng test set
để sửa threshold/hyperparameters. Chưa thể chốt số lượng mẫu hoặc thời gian train
khi chưa có thống kê nguồn dữ liệu, tốc độ gán nhãn và môi trường training.

## Hạng mục đã chuẩn bị và nên giữ

- Snapshot v2 bảo toàn description/project/certification và IDs từ hai nguồn.
- Unicode preprocessing, ngày tham chiếu, gộp khoảng experience chồng lấn.
- Result JSONB có inputs/evidence/features/hash/version để tái lập.
- Application detail có evidence/features/model metadata; event bỏ full inputs.
- Feature contract có thứ tự/scaling rõ, artifact validation và inference adapter.
- Dataset v2 kiểm tra nhãn/version/duplicate/split, cho phép pilot thiếu partitions.

Các thay đổi vẫn chưa commit/push và còn file mới chưa được Git theo dõi. Nên
tạo checkpoint có thể tái lập trước khi dataset/feature được đóng băng; lượt audit
này không tự tạo commit. [Data contract](matching-data-contract.md) là chuẩn field
hiện tại; [context map](MATCHING_CONTEXT_MAP.md) giải thích toàn bộ luồng thay đổi.
