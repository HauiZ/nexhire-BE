# Admin CV Template — AI Canvas Import — Design

**Date:** 2026-08-07
**Route (FE):** `/admin/cv-templates` — modal tạo/sửa preset
**Endpoints (BE):** `POST|GET /api/v1/admin/cv-template-designs`
**Service:** `cv-parsing-service` (module mới `template-design`)
**Provider:** OpenAI only (`/responses` + `json_schema` `strict: true`)
**Repos:** `nexhire-BE` (chính) + `Nexthire-FE` (panel UI)

## Goals

- Admin tải lên một CV mẫu dạng PDF, AI dựng lại thành `CanvasDocument` để lưu làm CV template preset.
- Đồng thời trích `ParsedResume` và nối vào canvas qua trường `binding` mới, để template biết ô text nào ứng với field dữ liệu nào.
- Thay thế việc admin phải gõ tay JSON canvas trong textarea.
- Không rò rỉ PII của người trong PDF vào template công khai.
- Không thay đổi hành vi luồng parse CV ứng viên đang chạy production.

## Non-Goals

- Tái tạo ảnh chân dung (model không sinh được bytes ảnh) — biểu diễn bằng shape làm chỗ đặt.
- Pixel-perfect. Đầu ra là điểm khởi đầu; admin tinh chỉnh trong CV Builder.
- Hỗ trợ nhánh Gemini cho luồng này (xem Decisions).
- Lịch sử job / trang quản lý job.
- Sửa các vấn đề ở mục Known Issues.

## Decisions

| Quyết định | Lý do |
|---|---|
| Bảng riêng `cv_template_design_jobs` thay vì mở rộng `cv_parse_requests` | `candidate_id` là `NOT NULL` ở cả `cv_parse_requests`, `cv_parse_results`, `ai_usage_logs`. Job admin không có candidate. Nới `NOT NULL` trên ba bảng đang chạy production là đánh đổi sai để tiết kiệm ~100 dòng cơ chế job. |
| Bất đồng bộ (job + poll) | Gateway áp timeout 30s riêng cho `cvParsingService`. Dựng layout là lệnh gọi nặng, dễ vượt. Trả 202 sớm rồi poll. |
| Chỉ OpenAI, hardwire | `CanvasElement` là union 4 nhánh. OpenAI `json_schema strict` hỗ trợ `anyOf`; `Schema` của `@google/generative-ai@0.21.0` **không có** `anyOf`/`oneOf`/`additionalProperties`/`minimum` (xác nhận tại `generative-ai.d.ts:1136`) nên chỉ mô tả được object làm phẳng. Tiền lệ hardwire: `ManualCvParsingService` cắm cứng Gemini. |
| Hai lệnh gọi **tuần tự**, không song song | `binding` dùng chỉ số (`experiences[2]`). Hai lệnh gọi độc lập có thể sắp thứ tự khác nhau → binding trỏ nhầm. Job đã bất đồng bộ nên độ trễ không quan trọng. |
| Hai lệnh gọi thay vì một | `OPENAI_MAX_OUTPUT_TOKENS=8192`. Canvas 40 element + ParsedResume trong một response gần chắc chắn bị cắt. Tách ra thì lệnh #1 tái dùng 100% `OPENAI_PARSED_RESUME_SCHEMA` đã có test. |
| Model chỉ trả element tối giản | Không hỏi `id`, `zIndex`, `rotation`, `opacity`, `locked`, `hidden`, `groupId`. Server tự cấp. Giảm từ ~15 xuống ~9 field/element. |
| Loại `ImageElement` khỏi schema | `src` là dataURL, model không sinh được. Ảnh → `shape` màu `#e5e7eb`. |
| `binding` tách `field` + `index` | Dạng `"experiences[0].companyName"` cần enum hàng trăm phần tử. Tách ra thì enum còn 22 giá trị. |
| Tái dùng `ElementView` cho preview | Preview và builder dùng chung renderer nên không thể lệch. `ElementView` chỉ chạm `useCanvasStore` ở nhánh `editing`; render `editing=false` là read-only thuần, và zustand là singleton toàn cục nên không cần Provider. |
| Timeout chỉ có một nguồn sự thật ở BE | FE poll đến khi trạng thái kết thúc hoặc 300s, khớp `TEMPLATE_DESIGN_JOB_TIMEOUT_MS`. FE không tự bịa thông báo timeout. |

## Architecture

### Luồng dữ liệu

