# BE Plan — Lưu mẫu CV builder ở DB và expose cho page Template CV

Ngày: 2026-08-05

## 1. Bối cảnh hiện tại

FE đang có 2 nguồn hard-code khác nhau cho “mẫu CV”:

- `Nexthire-FE/src/pages/CvBuilderPage/canvas/templates.ts`
  - chứa `buildProfessional`, `buildMinimal`, `buildModern`
  - trả về `CanvasPage[]`
  - dùng trong sidebar tab “Mẫu” của CV builder
- `Nexthire-FE/src/pages/_components/cv-templates/TemplateCatalog.ts`
  - chứa metadata catalog cho page `/cv-templates`
  - hiện mới có `professional`

BE hiện đã có `candidate_cv_templates` qua route `/api/v1/cv-templates`, nhưng bảng/route này đang là “CV đã lưu của candidate”, không phải “mẫu CV public/system”.

Vì vậy không nên nhét public template preset vào `candidate_cv_templates`. Nếu dùng chung sẽ bị nhập nhằng:

- `/cv-templates` hiện cần candidate token để list CV đã lưu.
- `/cv-templates` page public cần list mẫu CV cho mọi user.
- Candidate CV saved có `candidateId`; public template preset không có owner candidate.

## 2. Quyết định thiết kế

Tạo domain mới trong `candidate-service`:

```txt
cv-template-presets
```

Route public qua gateway:

```txt
GET /api/v1/cv-template-presets
GET /api/v1/cv-template-presets/:idOrKey
```

Tên bảng mới:

```txt
cv_template_presets
```

Lý do để ở `candidate-service`:

- `candidate-service` đã sở hữu domain CV/CV builder.
- `CanvasDocument` hiện đang được lưu trong `candidate_cv_templates.canvas`.
- Tránh tạo service mới chỉ để quản lý catalog template.

## 3. Scope phase 1

Phase 1 chỉ cần:

- BE lưu template preset trong DB.
- Public API trả danh sách template đã publish.
- FE page `/cv-templates` và builder sidebar có thể đọc từ API.
- Seed 3 template hiện tại: `professional`, `minimal`, `modern`.

Chưa làm ở phase 1:

- Admin UI quản lý template.
- Upload thumbnail bằng admin.
- Version migration phức tạp cho template.
- Tracking lượt dùng template.

## 4. Data model

### 4.1 Entity đề xuất

File mới:

```txt
apps/candidate-service/src/cv-template-preset/entities/cv-template-preset.entity.ts
```

Entity:

```ts
export enum CvTemplatePresetStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum CvTemplatePresetCategory {
  IT = 'it',
  MARKETING = 'marketing',
  SALES = 'sales',
  HR = 'hr',
}

@Entity('cv_template_presets')
@Index('uq_cv_template_presets_key', ['key'], { unique: true })
@Index('idx_cv_template_presets_status_sort', ['status', 'sortOrder'])
export class CvTemplatePreset {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_cv_template_presets_id',
  })
  id: string;

  @Column({ name: 'key', type: 'varchar', length: 80 })
  key: string;

  @Column({ name: 'name_i18n', type: 'jsonb' })
  nameI18n: Record<'vi' | 'en' | 'ja', string>;

  @Column({ name: 'description_i18n', type: 'jsonb' })
  descriptionI18n: Record<'vi' | 'en' | 'ja', string>;

  @Column({
    name: 'categories',
    type: 'enum',
    enum: CvTemplatePresetCategory,
    enumName: 'cv_template_preset_category_enum',
    array: true,
    default: () => "'{}'::cv_template_preset_category_enum[]",
  })
  categories: CvTemplatePresetCategory[];

  @Column({ name: 'accent', type: 'varchar', length: 32, nullable: true })
  accent: string | null;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 1000, nullable: true })
  thumbnailUrl: string | null;

  @Column({ name: 'canvas', type: 'jsonb' })
  canvas: Record<string, unknown>;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CvTemplatePresetStatus,
    enumName: 'cv_template_preset_status_enum',
    default: CvTemplatePresetStatus.DRAFT,
  })
  status: CvTemplatePresetStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
```

### 4.2 Vì sao lưu `canvas` thay vì lưu React/function?

Không lưu `build()` function hoặc React component trong DB. DB chỉ lưu JSON serializable:

```ts
type CanvasDocument = {
  id: string;
  name: string;
  pages: CanvasPage[];
}
```

