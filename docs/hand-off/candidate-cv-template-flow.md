# Candidate CV And Template Flow

Base URL qua gateway:

```txt
/api/v1
```

Auth:

- Tat ca endpoint trong file nay can candidate token.
- FE gui `Authorization: Bearer <candidate_access_token>`.

## 1. CV Library Upload

Endpoint:

```http
POST /api/v1/cvs/upload
Content-Type: multipart/form-data
```

Form fields:

| Field | Required | Note |
| --- | --- | --- |
| `file` | Yes | PDF/DOC/DOCX, max 10 MB |
| `title` | No | Ten CV trong kho |
| `isDefault` | No | Set CV mac dinh |
| `parse` | No | Default `false`; `true` thi parse va apply vao profile |

Behavior:

- `parse=false`: chi luu file vao `candidate_cvs`, profile khong doi.
- `parse=true`: upload xong tao parse request `PROFILE_UPDATE`; parse thanh cong se apply vao profile tong hop.
- Candidate profile tables khong gan truc tiep voi tung CV file.

Response shape:

```json
{
  "success": true,
  "data": {
    "id": "candidate-cv-id",
    "documentId": "document-id",
    "title": "Backend CV",
    "isDefault": true,
    "parseStatus": "NOT_PARSED",
    "source": "UPLOADED",
    "sourceTemplateId": null,
    "sourceCvId": null,
    "parsedAt": null,
    "createdAt": "2026-07-22T10:00:00.000Z",
    "updatedAt": "2026-07-22T10:00:00.000Z"
  }
}
```

## 2. Parse Saved CV Into Profile

Endpoint:

```http
POST /api/v1/cvs/:id/parse
```

Behavior:

- CV phai thuoc candidate hien tai.
- `PARSING` hoac `PARSED` se bi chan conflict.
- Parse thanh cong se replace phan data `source=CV_PARSE` trong profile.
- Data `source=MANUAL` duoc giu lai.

## 3. Template Options

Endpoint:

```http
GET /api/v1/cv-templates/options
```

Use for:

- Hien thi danh sach template renderer.
- Biet section key hop le.

Supported `templateKey`:

- `modern`
- `classic`
- `minimal`

Supported section keys:

- `profile`
- `summary`
- `skills`
- `experiences`
- `educations`
- `projects`
- `certifications`
- `languages`
- `awards`
- `references`

List sections co the sort item:

- `skills`
- `experiences`
- `educations`
- `projects`
- `certifications`
- `languages`
- `awards`
- `references`

## 4. Create Template From Uploaded CV

Endpoint:

```http
POST /api/v1/cv-templates/from-cv
Content-Type: multipart/form-data
```

Form fields:

| Field | Required | Note |
| --- | --- | --- |
| `file` | Yes | PDF/DOC/DOCX, max 10 MB |
| `templateKey` | Yes | `modern`, `classic`, `minimal` |
| `name` | No | Ten template |

Behavior:

- Upload source CV de Gemini parse va fill template.
- Khong tao `candidate_cvs` cho source file.
- Khong apply vao candidate profile.
- Avatar trong flow nay mac dinh rong: `avatarDocumentId=null`, `avatarUrl=null`.
- Parse xong BE luu `contentSnapshot`/`layout` vao `candidate_cv_templates`.
- Source document duoc cleanup ngay sau khi parse thanh cong.
- Neu cleanup thanh cong, response co `sourceDocumentId=null` va `sourceDocumentDeletedAt` co gia tri.
- Neu cleanup fail, BE chi log warning va giu `sourceDocumentId` de retry/audit, khong luu error message vao DB.

Response highlights:

```json
{
  "success": true,
  "data": {
    "id": "template-id",
    "templateKey": "modern",
    "sourceDocumentId": null,
    "sourceDocumentDeletedAt": "2026-07-22T10:00:05.000Z",
    "sourceParseRequestId": "parse-request-id",
    "layout": {
      "sections": [
        { "key": "profile", "visible": true, "sortOrder": 1 },
        { "key": "skills", "visible": true, "sortOrder": 2 }
      ]
    },
    "contentSnapshot": {
      "profile": {
        "id": "profile",
        "fullName": "Nguyen Minh Khoa",
        "avatarDocumentId": null,
        "avatarUrl": null,
        "visible": true
      },
      "skills": []
    }
  }
}
```

## 5. Create Template Manually

Endpoint:

```http
POST /api/v1/cv-templates
```

Request:

```json
{
  "templateKey": "modern",
  "name": "Backend CV",
  "source": "DEFAULT",
  "theme": {},
  "layout": {
    "sections": [
      { "key": "profile", "visible": true, "sortOrder": 1 }
    ]
  },
  "contentSnapshot": {
    "profile": {
      "id": "profile",
      "fullName": "Nguyen Minh Khoa",
      "avatarDocumentId": null,
      "avatarUrl": null,
      "visible": true
    }
  }
}
```