```
POST /api/v1/admin/cv-template-designs   (multipart: file=PDF, ≤10MB)
  │ 1. upload PDF → document-storage-service
  │      ownerType='user', ownerId=<admin userId>, documentType='OTHER'
  │      → documentId + presigned URL (TTL 1h)
  │ 2. INSERT cv_template_design_jobs (status=QUEUED)
  │ 3. → 202 { id, status, createdAt }        [fire-and-forget xử lý tiếp]
  │
  ├─ 4. tải PDF bytes từ presigned URL
  │
  ├─ 5. GỌI #1 — trích dữ liệu
  │      POST {OPENAI_BASE_URL}/responses
  │      input_file (PDF base64) + RESUME_PARSE_PROMPT
  │      json_schema strict → OPENAI_PARSED_RESUME_SCHEMA      [tái dùng nguyên xi]
  │      → ParsedResume, chạy qua GeminiResumeNormalizerService
  │
  ├─ 6. GỌI #2 — dựng layout, CÓ ParsedResume làm ngữ cảnh
  │      input_file (cùng PDF) + TEMPLATE_DESIGN_PROMPT + JSON bước 5
  │      json_schema strict → CANVAS_DESIGN_SCHEMA (union 3 nhánh)
  │      max_output_tokens = TEMPLATE_DESIGN_MAX_OUTPUT_TOKENS
  │
  ├─ 7. sanitize + expand (10 luật, thuần, không I/O)
  └─ 8. UPDATE job → SUCCEEDED { canvas, parsedResume, sanitizeReport }
                   | FAILED { errorCode, errorMessage }

GET /api/v1/admin/cv-template-designs/:id     ← FE poll mỗi 2s
  → SUCCEEDED: hiện preview + sanitizeReport
  → Admin bấm "Dùng canvas này" → đổ vào textarea Canvas JSON
  → Admin bấm Save → POST /admin/cv-template-presets     [luồng cũ, không sửa]
```

Lệnh gọi #2 nhận JSON của #1 làm ngữ cảnh còn có lợi phụ: model không phải đọc lại nội dung chữ, chỉ tập trung vào toạ độ và kiểu dáng.

### Module BE

```
apps/cv-parsing-service/src/template-design/
├── template-design.module.ts
├── admin-template-design.controller.ts
├── template-design.service.ts             # điều phối + vòng đời job
├── openai-template-design.client.ts       # 2 lệnh gọi /responses
├── canvas-sanitizer.service.ts            # bước 7 — THUẦN, không I/O
├── prompts/template-design.prompt.ts
├── schemas/canvas-design.schema.ts
├── document-client/document-client.service.ts
├── dto/{create,response}.dto.ts
├── entities/cv-template-design-job.entity.ts
└── test/
```

`canvas-sanitizer.service.ts` không có phụ thuộc và không có I/O — toàn bộ 10 luật test được bằng unit test thuần. Phần lớn giá trị kiểm thử nằm ở đây, nên nó phải tách khỏi client gọi mạng.

`document-client.service.ts` là bản sao khuôn mẫu đã có ở `candidate-service`, `company-service`, `auth-service`.

`GeminiResumeNormalizerService` được **inject** từ `GeminiModule` (chỉ export thêm) — không di chuyển, không đổi tên. Tên có chữ "Gemini" nhưng logic không phụ thuộc provider.

### Frontend

```
src/pages/AdminCvTemplatesPage/
├── index.tsx                    # +~15 dòng: nhúng panel + nhận callback
└── ai-import/
    ├── AiCanvasImportPanel.tsx  # upload, trạng thái, sanitize report, ParsedResume
    ├── CanvasPreview.tsx        # ~40 dòng, tái dùng ElementView
    └── useCanvasDesignJob.ts    # mutation + polling + reset

src/services/admin/adminCvTemplateDesigns.service.ts
src/types/cvTemplateDesign.types.ts
src/hooks/adminQueryKeys.ts                            # + key mới
src/i18n/locales/{en,vi,ja}/pages/adminCvTemplates.ts  # + chuỗi mới
src/i18n/types.ts                                      # + AdminCvTemplatesTranslations
```

`index.tsx` đã 946 dòng; nhét upload + polling + preview vào đó sẽ đẩy lên ~1300. Panel tự quản trạng thái và chỉ giao tiếp với trang mẹ qua **một** callback `onCanvasReady(canvas)` — trang mẹ không cần biết gì về job, polling hay AI.

## Data Contract

### `binding` trên `TextElement`

`Nexthire-FE/src/pages/CvBuilderPage/canvas/canvas.types.ts`:

```ts
export type CvBindingField =
  // Trường đơn (index luôn null)
  | 'profile.fullName'   | 'profile.headline'    | 'profile.contactEmail'
  | 'profile.phone'      | 'profile.location'    | 'profile.summary'
  | 'profile.linkedinUrl'| 'profile.portfolioUrl'
  // Trường trong danh sách (index >= 0)
  | 'experiences.companyName' | 'experiences.position'
  | 'experiences.period'      | 'experiences.description'
  | 'educations.schoolName'   | 'educations.degree'
  | 'educations.fieldOfStudy' | 'educations.period' | 'educations.description'
  | 'skills.name'
  | 'certifications.name'     | 'certifications.issuer'
  | 'projects.name'           | 'projects.description'

export interface CvBinding {
  field: CvBindingField
  index: number | null      // null cho nhóm profile
}

export interface TextElement extends ElementBase {
  type: 'text'
  text: string
  binding?: CvBinding | null   // ← THÊM MỚI, optional
  fontFamily: string
  // ... phần còn lại giữ nguyên
}
```

