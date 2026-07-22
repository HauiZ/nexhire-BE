# Candidate CV Template Editor Flow

## Goal

CV template is presentation data, separate from candidate profile data.

- Candidate profile tables remain the source of truth for the candidate's main profile.
- CV templates store layout/theme/content snapshot in `candidate_cv_templates`.
- Uploading a CV to fill a template does not update candidate profile by default.
- Exporting a template creates a saved CV in `candidate_cvs`, so the candidate can use it when applying for jobs.

## Main FE Flow

### 1. Load supported template options

```http
GET /api/v1/cv-templates/options
Authorization: Bearer <candidate_token>
```

Use this to render template choices and know valid section keys.

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

### 2. Upload CV to fill template

```http
POST /api/v1/cv-templates/from-cv
Content-Type: multipart/form-data
Authorization: Bearer <candidate_token>
```

Form fields:

| Field | Required | Note |
| --- | --- | --- |
| `file` | Yes | PDF/DOC/DOCX, max 10 MB |
| `templateKey` | Yes | `modern`, `classic`, `minimal` |
| `name` | No | User-facing template name |

Important:

- This does not create a CV library record.
- This does not apply parsed data into profile.
- It stores parsed data in `contentSnapshot` and drag/drop data in `layout`.
- After parsing succeeds, BE tries to delete the uploaded source document immediately.
- If cleanup succeeds, `sourceDocumentId` is `null` and `sourceDocumentDeletedAt` is set.
- If cleanup fails, `sourceDocumentId` remains and `sourceDocumentDeleteError` is set for retry/audit.

### 3. Render editor

Use response:

- `templateKey` to choose FE renderer.
- `layout.sections` to render section order/visibility.
- `contentSnapshot` to render editable content.

`languages`, `awards`, and `references` can be edited in template even though they are not candidate profile tables yet.

### 4. Save metadata/content/theme

```http
PATCH /api/v1/cv-templates/:id
```

Use this when user edits text/theme/template name.

### 5. Drag/drop top-level sections

```http
PATCH /api/v1/cv-templates/:id/sections/sort-order
```

Body:

```json
{
  "sectionKeys": ["profile", "skills", "projects", "experiences"]
}
```

BE validates:

- no unknown section key
- no duplicate section key
- missing sections are allowed

### 6. Drag/drop items inside a section

```http
PATCH /api/v1/cv-templates/:id/sections/:sectionKey/items/sort-order
```

Body:

```json
{
  "itemIds": ["project-3", "project-1", "project-2"]
}
```

Allowed list sections:

- `skills`
- `experiences`
- `educations`
- `projects`
- `certifications`
- `languages`
- `awards`
- `references`

`profile` and `summary` are not sortable item sections.

### 7. Export and save into CV library

```http
POST /api/v1/cv-templates/:id/export
Content-Type: multipart/form-data
Authorization: Bearer <candidate_token>
```

Form fields:

| Field | Required | Note |
| --- | --- | --- |
| `file` | Yes | Exported PDF/DOC/DOCX from FE renderer |
| `title` | No | CV library title |
| `isDefault` | No | Defaults to `false` |

Result:

- BE uploads exported file to document-storage.
- BE creates `candidate_cvs` with `source=TEMPLATE_EXPORT`.
- Candidate can select this CV for job application.

## Data Model Summary

`candidate_cv_templates` stores:

- `candidateId`
- `name`
- `templateKey`
- `sourceDocumentId`
- `sourceDocumentDeletedAt`
- `sourceDocumentDeleteError`
- `sourceParseRequestId`
- `theme`
- `layout`
- `contentSnapshot`
- `isDefault`
- `lastExportedCvId`
- `lastExportedAt`

`candidate_cvs` now has:

- `source`: `UPLOADED` or `TEMPLATE_EXPORT`
- `sourceTemplateId`
- `sourceCvId`

## Why This Design

- Keeps profile data clean.
- Avoids applying parsed CV into profile when user only wants template editing.
- Avoids one endpoint doing too many unrelated things.
- Lets FE keep UX fast by sending bulk sort order after drag/drop.
- Keeps exported template CVs in the same library used for job applications.