Fields:

| Field | Required | Note |
| --- | --- | --- |
| `templateKey` | Yes | `modern`, `classic`, `minimal` |
| `name` | No | Ten template |
| `source` | No | `EMPTY` hoac `DEFAULT`; default `EMPTY` |
| `theme` | No | Initial theme |
| `layout` | No | Initial layout |
| `contentSnapshot` | No | Initial content |

Behavior:

- `EMPTY`: tao template trong de user nhap tay.
- `DEFAULT`: fill tu candidate profile hien tai, bao gom avatar profile neu co.
- Neu FE gui `contentSnapshot/layout/theme`, BE luu ngay. Dung cho autosave khi user vua nhap field dau tien de tranh mat data neu F5.
- `avatarUrl` khong persist DB, BE resolve runtime tu `avatarDocumentId`.

## 6. Load And Save Template

List:

```http
GET /api/v1/cv-templates
```

Detail:

```http
GET /api/v1/cv-templates/:id
```

Save editor changes:

```http
PATCH /api/v1/cv-templates/:id
```

Request can include:

```json
{
  "name": "Backend CV July",
  "templateKey": "modern",
  "theme": {},
  "layout": {},
  "contentSnapshot": {},
  "isDefault": false
}
```

Validation:

- Section key phai thuoc enum.
- Section co the thieu.
- Unknown section key bi reject.
- Section trung bi reject.

## 7. Drag Sort Sections

Endpoint:

```http
PATCH /api/v1/cv-templates/:id/sections/sort-order
```

Request:

```json
{
  "sectionKeys": ["profile", "skills", "projects", "experiences"]
}
```

Behavior:

- BE update `sortOrder` theo thu tu list FE gui.
- Section hien co nhung khong nam trong list se duoc giu sau cac key da gui.
- Unknown/duplicate key bi reject.

## 8. Drag Sort Items In Section

Endpoint:

```http
PATCH /api/v1/cv-templates/:id/sections/:sectionKey/items/sort-order
```

Request:

```json
{
  "itemIds": ["project-3", "project-1", "project-2"]
}
```

Rules:

- Chi ap dung cho list sections.
- `itemIds` phai gom du moi item hien co trong section dung 1 lan.
- Thieu/trung/id la bi reject.
- `profile` va `summary` khong support sort item.

## 9. Template Avatar

Endpoint:

```http
PATCH /api/v1/cv-templates/:id/avatar
Content-Type: multipart/form-data
```

Form fields:

| Field | Required | Note |
| --- | --- | --- |
| `file` | Yes | JPEG/PNG/WEBP, max 5 MB |

Behavior:

- Avatar nay chi thuoc CV template, khong update candidate profile avatar.
- DB chi luu `contentSnapshot.profile.avatarDocumentId`.
- BE resolve `contentSnapshot.profile.avatarUrl` runtime khi response.
- Khi upload avatar moi, BE best-effort delete avatar cu.
- Neu delete avatar cu fail, BE chi log warning, khong tra loi cho client, khong rollback avatar moi.

## 10. Export Template Into CV Library

Endpoint:

```http
POST /api/v1/cv-templates/:id/export
Content-Type: multipart/form-data
```

Form fields:

| Field | Required | Note |
| --- | --- | --- |
| `file` | Yes | File PDF/DOC/DOCX da render tu FE/template renderer |
| `title` | No | Ten CV trong kho |
| `isDefault` | No | Default `false` |

Behavior:

- FE render template thanh file roi upload len endpoint nay.
- BE upload file export vao document-storage.
- BE tao row moi trong `candidate_cvs`.
- CV export co `source=TEMPLATE_EXPORT`.
- Candidate co the chon CV export nay khi apply job.

Response:

```json
{
  "success": true,
  "data": {
    "id": "candidate-cv-id",
    "documentId": "export-document-id",
    "title": "Backend Engineer CV - Modern",
    "isDefault": false,
    "parseStatus": "NOT_PARSED",
    "source": "TEMPLATE_EXPORT",
    "sourceTemplateId": "template-id",
    "sourceCvId": null,
    "parsedAt": null,
    "createdAt": "2026-07-22T10:00:00.000Z",
    "updatedAt": "2026-07-22T10:00:00.000Z"
  }
}
```

## 11. Delete Template

Endpoint:

```http
DELETE /api/v1/cv-templates/:id
```

Behavior:

- Soft delete template.
- Exported CVs in `candidate_cvs` are not deleted by this endpoint.

Response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

## Important FE Rules

- FE khong goi internal document-storage endpoints.
- FE render URL do BE tra ve, vi BE resolve signed URL va co Redis cache.
- Signed URL co han; neu anh/CV URL het han thi refetch detail endpoint.
- Template la snapshot rieng, khong tu dong sync khi candidate profile thay doi sau do.
- Neu muon sync lai tu profile, FE tao template moi `source=DEFAULT` hoac sau nay them action sync rieng.