`optional` nên 3 preset seed hiện có và mọi canvas đã lưu vẫn hợp lệ — **không cần migration dữ liệu**.

`experiences.period` / `educations.period` là trường **dẫn xuất**: CV thật hiển thị `01/2021 – 12/2023` trong một ô, còn `ParsedResume` tách thành 4 số. Một hàm format chung ở FE dựng ra. Thiếu nó thì mọi ô ngày tháng đều không bind được.

Text không bind (tiêu đề mục, nhãn tĩnh) → `binding: null`.

`normalizeCanvas` tại `AdminCvTemplatesPage/index.tsx:151` truyền `elements` qua nguyên vẹn không lọc field, nên `binding` sống sót vòng lưu mà không phải sửa ở đó.

### `CANVAS_DESIGN_SCHEMA`

Theo đúng khuôn `OPENAI_PARSED_RESUME_SCHEMA` đã chạy được trên proxy: chỉ dùng `type`, `properties`, `required`, `additionalProperties: false`, `items`, `enum`, `anyOf`. **Không** dùng `minimum`/`maximum`/`pattern` — strict mode không nhận; mọi ràng buộc số và màu đẩy sang tầng sanitize.

```jsonc
{
  "type": "object", "additionalProperties": false,
  "required": ["pages"],
  "properties": {
    "pages": { "type": "array", "items": {
      "type": "object", "additionalProperties": false,
      "required": ["background", "elements"],
      "properties": {
        "background": { "type": "string" },
        "elements": { "type": "array", "items": { "anyOf": [
          { // TEXT
            "type": "object", "additionalProperties": false,
            "required": ["kind","x","y","width","height","text","fontFamily",
                         "fontSize","fontWeight","italic","underline","color",
                         "align","binding"],
            "properties": {
              "kind":       { "type": "string", "enum": ["text"] },
              "x": {"type":"number"}, "y": {"type":"number"},
              "width": {"type":"number"}, "height": {"type":"number"},
              "text":       { "type": "string" },
              "fontFamily": { "type": "string", "enum": [
                  "Roboto, sans-serif", "Arial, sans-serif",
                  "Montserrat, sans-serif", "Georgia, serif" ] },
              "fontSize":   { "type": "number" },
              "fontWeight": { "type": "number" },
              "italic":     { "type": "boolean" },
              "underline":  { "type": "boolean" },
              "color":      { "type": "string" },
              "align":      { "type": "string", "enum": ["left","center","right"] },
              "binding": { "anyOf": [
                { "type": "null" },
                { "type": "object", "additionalProperties": false,
                  "required": ["field","index"],
                  "properties": {
                    "field": { "type": "string", "enum": [ /* 22 giá trị CvBindingField */ ] },
                    "index": { "type": ["number","null"] } } } ] }
            }
          },
          { // SHAPE
            "type": "object", "additionalProperties": false,
            "required": ["kind","x","y","width","height","shape","fill",
                         "stroke","strokeWidth","borderRadius"],
            "properties": {
              "kind":  { "type": "string", "enum": ["shape"] },
              "shape": { "type": "string", "enum": ["rect","ellipse","line"] },
              "x": {"type":"number"}, "y": {"type":"number"},
              "width": {"type":"number"}, "height": {"type":"number"},
              "fill": {"type":"string"}, "stroke": {"type":"string"},
              "strokeWidth": {"type":"number"}, "borderRadius": {"type":"number"}
            }
          },
          { // ICON
            "type": "object", "additionalProperties": false,
            "required": ["kind","x","y","width","height","name","color"],
            "properties": {
              "kind":  { "type": "string", "enum": ["icon"] },
              "name":  { "type": "string", "enum": [
                  "mail","phone","map-pin","globe","at-sign","share","message",
                  "calendar","user","briefcase","graduation-cap","award","star",
                  "heart","languages","code","send","link","building","check","circle" ] },
              "x": {"type":"number"}, "y": {"type":"number"},
              "width": {"type":"number"}, "height": {"type":"number"},
              "color": {"type":"string"}
            }
          }
        ]}}
      }
    }}
  }
}
```

Enum font sao chép từ `Nexthire-FE/src/pages/CvBuilderPage/canvas/components/PropertiesPanel.tsx:13` (4 giá trị). Enum icon sao chép từ `Nexthire-FE/src/pages/CvBuilderPage/canvas/icons.ts:28` (21 khoá `ICON_REGISTRY`).