FE dùng canvas JSON để:

- render preview thumbnail;
- apply template vào builder;
- chỉnh sửa tự do;
- lưu bản CV riêng của candidate vào `candidate_cv_templates`.

## 5. Migration

File migration mới trong:

```txt
apps/candidate-service/src/migrations/
```

Tên đề xuất:

```txt
CreateCvTemplatePresets1720000000000.ts
```

Migration cần làm:

1. `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`
2. Tạo enum:
   - `cv_template_preset_status_enum`
   - `cv_template_preset_category_enum`
3. Tạo bảng `cv_template_presets`.
4. Tạo index:
   - unique `key`
   - lookup `status + sort_order`
5. Seed 3 template ban đầu trong cùng migration hoặc seed script riêng.

Khuyến nghị:

- Schema tạo bằng migration.
- Data seed bằng seed script riêng để dễ update canvas JSON không cần migration schema mới.

## 6. Seed data

File mới đề xuất:

```txt
apps/candidate-service/src/cv-template-preset/seeds/cv-template-presets.seed.ts
```

Hoặc nếu project seed runner hiện chưa hỗ trợ candidate-service thì tạo script:

```txt
apps/candidate-service/src/seeds/cv-template-presets.seed.ts
```

Seed keys:

| key | sortOrder | categories | accent |
| --- | ---: | --- | --- |
| `professional` | 10 | `it`, `marketing`, `sales`, `hr` | `#2563eb` |
| `minimal` | 20 | `it`, `marketing`, `sales`, `hr` | `#111827` |
| `modern` | 30 | `it`, `marketing`, `sales`, `hr` | `#1f2937` |

Seed behavior:

- Upsert theo `key`.
- Nếu record đang `ARCHIVED`, không tự publish lại trừ khi flag seed yêu cầu.
- Nếu canvas JSON thay đổi, tăng `version`.
- Không ghi đè `sortOrder/status` nếu sau này admin đã chỉnh, trừ phase 1 chưa có admin.

Ví dụ response data sau seed:

```json
{
  "key": "professional",
  "nameI18n": {
    "vi": "Chuyên nghiệp",
    "en": "Professional",
    "ja": "プロフェッショナル"
  },
  "descriptionI18n": {
    "vi": "Header màu nổi bật, bố cục 1 cột rõ ràng.",
    "en": "A polished one-column layout with a strong header.",
    "ja": "印象的なヘッダーを備えた明快な1カラム構成です。"
  },
  "status": "PUBLISHED"
}
```

## 7. Module/controller/service

Tạo module mới trong candidate-service:

```txt
apps/candidate-service/src/cv-template-preset/
  cv-template-preset.module.ts
  cv-template-preset.controller.ts
  cv-template-preset.service.ts
  dto/
    cv-template-preset-query.dto.ts
    cv-template-preset-response.dto.ts
  entities/
    cv-template-preset.entity.ts
  test/
    cv-template-preset.service.spec.ts
```

Register module trong:

```txt
apps/candidate-service/src/candidate-service.module.ts
```

## 8. Public API contract

Base URL qua gateway:

```txt
/api/v1
```

### 8.1 List template presets

```http
GET /api/v1/cv-template-presets
```

Auth:

- Public.
- Không cần candidate token.

Query:

| Field | Required | Note |
| --- | --- | --- |
| `category` | No | `all`, `it`, `marketing`, `sales`, `hr`; default `all` |
| `includeCanvas` | No | `true/false`; default `true` phase 1 để FE render preview/apply được |

Behavior:

