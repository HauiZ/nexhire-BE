# Hướng dẫn Thực nghiệm Kaggle AI1 (AI1 Kaggle Experiment Guide)

Tài liệu hướng dẫn quy trình đóng gói, kiểm thử và thực thi thí nghiệm tiếp tục huấn luyện (continuation experiment) AI1 Silver v1 trên hạ tầng GPU Kaggle.

---

## 1. Mục tiêu & Bản chất Thực nghiệm

- **Thí nghiệm Tiếp tục Mới (Continuation Experiment)**: Do bundle 1.233 cặp so sánh huấn luyện ban đầu trong quá khứ không còn lưu giữ đầy đủ mã nguồn và artifact trung gian, đây là **thực nghiệm tiếp tục mới** được dựng từ các cặp đối sánh trích xuất từ tập `train` của `semantic.jsonl` kết hợp với 56 cặp xếp hạng hỗ trợ (support-ranking) silver đã qua rà soát.
- **Bản chất Dữ liệu Silver**: 56 cặp dữ liệu silver là tập dữ liệu huấn luyện thực nghiệm do trợ lý AI rà soát có giám sát, **không phải nhãn gold do chuyên gia con người thẩm định** (not expert or human gold).
- **Không thay thế production**: Thí nghiệm chỉ phục vụ mục tiêu chẩn đoán ranking bằng chứng (evidence-ranking diagnostic). Kết quả **không cấu thành việc phê duyệt đưa vào môi trường thực tế (production)** hay thay thế mô hình M1 hiện hành.
- **Không tự động upload/deploy**: Toàn bộ quy trình diễn ra trong môi trường Kaggle Notebook của người dùng dưới hình thức Private Dataset. Không có script nào tự động kích hoạt API bên ngoài hay tự động triển khai.

---

## 2. Thiết kế Thực nghiệm (3 Nhánh: Arms A, B, C)

Thực nghiệm so sánh 3 nhánh trong điều kiện kiểm soát nghiêm ngặt:

| Tiêu chí | Nhánh A (Baseline M1) | Nhánh B (Control Old Train) | Nhánh C (Silver Continuation) |
| :--- | :--- | :--- | :--- |
| **Mô hình khởi tạo** | Checkpoint M1 retention | Checkpoint M1 retention | Checkpoint M1 retention |
| **Dữ liệu huấn luyện** | Không huấn luyện (step 0) | Cặp đối kháng từ `semantic.jsonl` train | `semantic.jsonl` train + 56 cặp silver (tỷ lệ 25%) |
| **Cơ chế hòa trộn (Mixture)** | Không áp dụng | 100% old train | 25% slots silver (lấy mẫu có hoàn lại), 75% old train |
| **Ngân sách cập nhật (Budget)** | 0 steps | 155 update steps | 155 update steps (đồng nhất Nhánh B) |
| **Batch size** | Không áp dụng | 8 | 8 |
| **Learning rate** | Không áp dụng | 2e-5 (AdamW, clip_norm=1.0) | 2e-5 (AdamW, clip_norm=1.0) |
| **Hinge Loss Margin** | Không áp dụng | 0.1 | 0.1 |
| **Retention Loss** | Không áp dụng | Frozen Teacher M1 retention (weight=1.0) | Frozen Teacher M1 retention (weight=1.0) |
| **Random Seed** | 42 | 42 | 42 |

### Quy tắc Lựa chọn Model (Selection Rule)
1. **Chỉ dùng tập Validation**: Model selection chỉ dựa trên chỉ số **Job-Macro MRR trên tập Validation** (`job_macro_mrr`).
2. **Step 0 (Baseline) đủ điều kiện tham gia lựa chọn**: Tránh hiện tượng suy giảm hiệu năng không cần thiết (regression). Nếu checkpoint sau huấn luyện không vượt qua baseline step 0, baseline sẽ được chọn.
3. **Phá vỡ thế hòa (Tie-breaking)**: Khi hai checkpoint có cùng Job-Macro MRR, checkpoint có số step nhỏ hơn (sớm hơn) sẽ được ưu tiên.
4. **Tập Test độc lập**: Tập Test **không bao giờ được chạm tới trong quá trình chọn model**. Đánh giá Test chỉ diễn ra một lần duy nhất trên checkpoint đã được chọn cuối cùng.

---

## 3. Giao thức Đánh giá (Restricted Labeled Candidate Pool)

- **Nhóm ứng viên hạn chế (Restricted Pool)**: Các bản ghi được nhóm theo `(split, job_id, requirement_id, exact requirement)`. Chỉ các ứng viên có nhãn đã biết trong nhóm mới được đưa vào pool; **tuyệt đối không giả định bằng chứng của yêu cầu khác là negative**.
- **Khử trùng lặp & Chống xung đột**: Khử trùng lặp văn bản bằng chứng chuẩn hóa NFKC. Nếu hai bản ghi có cùng bằng chứng chuẩn hóa nhưng mang nhãn xung đột (1 và 0), hệ thống **fail-closed** ngay lập tức và báo lỗi.
- **Tập Relevant Đầy đủ**: Hỗ trợ đa bằng chứng dương (multiple positives) cho một yêu cầu.
- **Xử lý Query không có Positive**: Các query không có ứng viên dương nào (`pos_count == 0`) được ghi nhận số lượng và **loại khỏi mẫu số tính MRR, Hit@k, Recall@k**.
- **Chỉ số đo lường**:
  - **Job-Macro MRR** (Chỉ số chính): Tính trung bình MRR trong từng job trước, sau đó lấy trung bình giữa các job.
  - **Micro MRR, Hit@1, Hit@3, Recall@1, Recall@3** (Chỉ số phụ).
  - Phân bố kích thước pool: min, p25, median, p75, max, mean.