**FE và BE không dùng chung package** (`Nexthire-FE` không import `@nexhire/shared`), nên hai enum này nhân đôi. Đặt comment trỏ chéo ở cả hai đầu. Hậu quả tối đa khi lệch: model không được phép dùng icon/font mới — sanitizer loại element đó, không vỡ canvas.

`pageSize` không hỏi model — cố định `794 × 1123` đúng `CANVAS_PAGE_WIDTH`/`CANVAS_PAGE_HEIGHT`.

## Sanitize Rules

Bước 7, thuần tuý xác định, không gọi AI. Nguyên tắc xuyên suốt: **hỏng một element thì bỏ element đó, không đánh hỏng cả job.** Chỉ khi canvas rỗng hoặc không qua `validateCanvas` mới báo `FAILED`.

| # | Luật | Xử lý khi vi phạm |
|---|---|---|
| 1 | `pages ≤ 3`, `elements ≤ 60`/trang | cắt phần thừa |
| 2 | Kẹp `x,y,w,h` vào `[0,794] × [0,1123]` | kẹp; loại nếu `w≤0`, `h≤0`, hoặc nằm trọn ngoài trang |
| 3 | Màu khớp `#RRGGBB`/`#RGB` | mặc định: text `#111827`, fill `#e5e7eb`, stroke `transparent` |
| 4 | `fontSize` ∈ [6, 96] | kẹp |
| 5 | `fontWeight` ∈ {300,400,500,600,700,800} | làm tròn về giá trị gần nhất |
| 6 | `binding.index` nằm trong độ dài mảng tương ứng của `ParsedResume` | đặt `binding = null`, **giữ nguyên `text`** |
| 7 | `binding.index` phải `null` với `profile.*`, phải là số với nhóm danh sách | chuẩn hoá |
| 8 | Cấp `id` = `${key}-${kind}-${n}`, `zIndex` = thứ tự mảng, mặc định `rotation/opacity/locked/hidden` | — |
| 9 | Kết quả phải qua `validateCanvas` mà `cv-template-preset.service.ts:409` đang dùng, và phải còn ≥1 element | job → `FAILED` với `TEMPLATE_DESIGN.CANVAS_INVALID` |
| 10 | **Chốt chặn PII.** Với element có `binding`, so `text` với giá trị thật tương ứng trong `ParsedResume` (chuẩn hoá khoảng trắng, không phân biệt hoa thường). Trùng → thay bằng placeholder ở bảng dưới | đếm vào `sanitizeReport.piiScrubbed` |

Luật 10 bắt đúng chế độ hỏng có xác suất cao nhất: model lười, dán thẳng dữ liệu vừa trích ở lệnh gọi #1. Không bắt được PII ở element *không* bind — nhưng những element đó theo định nghĩa là nhãn tĩnh, và `sanitizeReport` cho admin con số để tự soi.

### Bảng placeholder

Một hằng số `CV_BINDING_PLACEHOLDERS: Record<CvBindingField, string>`, dùng chung giữa prompt (nhúng vào text prompt) và sanitizer (luật 10). Một nguồn sự thật — nếu tách đôi thì luật 10 sẽ thay bằng chuỗi khác với chuỗi prompt yêu cầu, và mọi element bound đều bị đánh dấu `piiScrubbed` oan.

Giá trị là chuỗi literal cố định, **không** sinh ngẫu nhiên — test golden fixture phụ thuộc vào chúng.

| `binding.field` | placeholder |
|---|---|
| `profile.fullName` | `NGUYỄN VĂN A` |
| `profile.headline` | `Lập trình viên Frontend` |
| `profile.contactEmail` | `email@example.com` |
| `profile.phone` | `0900 000 000` |
| `profile.location` | `Hà Nội, Việt Nam` |
| `profile.summary` | `Lập trình viên với 3 năm kinh nghiệm xây dựng ứng dụng web. Thành thạo React và Node.js, quen làm việc trong nhóm Agile và chú trọng chất lượng mã nguồn.` |
| `profile.linkedinUrl` | `linkedin.com/in/nguyenvana` |
| `profile.portfolioUrl` | `nguyenvana.dev` |
| `experiences.companyName` | `Công ty TNHH ABC` |
| `experiences.position` | `Chuyên viên` |
| `experiences.period` | `01/2021 – 12/2023` |
| `experiences.description` | `Phát triển và bảo trì các tính năng chính của sản phẩm. Phối hợp với nhóm thiết kế và kiểm thử để đưa tính năng lên môi trường thật đúng hạn. Tối ưu hiệu năng trang và giảm thời gian tải.` |
| `educations.schoolName` | `Đại học Bách khoa Hà Nội` |
| `educations.degree` | `Cử nhân` |
| `educations.fieldOfStudy` | `Công nghệ thông tin` |
| `educations.period` | `09/2017 – 06/2021` |
| `educations.description` | `Tốt nghiệp loại Giỏi. Đồ án tốt nghiệp về hệ thống phân tán.` |
| `skills.name` | `React` |
| `certifications.name` | `AWS Certified Developer` |
| `certifications.issuer` | `Amazon Web Services` |
| `projects.name` | `Hệ thống quản lý nội bộ` |
| `projects.description` | `Ứng dụng web quản lý quy trình nội bộ cho khoảng 200 người dùng. Đảm nhiệm phần giao diện và tích hợp API. Rút ngắn thời gian xử lý hồ sơ từ hai ngày xuống nửa ngày.` |

