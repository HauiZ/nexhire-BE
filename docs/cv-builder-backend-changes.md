# CV Builder (freeform) — Tổng hợp thay đổi Backend

Tài liệu này tổng hợp toàn bộ thay đổi phía backend để hỗ trợ **lưu CV thiết kế tự do (freeform, kiểu Canva)** cho tính năng CV-builder mới.

- **Service:** `candidate-service`
- **Module:** `cv-template`
- **Branch:** `cv-builder`
- **Commit:** `cc8df71` — _feat(cv-template): thêm cột canvas lưu CV freeform_

## 1. Bối cảnh

CV-builder mới ở frontend là trình thiết kế **freeform**: người dùng đặt text/ảnh/hình khối/icon tự do trên trang A4. Dữ liệu là một `CanvasDocument` (danh sách trang, mỗi trang chứa các element có toạ độ/kích thước/kiểu dáng).

Module `cv-template` sẵn có được thiết kế cho model **section-based cũ** (`contentSnapshot`/`layout` theo section keys, `templateKey` = modern/classic/minimal) nên **không khớp** với model freeform.

**Quyết định:** tái sử dụng bảng `candidate_cv_templates` và bộ API `/cv-templates` sẵn có, **thêm 1 cột `canvas` (jsonb)** để chứa nguyên `CanvasDocument`. Không tạo module/bảng mới, không đổi luồng auth.

## 2. Thay đổi cơ sở dữ liệu

Thêm cột `canvas` vào bảng `candidate_cv_templates`:

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|-----|------|-----------|---------|
| `canvas` | `jsonb` | `NOT NULL DEFAULT '{}'` | Toàn bộ tài liệu thiết kế freeform (`CanvasDocument`) |

Các cột cũ (`theme`, `layout`, `content_snapshot`) **giữ nguyên**, không dùng cho CV freeform (để `{}`).

### Migration

`apps/candidate-service/src/migrations/1785400000000-AddCanvasToCandidateCvTemplates.ts`

```sql
-- up
ALTER TABLE "candidate_cv_templates" ADD "canvas" jsonb NOT NULL DEFAULT '{}';
-- down
ALTER TABLE "candidate_cv_templates" DROP COLUMN "canvas";
```

## 3. Danh sách file thay đổi

| File | Thay đổi |
|------|----------|
| `cv-template/entities/cv-template.entity.ts` | Thêm cột `canvas` (`@Column jsonb default '{}'`) |
| `cv-template/dto/cv-template-request.dto.ts` | Thêm `canvas?` vào `CreateCvTemplateDto` và `UpdateCvTemplateDto` |
| `cv-template/dto/cv-template-response.dto.ts` | Thêm field `canvas` vào `CvTemplateResponseDto` |
| `cv-template/cv-template.service.ts` | Persist `canvas` ở `createMine`/`updateMine`, map ra response ở `mapTemplate` |
| `migrations/1785400000000-AddCanvasToCandidateCvTemplates.ts` | Migration mới thêm cột `canvas` |

### Chi tiết

**Entity** — `cv-template.entity.ts`
```ts
// Tài liệu thiết kế freeform (CanvasDocument) của CV-builder kiểu Canva.
@Column({ name: 'canvas', type: 'jsonb', default: () => "'{}'" })
canvas: Record<string, unknown>;
```

**Request DTO** — `cv-template-request.dto.ts` (thêm vào cả Create và Update)
```ts
@ApiPropertyOptional({ type: 'object', description: 'Freeform canvas document (CV builder)' })
@IsOptional()
@IsObject()
canvas?: Record<string, unknown>;
```

**Response DTO** — `cv-template-response.dto.ts`
```ts
@ApiProperty({ type: 'object' })
canvas: Record<string, unknown>;
```

**Service** — `cv-template.service.ts`
```ts
// createMine(): khi tạo bản ghi
canvas: dto.canvas ?? {},

// updateMine(): thêm vào patch
...(dto.canvas !== undefined ? { canvas: dto.canvas } : {}),

// mapTemplate(): trả về response
canvas: template.canvas ?? {},
```