- Chỉ trả `status=PUBLISHED`.
- Exclude soft-deleted records.
- Sort theo `sortOrder ASC`, sau đó `createdAt ASC`.

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "0bafc70d-8a1e-4e56-83f6-cc0d16bbf895",
      "key": "professional",
      "name": {
        "vi": "Chuyên nghiệp",
        "en": "Professional",
        "ja": "プロフェッショナル"
      },
      "description": {
        "vi": "Header màu nổi bật, bố cục 1 cột rõ ràng.",
        "en": "A polished one-column layout with a strong header.",
        "ja": "印象的なヘッダーを備えた明快な1カラム構成です。"
      },
      "categories": ["it", "marketing", "sales", "hr"],
      "accent": "#2563eb",
      "thumbnailUrl": null,
      "canvas": {
        "id": "template-professional",
        "name": "Professional",
        "pages": []
      },
      "version": 1,
      "createdAt": "2026-08-05T00:00:00.000Z",
      "updatedAt": "2026-08-05T00:00:00.000Z"
    }
  ]
}
```

Errors:

| Status | Code | Meaning |
| ---: | --- | --- |
| 400 | `COMMON.VALIDATION_FAILED` | Query không hợp lệ |
| 500 | `COMMON.INTERNAL_ERROR` | Lỗi hệ thống |

### 8.2 Detail template preset

```http
GET /api/v1/cv-template-presets/:idOrKey
```

Auth:

- Public.

Params:

| Field | Required | Note |
| --- | --- | --- |
| `idOrKey` | Yes | UUID hoặc `key` như `professional` |

Behavior:

- Chỉ trả record `PUBLISHED` và chưa deleted.
- FE có thể gọi bằng `key` cho route `/cv-builder/:templateId`.

Response payload:

```json
{
  "success": true,
  "data": {
    "id": "0bafc70d-8a1e-4e56-83f6-cc0d16bbf895",
    "key": "professional",
    "name": {
      "vi": "Chuyên nghiệp",
      "en": "Professional",
      "ja": "プロフェッショナル"
    },
    "description": {
      "vi": "Header màu nổi bật, bố cục 1 cột rõ ràng.",
      "en": "A polished one-column layout with a strong header.",
      "ja": "印象的なヘッダーを備えた明快な1カラム構成です。"
    },
    "categories": ["it", "marketing", "sales", "hr"],
    "accent": "#2563eb",
    "thumbnailUrl": null,
    "canvas": {
      "id": "template-professional",
      "name": "Professional",
      "pages": []
    },
    "version": 1,
    "createdAt": "2026-08-05T00:00:00.000Z",
    "updatedAt": "2026-08-05T00:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
| ---: | --- | --- |
| 404 | `CV_TEMPLATE_PRESET.NOT_FOUND` | Không tìm thấy template published |
| 500 | `COMMON.INTERNAL_ERROR` | Lỗi hệ thống |

## 9. Admin API phase 2

Chưa cần cho phase 1, nhưng nên reserve route:

```http
GET /api/v1/admin/cv-template-presets
POST /api/v1/admin/cv-template-presets
PATCH /api/v1/admin/cv-template-presets/:id
DELETE /api/v1/admin/cv-template-presets/:id
```

Auth:

- Required.
- Role: `ADMIN`.

Gateway cần proxy:

```ts
@All('admin/cv-template-presets/*')
@All('admin/cv-template-presets')
```

Các field admin có thể chỉnh:

- name i18n
- description i18n
- categories
- accent
- thumbnailUrl hoặc thumbnail document
- canvas
- status
- sortOrder

## 10. Gateway changes

File:

```txt
apps/gateway/src/proxy/proxy.controller.ts
```

Thêm proxy route:

```ts
@All('cv-template-presets/*')
cvTemplatePresets(@Req() req: Request, @Res() res: Response) {
  return this.proxy.forward('candidateService', req, res);
}

@All('cv-template-presets')
cvTemplatePresetsRoot(@Req() req: Request, @Res() res: Response) {
  return this.proxy.forward('candidateService', req, res);
}
```

Không đổi route `/cv-templates` hiện tại vì route đó đang phục vụ “CV đã lưu của candidate”.

## 11. Error codes

Thêm error code service-private hoặc shared nếu project muốn chuẩn hóa:

```txt
CV_TEMPLATE_PRESET.NOT_FOUND
CV_TEMPLATE_PRESET.KEY_CONFLICT
CV_TEMPLATE_PRESET.INVALID_CANVAS
```

Phase 1 public read có thể chỉ cần:

- `CV_TEMPLATE_PRESET.NOT_FOUND`
- `COMMON.VALIDATION_FAILED`
- `COMMON.INTERNAL_ERROR`

## 12. Validation

DTO query:

```ts
export class ListCvTemplatePresetsQueryDto {
  @IsOptional()
  @IsEnum(CvTemplatePresetCategoryOrAll)
  category?: 'all' | CvTemplatePresetCategory;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  includeCanvas?: boolean;
}
```

Canvas validation phase 1:

- `canvas` phải là object.
- `canvas.pages` phải là array.
- Mỗi page có `id`, `width/height` hoặc theo shape `CanvasPage` hiện FE dùng.
- Không validate quá sâu mọi element trong phase 1 để tránh khóa FE khi builder còn thay đổi.

Admin phase 2 mới nên validate sâu hơn.

## 13. API docs cần update

Cập nhật:

```txt
api-docs/candidate-service.md
```

Thêm base path:

```txt
/api/v1/cv-template-presets
```

Thêm 2 endpoint public:

- `GET /cv-template-presets`
- `GET /cv-template-presets/:idOrKey`

Nếu làm admin phase 2 thì thêm admin docs sau.

## 14. Test plan BE

Unit tests:

- `CvTemplatePresetService.listPublished`
  - chỉ trả `PUBLISHED`
  - không trả `DRAFT/ARCHIVED`
  - filter category đúng
  - sort theo `sortOrder`
- `CvTemplatePresetService.getPublishedByIdOrKey`
  - tìm bằng UUID
  - tìm bằng key
  - 404 nếu archived/deleted/not found

Controller tests nếu project đang có pattern:

- public endpoint không cần candidate token
- query invalid trả 400

Migration/seed check:

```bash
npm run db:candidate:run
npm run db:migration:lint -- candidate-service
npm run db:candidate:generate -- CheckNoChanges
```

Manual API check:

```bash
curl http://localhost:<gateway-port>/api/v1/cv-template-presets
curl http://localhost:<gateway-port>/api/v1/cv-template-presets/professional
```

## 15. FE có thể triển khai trước không?

Có thể triển khai FE trước, miễn là chốt contract ở trên.

FE nên làm theo hướng:

1. Tạo service mới:

```txt
Nexthire-FE/src/services/cvTemplatePreset.service.ts
```

2. Dùng response type khớp BE:

```ts
type CvTemplatePresetResponse = {
  id: string;
  key: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  categories: CvTemplateCategory[];
  accent: string | null;
  thumbnailUrl: string | null;
  canvas: CanvasDocument;
  version: number;
  createdAt: string;
  updatedAt: string;
};
```

3. Trong khi BE chưa có endpoint:
   - giữ adapter fallback từ `canvas/templates.ts`;
   - nhưng UI page `/cv-templates` và `TemplatesPanel` đọc qua một hook chung, ví dụ `useCvTemplatePresets`;
   - khi API sẵn chỉ thay implementation của service/hook, không rewrite UI.

4. Không dùng lại `cvTemplateService` vì service đó đang là “CV đã lưu của candidate”.

## 16. FE integration sau khi BE sẵn

Các thay đổi FE cuối cùng:

- `/cv-templates`
  - bỏ `CV_TEMPLATE_CATALOG`
  - fetch `cvTemplatePresetService.list()`
  - render card từ DB
  - nếu `thumbnailUrl` null thì render preview từ `canvas.pages[0]`
- `CvBuilderPage/canvas/components/TemplatesPanel.tsx`
  - bỏ `CV_TEMPLATES`
  - fetch preset list
  - apply bằng `preset.canvas.pages`
- `CvBuilderPage`
  - đọc `useParams().templateId`
  - gọi `cvTemplatePresetService.get(templateId)`
  - apply template một lần khi vào `/cv-builder/:templateId`

## 17. Rủi ro cần tránh

- Không overload `/cv-templates` public list vì đang conflict với candidate saved CV templates.
- Không lưu React component/function vào DB.
- Không bắt FE phải có thumbnail ngay; canvas preview đủ cho phase 1.
- Không xóa hard-code FE ngay nếu BE chưa deploy; giữ fallback đến khi endpoint ổn.
- Không đổi `candidate_cv_templates` schema cho public template preset nếu không cần.

## 18. Thứ tự triển khai khuyến nghị

1. BE tạo entity/migration `cv_template_presets`.
2. BE tạo service/controller public read.
3. BE thêm gateway proxy `/cv-template-presets`.
4. BE seed 3 template hiện tại.
5. BE update `api-docs/candidate-service.md`.
6. FE tạo service/hook đọc template preset, có fallback hard-code.
7. FE thay `/cv-templates` sang data API/fallback.
8. FE thay builder sidebar `TemplatesPanel` sang data API/fallback.
9. FE support `/cv-builder/:templateId` apply template từ API/fallback.
10. Sau khi BE deploy ổn, remove hard-code catalog cũ hoặc giữ làm fallback dev-only.
