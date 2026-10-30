# Quy trình Đánh giá Độc lập Checkpoints AI1 Đã Huấn luyện trên Kaggle (Evaluation-Only)

Tài liệu này cung cấp cell code tự chứa (self-contained) chạy trực tiếp trên Kaggle Notebook để thực hiện đánh giá độc lập (post-hoc diagnostics) trên các checkpoints đã lưu từ lượt chạy trước mà **tuyệt đối KHÔNG huấn luyện lại (no retraining)**.

## Mục đích & Giới hạn
1. **Chỉ đánh giá (Evaluation-Only)**: Sử dụng trực tiếp checkpoint đã lưu và bundle ban đầu (`BUNDLE_DIR`), không gọi `optimizer.step()`, không gradient, không cập nhật trọng số.
2. **Khôi phục phiên an toàn (Session Recovery)**:
   - Cho phép tái sử dụng `/kaggle/working/experiment_outputs` nếu cùng session.
   - Hỗ trợ cấu hình `EXPERIMENT_ROOT` hoặc đính kèm kết quả huấn luyện cũ dạng file ZIP (Private Dataset trên Kaggle).
   - Tự động giải nén ZIP vào thư mục sạch, kiểm tra nghiêm ngặt chống path traversal, backslash, symlinks, file thực thi độc hại.
3. **Không tái tuyển chọn (No re-selection)**: Toàn bộ kết quả phân tích tập test là chẩn đoán hậu nghiệm (post-hoc diagnostics), không dùng để thay đổi checkpoint đã chọn trên tập validation.
4. **Độ phân giải danh tính duy nhất (Unique Identity)**: Nhận diện từng evidence qua `candidate_id::evidence_id::record_id`, xử lý triệt để 10 trường hợp trùng lặp `candidate_id` trong cùng query.
5. **Kiểm tra Checkpoint nghiêm ngặt**:
   - Đối chiếu chéo `selected_step` của Arm B/C với `val_history` và cấu trúc thư mục `checkpoints/{Arm}/step_{N}`.
   - Từ chối mọi checkpoint giả mạo, baseline step 0 mạo danh checkpoint dương, hoặc đường dẫn nằm ngoài experiment root.
   - Bắt buộc `use_safetensors=True`, không fallback unpickling tuỳ tiện.
6. **Đánh giá đa chiều**:
   - Micro & Macro Job MRR, Hit@1/3, Recall@1/3 trên:
     - Tất cả queries có positive
     - Mixed-label only (queries có cả positive và negative)
     - Positive-only (queries chỉ có positive)
     - Thống kê no-positive queries
   - Pairwise ordering positive vs negative và đếm chính xác số lượng điểm ties
   - Paired JD bootstrap C - A và C - B (1,000 resamples, seed 42)
   - Lưu trữ đầy đủ checksum SHA-256 của từng file model, dữ liệu và script để bảo toàn xuất xứ (provenance)

---

## Hướng dẫn Workflow trên Kaggle

Bạn có thể mở trực tiếp notebook `notebooks/ai1_saved_checkpoints_eval.ipynb` trên Kaggle, hoặc sao chép các cells dưới đây vào một notebook mới:

### Cell 1: Thiết lập Môi trường & Khôi phục Session An toàn

```python
import os, sys, json, math, shutil, hashlib, platform, subprocess, zipfile
from pathlib import Path

WORKING_DIR = Path('/kaggle/working').resolve() if Path('/kaggle/working').exists() else Path('./run_working').resolve()
WORKING_DIR.mkdir(parents=True, exist_ok=True)

# 1. Phát hiện Bundle Root chứa manifest.json
def discover_bundle_root():
    env_root = os.environ.get('BUNDLE_ROOT')
    if env_root and Path(env_root).exists() and (Path(env_root) / 'manifest.json').exists():
        return Path(env_root).resolve()
    kaggle_input = Path('/kaggle/input')
    if kaggle_input.exists():
        candidates = [p for p in kaggle_input.rglob('manifest.json') if p.is_file()]
        if len(candidates) == 1:
            return candidates[0].parent.resolve()
        elif len(candidates) > 1:
            raise ValueError(f'Multiple manifests in /kaggle/input: {candidates}')
    for candidate_name in ['ai1-kaggle-silver-v2', 'ai1-kaggle-silver-v1']:
        local_cand = Path(f'./artifacts/{candidate_name}').resolve()
        if local_cand.exists() and (local_cand / 'manifest.json').exists():
            return local_cand
    raise FileNotFoundError('Valid bundle root containing manifest.json not found. Set BUNDLE_ROOT.')

BUNDLE_DIR = discover_bundle_root()
print(f'Bundle root: {BUNDLE_DIR}')

# 2. Khôi phục Experiment Root (từ /kaggle/working hoặc từ attached Private Dataset ZIP)
def resolve_experiment_root():
    env_exp = os.environ.get('EXPERIMENT_ROOT')
    if env_exp:
        p = Path(env_exp).resolve()
        if p.exists() and (p / 'experiment_results.json').exists():
            return p, None
        elif p.is_file() and zipfile.is_zipfile(p):
            return None, p

    default_exp = WORKING_DIR / 'experiment_outputs'
    if default_exp.exists() and (default_exp / 'experiment_results.json').exists():
        return default_exp, None

    search_roots = [Path('/kaggle/input'), WORKING_DIR]
    candidate_zips = []
    for s_root in search_roots:
        if s_root.exists():
            for z in s_root.rglob('*.zip'):
                if any(k in z.name.lower() for k in ['ai1', 'results', 'experiment']):
                    candidate_zips.append(z)

    for z in candidate_zips:
        try:
            with zipfile.ZipFile(z, 'r') as zf:
                if 'experiment_results.json' in zf.namelist():
                    return None, z.resolve()
        except Exception:
            continue

    raise FileNotFoundError('Could not locate experiment outputs directory or results archive. Set EXPERIMENT_ROOT.')

EXP_DIR, EXP_ZIP = resolve_experiment_root()
print(f'Experiment Directory: {EXP_DIR}')
print(f'Experiment ZIP: {EXP_ZIP}')
```