> Lưu ý: `canvas` **không bị validate schema** (khác với `contentSnapshot`/`layout` vốn kiểm tra section keys). Frontend toàn quyền quyết định cấu trúc bên trong `canvas`.

## 4. API (không đổi endpoint)

Tái dùng nguyên các route sẵn có tại `/api/v1/cv-templates` (qua gateway → candidate-service). Tất cả yêu cầu **đăng nhập vai trò CANDIDATE** (JWT giải mã ở gateway, chuyển thành header nội bộ `x-user-id`/`x-user-role`).

| Method | Path | Dùng cho |
|--------|------|----------|
| `GET` | `/cv-templates` | Danh sách CV của tôi ("Đã lưu") |
| `GET` | `/cv-templates/:id` | Lấy 1 CV |
| `POST` | `/cv-templates` | Lưu CV mới |
| `PATCH` | `/cv-templates/:id` | Cập nhật CV (tên/canvas) |
| `DELETE` | `/cv-templates/:id` | Xóa CV (soft delete) |

### Payload lưu CV freeform

**Tạo mới** — `POST /cv-templates`
```jsonc
{
  "templateKey": "modern",   // bắt buộc theo API cũ; giá trị placeholder hợp lệ
  "name": "CV của tôi",
  "canvas": { /* CanvasDocument: pages[], elements[]... */ }
}
```

**Cập nhật** — `PATCH /cv-templates/:id`
```jsonc
{
  "name": "CV của tôi",
  "canvas": { /* CanvasDocument */ }
}
```

`contentSnapshot`/`layout`/`theme` không gửi → giữ mặc định `{}` (create tự sinh snapshot rỗng hợp lệ).

### Hình dạng `canvas` (do frontend định nghĩa)

```jsonc
{
  "id": "doc-...",
  "name": "CV của tôi",
  "pageSize": { "width": 794, "height": 1123 },  // A4 @ 96dpi
  "pages": [
    {
      "id": "page-...",
      "background": "#ffffff",
      "elements": [
        {
          "id": "text-...", "type": "text",
          "x": 80, "y": 80, "width": 280, "height": 48,
          "rotation": 0, "zIndex": 1, "opacity": 1, "locked": false, "hidden": false,
          "text": "Nguyễn Văn A", "fontFamily": "Roboto, sans-serif",
          "fontSize": 32, "fontWeight": 700, "italic": false, "underline": false,
          "color": "#111827", "align": "left", "lineHeight": 1.4, "letterSpacing": 0
        }
        // type: "image" (src = base64 dataURL), "shape", "icon"...
      ]
    }
  ]
}
```

> **Lưu ý dung lượng:** ảnh hiện được nhúng **base64 dataURL** ngay trong `canvas`, nên CV nhiều ảnh/ảnh lớn sẽ làm bản ghi jsonb phình to. Hướng tối ưu về sau: upload ảnh qua document-storage rồi chỉ lưu URL.

## 5. Cách áp dụng & chạy

```bash
# Trong thư mục nexhire-BE

# 1) Chạy migration thêm cột canvas
npm run db:candidate:run

# (kiểm tra) 
npm run db:candidate:show

# 2) Build kiểm tra
npx nest build candidate-service

# 3) Khởi động (cần Postgres + gateway)
npm run start:gateway
npm run start:candidate-service
```

Rollback migration nếu cần: `npm run db:candidate:revert`.

## 6. Kiểm thử

- `npx nest build candidate-service` — build thành công.
- `apps/candidate-service/src/cv-template/test/cv-template.service.spec.ts` — **8/8 test pass** (thêm `canvas` không phá assertion nào; các test dùng field-level / `objectContaining`).
- ESLint các file đã sửa: pass.

## 7. Ảnh hưởng / tương thích

- **Không phá vỡ** dữ liệu cũ: cột `canvas` mặc định `{}`, các bản ghi cũ vẫn hợp lệ.
- **Không đổi** hợp đồng API cũ (chỉ thêm field optional `canvas`).
- Frontend gọi qua service mới `cvTemplate.service.ts` (repo Nexthire-FE, branch `cv-builder`).