- **Paired Job Bootstrap CI 95%**: Đo độ chênh lệch hiệu năng giữa Nhánh C và Nhánh A ($\Delta_{C-A}$), và Nhánh C và Nhánh B ($\Delta_{C-B}$) với 1.000 lượt resample có hoàn lại theo đơn vị Job.

---

## 4. Bảo đảm An toàn & Toàn vẹn Dữ liệu

1. **Cho phép Trích xuất Giới hạn (Model File Allowlist & Offline Safetensors Only)**:
   Bộ trích xuất và runner chỉ chấp nhận các file cấu hình và trọng số safetensors đã được định nghĩa trước:
   - `config.json`, `sentence_bert_config.json`, `tokenizer_config.json`, `config_sentence_transformers.json`, `modules.json`, `README.md`, `special_tokens_map.json`, `tokenizer.json`, `model.safetensors`, `1_Pooling/config.json`.
   - Mọi file chứa mã thực thi (`.py`, `.sh`, `.bin`, `.exe`, `.pickle`) hoặc đường dẫn leo thang (`..`), đường dẫn tuyệt đối, symlink đều bị từ chối.
   - Chế độ offline safetensors only: từ chối các file weights binary không an toàn.
2. **Kiểm tra Rò rỉ Dữ liệu (Zero Leakage Check)**:
   - Tập huấn luyện (train và silver) và tập kiểm thử (validation và test) hoàn toàn không có giao điểm về `job_id`.
   - Không có cặp `(requirement, evidence)` nào của train hoặc silver xuất hiện trong validation hoặc test.
3. **Mã băm SHA-256 Manifest & Xác thực Trước Khi Import**:
   File `manifest.json` ghi lại mã băm SHA-256 của toàn bộ artifact. Trước khi import bất kỳ file runner hay script nào, notebook tự động kiểm tra đối chiếu SHA-256 toàn vẹn 100% bằng thư viện chuẩn, ngăn chặn thực thi mã khi bundle bị giả mạo.
4. **Quản trị Bộ nhớ GPU (Anti-OOM Lifecycle)**:
   - Cache embedding của teacher được lưu trữ trên bộ nhớ RAM hệ thống (CPU) thay vì VRAM.
   - Sau khi hoàn thành huấn luyện từng nhánh (Arm B và Arm C), optimizer, student model và teacher cache được giải phóng lập tức (`del` + `gc.collect()` + `torch.cuda.empty_cache()`).
   - Đánh giá trên tập test được nạp tuần tự từng checkpoint và giải phóng ngay sau khi tính xong, tránh giữ đồng thời nhiều model gây tràn bộ nhớ GPU.

---

## 5. Quy trình Đóng gói Bundle Cục bộ

Chạy lệnh đóng gói bundle v2 từ thư mục gốc của repository (bảo toàn bundle v1 cũ, không ghi đè):

```bash
python3 -I scripts/build_ai1_kaggle_bundle.py \
  --semantic /home/truongdb/Desktop/nexhire/nexhire-BE/semantic.jsonl \
  --silver-dir /home/truongdb/Desktop/nexhire/nexhire-BE/dataset/ai1-silver-experiment-v1 \
  --raw-train /home/truongdb/Desktop/nexhire/nexhire-BE/dataset/ai1-raw-mining-preparation/train_scoring_input.jsonl \
  --model-dir /home/truongdb/Desktop/nexhire/nexhire-BE/kaggle-ranking-v1/models/ranking-retention \
  --output artifacts/ai1-kaggle-silver-v2 \
  --package-zip
```

Kết quả sinh ra tại thư mục:
- Thư mục bundle: `artifacts/ai1-kaggle-silver-v2/`
- Tệp nén zip tải lên Kaggle: `artifacts/ai1-kaggle-silver-v2.zip`

---

## 6. Hướng dẫn Chạy trên Kaggle GPU (Từng bước)

### Bước 1: Tạo Kaggle Private Dataset
1. Truy cập [Kaggle Datasets](https://www.kaggle.com/datasets).
2. Chọn **New Dataset** -> Đặt tên dataset (ví dụ: `ai1-kaggle-silver-v2`).
3. Tải lên tệp `artifacts/ai1-kaggle-silver-v2.zip`.
4. Chọn chế độ **Private** -> Nhấn **Create**.

### Bước 2: Tạo Kaggle Notebook
1. Nhấn **New Notebook** trên Kaggle.
2. Tại thanh công cụ bên phải (Notebook options):
   - **Accelerator**: Chọn **GPU T4 x2** hoặc **GPU P100**.
   - **Internet**: Bật ON (để kiểm tra môi trường ban đầu nếu cần).
3. Thêm Dataset vừa tạo vào Notebook:
   - Chọn mục **Input** -> **Add Input** -> Chọn dataset `ai1-kaggle-silver-v2`.

### Bước 3: Nạp Notebook
1. Trong giao diện Kaggle Notebook, chọn **File** -> **Import Notebook**.
2. Chọn tệp `notebooks/ai1_silver_v1_kaggle.ipynb` từ máy của bạn (hoặc từ thư mục `notebook/` bên trong bundle).
3. Chọn **Run All**.

### Bước 4: Tải Kết quả
Sau khi notebook hoàn tất, kiểm tra mục **Output** trong Kaggle:
- Tệp `ai1_experiment_results.zip` chứa toàn bộ `experiment_results.json` và `test_predictions.jsonl`.
- Nhấn nút tải về (Download) để lưu trữ artifact cục bộ.