---

### Cell 2: Tự động ghi mã nguồn Runner Tin cậy vào Thư mục Code Riêng biệt

Notebook tự chứa chứa sẵn mã nguồn `evaluate_ai1_saved_checkpoints.py` và ghi trực tiếp vào `/kaggle/working/runner/evaluate_ai1_saved_checkpoints.py` mà không phụ thuộc vào repo local hay download script từ Internet:

```python
RUNNER_DIR = WORKING_DIR / 'runner'
RUNNER_DIR.mkdir(parents=True, exist_ok=True)
EVAL_SCRIPT_PATH = RUNNER_DIR / 'evaluate_ai1_saved_checkpoints.py'

# Sao chép từ repo nếu có, hoặc notebook tự ghi mã nguồn đã nhúng sẵn
if Path('./scripts/evaluate_ai1_saved_checkpoints.py').exists():
    shutil.copy2('./scripts/evaluate_ai1_saved_checkpoints.py', EVAL_SCRIPT_PATH)
    print(f'Đã sao chép runner từ repo local vào {EVAL_SCRIPT_PATH}')
else:
    print(f'Runner đã được nhúng sẵn trong notebook và ghi ra {EVAL_SCRIPT_PATH}')

h = hashlib.sha256(EVAL_SCRIPT_PATH.read_bytes()).hexdigest()
print(f'Runner SHA-256: {h}')
```

---

### Cell 3: Thực thi Đánh giá Độc lập

```python
import time
EVAL_OUTPUT_DIR = WORKING_DIR / f'eval_only_diagnostics_{int(time.time())}'
EVAL_OUTPUT_DIR.mkdir(parents=True, exist_ok=False)

device_str = 'cpu'
try:
    import torch
    if torch.cuda.is_available():
        device_str = 'cuda'
except ImportError:
    pass

exp_arg = str(EXP_DIR) if EXP_DIR else str(EXP_ZIP)

cmd = [
    sys.executable, '-I', str(EVAL_SCRIPT_PATH),
    '--bundle', str(BUNDLE_DIR),
    '--experiment', exp_arg,
    '--output', str(EVAL_OUTPUT_DIR),
    '--device', device_str,
    '--split', 'test'
]

print('Đang thực thi đánh giá evaluation-only:')
print(' '.join(cmd))
subprocess.check_call(cmd)
print('\nHoàn tất đánh giá thành công!')
```

---

### Cell 4: Xem Báo cáo Chẩn đoán Chi tiết & Tải về ZIP

```python
with open(EVAL_OUTPUT_DIR / 'eval_diagnostic_results.json', 'r', encoding='utf-8') as f:
    diag_res = json.load(f)

print('=' * 80)
print('DIAGNOSTIC TEST EVALUATION REPORT (POST-HOC DIAGNOSTICS ONLY)')
print('=' * 80)

def fmt(v, spec='.4f'):
    if v is None: return 'N/A'
    try: return format(v, spec)
    except Exception: return str(v)

eval_m = diag_res['evaluation_metrics']
for partition, p_title in [('all_positive', 'ALL POSITIVE QUERIES'), ('mixed_only', 'MIXED-LABEL ONLY QUERIES')]:
    print(f'\n--- {p_title} ---')
    print(f'{"Arm":8} | {"MRR (Micro)":12} | {"MRR (Macro)":12} | {"Hit@1 (Macro)":14} | {"Hit@3 (Macro)":14} | {"Recall@3 (Macro)":16}')
    print('-' * 86)
    for arm in ['Arm_A', 'Arm_B', 'Arm_C']:
        sub = eval_m[arm][partition]
        print(f'{arm:8} | {fmt(sub["micro"]["mrr"]):12} | {fmt(sub["macro_job"]["mrr"]):12} | {fmt(sub["macro_job"]["hit1"]):14} | {fmt(sub["macro_job"]["hit3"]):14} | {fmt(sub["macro_job"]["recall3"]):16}')

boots = diag_res['bootstrap_comparisons']
print('\n--- PAIRED JOB BOOTSTRAP 95% CI (Job-Macro MRR Delta) ---')
b_ca = boots['delta_c_minus_a']
b_cb = boots['delta_c_minus_b']
print(f'Delta (C - A): {fmt(b_ca["mean_delta"], "+.4f")} (95% CI: [{fmt(b_ca["ci_95_low"], "+.4f")}, {fmt(b_ca["ci_95_high"], "+.4f")}])')
print(f'Delta (C - B): {fmt(b_cb["mean_delta"], "+.4f")} (95% CI: [{fmt(b_cb["ci_95_low"], "+.4f")}, {fmt(b_cb["ci_95_high"], "+.4f")}])')

# Đóng gói ZIP tải về
zip_out = WORKING_DIR / 'ai1_eval_only_diagnostics.zip'
with zipfile.ZipFile(zip_out, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for p in EVAL_OUTPUT_DIR.rglob('*'):
        if p.is_file():
            zf.write(p, arcname=str(p.relative_to(EVAL_OUTPUT_DIR)))
print(f'\nĐã đóng gói kết quả: {zip_out} ({zip_out.stat().st_size} bytes)')
```