## Prompt (lệnh gọi #2)

Điểm khó nhất không phải toạ độ — mà là **giữ hình dáng nhưng thay nội dung**. Template là hàng công khai; chữ trong canvas không được là tên và số điện thoại thật.

Ba luật cốt lõi:

1. Element có `binding` → `text` là **placeholder chung**, không phải dữ liệu thật. Nhưng phải **dài xấp xỉ** nội dung gốc, nếu không hộp text co lại và layout trông vỡ.
2. Element không `binding` → **chép nguyên văn từ PDF**. Đó là tiêu đề mục và nhãn tĩnh (`KINH NGHIỆM LÀM VIỆC`, `Kỹ năng`) — vốn đã chung chung, và chính chúng làm nên bản sắc template.
3. Ảnh chân dung → `shape` (`ellipse` hoặc `rect` bo góc) màu `#e5e7eb`, đúng vị trí và kích thước.

JSON của lệnh gọi #1 đưa vào với vai trò nói rõ: *"đây là nội dung đã trích; đừng chép lại nó vào `text`, hãy dùng nó để biết ô nào ứng với `binding` nào và chỉ số bao nhiêu"*. Không nói rõ thì model rất dễ hiểu là được phép dán dữ liệu thật vào.

## Database

Dùng lại hai enum type Postgres đã tồn tại trong DB này (`cv_parse_request_status_enum`, `cv_parse_provider_enum`) — không tạo type mới.

```sql
CREATE TABLE "cv_template_design_jobs" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_by_user_id"   uuid NOT NULL,
  "document_id"          uuid NOT NULL,
  "source_file_name"     varchar(255) NOT NULL,
  "status"               "cv_parse_request_status_enum" NOT NULL DEFAULT 'QUEUED',
  "provider"             "cv_parse_provider_enum"       NOT NULL DEFAULT 'OPENAI',
  "provider_version"     varchar(80),
  "canvas"               jsonb,
  "parsed_resume"        jsonb,
  "raw_provider_payload" jsonb,
  "sanitize_report"      jsonb,
  "error_code"           varchar(120),
  "error_message"        text,
  "started_at"           timestamptz,
  "finished_at"          timestamptz,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_cv_template_design_jobs_created_by"
  ON "cv_template_design_jobs" ("created_by_user_id");
CREATE INDEX "idx_cv_template_design_jobs_status_created"
  ON "cv_template_design_jobs" ("status", "created_at");
```

Không có `candidate_id` — đó chính là lý do tách bảng.

`provider_version` ghi **model id thực tế** mà `getOpenAiModel()` trả về tại thời điểm chạy (ví dụ `gpt-5.5`), không phải tên provider. Cần thiết vì admin đổi model được trong UI, nên hai job cạnh nhau có thể dùng model khác nhau — không ghi lại thì không truy được vì sao chất lượng đầu ra đổi.

`raw_provider_payload` chỉ ghi khi `CV_PARSE_PERSIST_RAW_PAYLOAD=true`, theo lệ sẵn có.

**Bất biến:** `status = SUCCEEDED` ⟺ `canvas` và `parsed_resume` đều khác `null`. FE dựa vào đó, không cần kiểm tra null khi thấy `SUCCEEDED`. Mọi nhánh lỗi đều phải kết thúc ở `FAILED` kèm `error_code`.

`sanitize_report` là thứ duy nhất cho admin biết AI trả 47 element mà chỉ 44 sống sót. Không có nó, admin nhìn preview thấy thiếu một dòng và không biết là AI đọc sót hay sanitizer đã bỏ.

```jsonc
{ "elementsReturned": 47, "elementsKept": 44,
  "dropped": [{ "reason": "OFF_PAGE", "kind": "text" },
              { "reason": "UNKNOWN_ICON", "kind": "icon" }],
  "clamped": 6, "bindingsResolved": 21, "bindingsCleared": 2, "piiScrubbed": 0 }
```

## API

Controller mới; guard toàn cục của service (`InternalAuthGuard` → `RolesGuard`) đã sẵn.

```ts
@ApiTags('admin-cv-template-designs')
@Controller('admin/cv-template-designs')
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
```

### `POST /api/v1/admin/cv-template-designs`

Multipart, field `file`.

- `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })`, chỉ nhận `application/pdf` — dùng lại đúng hằng số của `ManualCvParsingService`
- Upload lên document-storage-service: `ownerType='user'`, `ownerId=<admin userId>`, `documentType='OTHER'`
- `INSERT` job `QUEUED` → trả **202** `{ id, status, createdAt }` ngay
- Xử lý tiếp fire-and-forget, đúng khuôn `CvParsingService` với `/parse`

Trả 202 sớm là lý do tính năng sống được dưới timeout 30s mà gateway áp riêng cho `cvParsingService`.

### `GET /api/v1/admin/cv-template-designs/:id`

```jsonc
{ "id": "...", "status": "SUCCEEDED",
  "canvas": { "id": "...", "pageSize": {...}, "pages": [...] },
  "parsedResume": { "profile": {...}, ... },
  "sanitizeReport": {...},
  "errorCode": null, "errorMessage": null,
  "createdAt": "...", "finishedAt": "..." }
```

Mọi ADMIN đọc được mọi job, không giới hạn theo người tạo — đây là console nội bộ, thêm ràng buộc chỉ gây phiền khi hai admin cùng làm.

Không có endpoint `GET /` liệt kê lịch sử.

### Gateway

Thêm vào `apps/gateway/src/proxy/proxy.controller.ts`:

```ts
@All('admin/cv-template-designs/*')  → forward('cvParsingService')
@All('admin/cv-template-designs')    → forward('cvParsingService')
```

## Error Handling

Thêm nhóm mới vào `packages/shared/src/constants/error-codes.ts`:

```ts
TEMPLATE_DESIGN: {
  JOB_NOT_FOUND:    'TEMPLATE_DESIGN.JOB_NOT_FOUND',
  OUTPUT_TRUNCATED: 'TEMPLATE_DESIGN.OUTPUT_TRUNCATED',
  CANVAS_INVALID:   'TEMPLATE_DESIGN.CANVAS_INVALID',
},
```

Tái dùng `DOCUMENT.FILE_REQUIRED`, `DOCUMENT.UNSUPPORTED_FILE_TYPE`, `DOCUMENT.FILE_TOO_LARGE`, `AI.SERVICE_UNAVAILABLE`.

### Ba chế độ hỏng cần xử lý riêng

**Job treo khi service restart.** Process chết giữa `PROCESSING` thì hàng đó kẹt mãi. Không dựng cron cho tính năng chạy tay — dùng **lazy reaper ngay trong `GET /:id`**: thấy `PROCESSING` mà `startedAt` cũ hơn `TEMPLATE_DESIGN_JOB_TIMEOUT_MS` thì cập nhật `FAILED`/`AI.SERVICE_UNAVAILABLE` rồi mới trả về. Không tốn hạ tầng, và vì FE luôn poll nên nó tự dọn.

**Output bị cắt cụt.** Chế độ hỏng có thật nhất. `/responses` khi chạm trần trả `status: "incomplete"` với `incomplete_details.reason: "max_output_tokens"`, kèm JSON dở dang. Phải **kiểm tra `status` trước khi `JSON.parse`**, nếu không sẽ nhận exception parse khó hiểu thay vì thông báo đúng bệnh → `TEMPLATE_DESIGN.OUTPUT_TRUNCATED`, thông điệp gợi ý thử CV ít trang hơn.

**Tổng thời gian.** Hai lệnh gọi tuần tự, mỗi lệnh `OPENAI_TIMEOUT_MS=60000` (client OpenAI có truyền `timeout` vào axios đàng hoàng). Xấu nhất 120s, nằm gọn dưới reaper 300s.

## Frontend Detail

### Polling

```ts
useQuery({
  queryKey: adminQueryKeys.cvTemplateDesign(jobId),
  queryFn: () => adminCvTemplateDesigns.get(jobId!),
  enabled: Boolean(jobId),
  refetchInterval: (query) => {
    const s = query.state.data?.status
    return s === 'QUEUED' || s === 'PROCESSING' ? 2000 : false
  },
  gcTime: 0,
})
```

`refetchInterval` trả `false` khi tới trạng thái kết thúc — react-query tự dừng, không cần `useEffect` dọn dẹp thủ công.

### `CanvasPreview`

```tsx
const SCALE = 0.34   // 794 × 0.34 ≈ 270px, vừa cột phải của modal
<div style={{ width: 794*SCALE, height: 1123*SCALE, overflow: 'hidden' }}>
  <div style={{ width: 794, height: 1123, position: 'relative',
                background: page.background,
                transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
    {page.elements.map((el) => (
      <ElementView key={el.id} element={el}
                   selected={false} editing={false}
                   onStartEdit={noop} onStopEdit={noop} />
    ))}
  </div>
</div>
```

Nhiều trang thì hiện thanh chọn trang nhỏ phía dưới.

### Bàn giao kết quả — không ghi đè lặng lẽ

Khi job `SUCCEEDED`, panel **không** tự đổ vào textarea. Nó hiện preview kèm nút *"Dùng canvas này"*. Bấm nút:

- `draft.canvasText` rỗng → đổ thẳng vào.
- Đang có nội dung → **hỏi xác nhận trước**. Admin có thể đã gõ tay hoặc đang sửa preset có sẵn; ghi đè âm thầm là mất việc của họ.

Trang mẹ chỉ làm một dòng:

```ts
setDraft((d) => ({ ...d, canvasText: JSON.stringify(canvas, null, 2) }))
```

Sau đó luồng lưu là luồng cũ y nguyên.

### Panel layout

```
┌─ Tạo canvas bằng AI ────────────────────────────────┐
│  [ Tải lên CV mẫu (PDF, ≤10MB) ]                    │
│                                                      │
│  ⏳ Đang phân tích… (0:24)      ← QUEUED/PROCESSING  │
│                                                      │
│  ─ Khi xong ─────────────────────────────────────── │
│  ┌──────────────┐   Đã giữ 44/47 element             │
│  │              │   Bỏ: 2 ngoài trang, 1 icon lạ     │
│  │   preview    │   Đã nối 21 binding, 2 không khớp  │
│  │   794×1123   │                                     │
│  │   scale .34  │   ▸ Dữ liệu AI đọc được (thu gọn)  │
│  └──────────────┘     Nguyễn Văn A · 3 kinh nghiệm   │
│   ◂ Trang 1/2 ▸       5 học vấn · 18 kỹ năng         │
│                                                      │
│  [ Dùng canvas này ]  [ Thử lại ]                    │
└──────────────────────────────────────────────────────┘
```

Khối `sanitizeReport` và khối `ParsedResume` thu gọn trả lời câu hỏi *"AI có đọc đúng không"* mà preview không trả lời được — preview trông ổn vẫn có thể có binding trỏ sai.

### Hai chỗ dễ vấp

**Upload multipart qua axios client.** Phải để trình duyệt tự đặt `Content-Type` kèm boundary. Nếu axios instance của dự án set cứng `Content-Type: application/json` ở default thì phải ghi đè bằng `undefined` cho riêng lời gọi này, nếu không backend nhận `file undefined`. Kiểm tra khi triển khai.

**`ElementView` cần store tồn tại.** Zustand là singleton toàn cục nên chỉ cần import là chạy; nhưng phải xác nhận `useCanvasStore` không có side effect lúc khởi tạo (đọc `localStorage`, tự nạp template). Nếu có thì bọc `CanvasPreview` bằng renderer tối giản ~60 dòng thay vì tái dùng.

## Testing

Trọng tâm dồn vào `canvas-sanitizer.service.ts` vì nó thuần, không I/O, và chứa gần như toàn bộ logic quyết định chất lượng đầu ra.

| Tầng | File | Nội dung |
|---|---|---|
| Unit — **nặng nhất** | `canvas-sanitizer.service.spec.ts` | 10 luật, mỗi luật một bảng case. Fixture là output AI dị dạng: toạ độ âm, `width: 0`, màu `"blue"`, `fontSize: 400`, icon lạ, `binding.index` vượt mảng, text trùng PII |
| Unit | `openai-template-design.client.spec.ts` | Mock `HttpService`. Body gửi đi có `strict: true`, đúng `max_output_tokens`, đúng model từ `getOpenAiModel()`. `status: "incomplete"` → `OUTPUT_TRUNCATED`. Lỗi axios → `AI.SERVICE_UNAVAILABLE` |
| Unit | `template-design.service.spec.ts` | `QUEUED→PROCESSING→SUCCEEDED`; nhánh lỗi ghi `error_code`; lazy reaper lật `PROCESSING` quá hạn thành `FAILED` |
| Unit | `admin-template-design.controller.spec.ts` | Non-admin → 403; không phải PDF → `UNSUPPORTED_FILE_TYPE`; >10MB → `FILE_TOO_LARGE`; happy path → 202 |
| Unit FE | `useCanvasDesignJob.test.ts` | `refetchInterval` trả `false` khi tới trạng thái kết thúc |
| Thủ công | — | Một PDF thật chạy hết luồng. Không tự động hoá được: tốn tiền và cần API key |

**Golden fixture:** chạy thật một lần với một CV mẫu, lưu response thô của OpenAI vào `test/fixtures/`. Mọi test sanitizer chạy trên fixture đó — độ tin cậy trên dữ liệu thật mà không cần mạng hay tiền. Cũng là thứ phát hiện khi đổi model làm đầu ra đổi hình dạng.

**Thứ tự TDD:** sanitizer → client → service → controller → FE. Sanitizer trước vì nó định nghĩa hợp đồng mà các tầng khác phải tuân theo, và viết test được khi chưa có API key.

## Configuration

Biến `.env` cần thêm cho `nexhire-BE`:

```
OPENAI_API_KEY=<key>
OPENAI_BASE_URL=https://modelapi.vn/v1
DOCUMENT_STORAGE_SERVICE_URL=http://localhost:3009
TEMPLATE_DESIGN_MAX_OUTPUT_TOKENS=16384
TEMPLATE_DESIGN_JOB_TIMEOUT_MS=300000
```

`OPENAI_MAX_OUTPUT_TOKENS=8192` không đủ cho lệnh gọi canvas, nên có biến riêng chỉ áp cho lệnh gọi #2 — không đụng luồng parse CV.

Model lấy động qua `AiManagementService.getOpenAiModel()` (DB `OPENAI_ACTIVE_MODEL` → env `OPENAI_MODEL` → `gpt-5.5`), nên admin vẫn đổi model được trong UI `admin/ai-configs`.

**Lưu ý trạng thái hiện tại:** `.env` đang có `GEMINI_API_KEY` **rỗng** và không có biến `OPENAI_*` nào. Chưa nạp key thì không nhánh nào chạy được.

## Files Touched (existing code)

Cố ý giữ ở mức tối thiểu. Không đụng một dòng nào trong `src/cv-parsing/`, `src/gemini/`, `src/openai/` — luồng parse CV ứng viên giữ nguyên hành vi.

| Repo | File | Thay đổi |
|---|---|---|
| BE | `apps/cv-parsing-service/src/cv-parsing-service.module.ts` | import `TemplateDesignModule` |
| BE | `apps/cv-parsing-service/src/config/cv-parsing-service.config.ts` | 3 biến mới |
| BE | `apps/cv-parsing-service/src/config/env.validation.ts` | 3 biến mới |
| BE | `apps/cv-parsing-service/src/gemini/gemini.module.ts` | export thêm `GeminiResumeNormalizerService` |
| BE | `packages/shared/src/constants/error-codes.ts` | nhóm `TEMPLATE_DESIGN` |
| BE | `apps/gateway/src/proxy/proxy.controller.ts` | 2 route |
| BE | migration mới | 1 file |
| FE | `src/pages/CvBuilderPage/canvas/canvas.types.ts` | `CvBindingField`, `CvBinding`, `TextElement.binding?` |
| FE | `src/pages/AdminCvTemplatesPage/index.tsx` | nhúng panel (~15 dòng) |
| FE | `src/hooks/adminQueryKeys.ts` | key mới |
| FE | `src/i18n/types.ts` + `locales/{en,vi,ja}/pages/adminCvTemplates.ts` | chuỗi mới |

## Known Issues (out of scope)

Phát hiện trong lúc khảo sát, **không** sửa trong lần này.

| # | Vấn đề | Vị trí |
|---|---|---|
| 1 | Nhánh OpenAI của parse CV bỏ qua normalizer — giữ `null` thô, không dedupe skill, không kẹp tháng. Đây là lý do design này gọi normalizer **từ service mới** thay vì sửa client dùng chung | `openai-resume-parser.client.ts:56` |
| 2 | 🔒 `cv-parsing/manual/gemini/parse-file` là `@Public()` **và** được gateway proxy qua `@All('cv-parsing/*')` → upload 10MB + gọi Gemini tốn tiền, không cần đăng nhập. Chỉ chặn bằng `NODE_ENV` | `manual-cv-parsing.controller.ts` |
| 3 | 🔒 `POST /documents/upload` không kiểm tra quyền sở hữu — user bất kỳ đặt `ownerType`/`ownerId` tuỳ ý | `document-storage-service/.../document.service.ts` |
| 4 | 🐛 Upload thumbnail ở chính trang `admin/cv-templates` luôn 422: data URL base64 nhét vào `varchar(1000)` | `AdminCvTemplatesPage/index.tsx:142` |
| 5 | `GEMINI_TIMEOUT_MS` chỉ áp cho tải document, **không** áp cho `generateContent` — lệnh gọi Gemini không có timeout | `gemini.client.ts:66` |
| 6 | Nhánh Gemini bỏ qua `usageMetadata`; `AI_MODEL_PRICING` không có entry GEMINI → token và chi phí luôn `null` | `ai-management.service.ts` |
| 7 | `GEMINI_MODEL=gemini-1.5-flash` lệch default whitelist `gemini-3.5-flash` | `.env` vs `ai-models.constant.ts` |
| 8 | `CandidateClientModule` trong cv-parsing-service là dead code, không module nào import | `cv-parsing-service/src/candidate-client/` |
