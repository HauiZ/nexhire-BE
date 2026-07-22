# Manual CV Parsing APIs

Manual APIs are helper endpoints for development/test operations. They are disabled when `NODE_ENV=production`.

## `POST /api/v1/cv-parsing/manual/gemini/parse-file`

Summary: Parse a CV file with Gemini and return the result immediately without saving DB data or applying candidate profile data.

Auth:

- Public in development/test only
- Disabled in production

Request body: `multipart/form-data`

| Field  | Type | Required | Note          |
| ------ | ---- | -------- | ------------- |
| `file` | file | Yes      | PDF, max 10MB |

Curl:

```bash
curl -X POST "http://localhost:3000/api/v1/cv-parsing/manual/gemini/parse-file" \
  -F "file=@./sample-cv.pdf"
```

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Manual Gemini CV parse completed",
    "normalizedPayload": {
      "profile": {
        "fullName": "Nguyen Minh Khoa",
        "phone": "0900000000",
        "contactEmail": "khoa@nexhire.vn",
        "headline": "Backend Engineer",
        "summary": "NestJS backend engineer",
        "location": "Ha Noi",
        "portfolioUrl": null,
        "linkedinUrl": null
      },
      "skills": [{ "name": "NestJS", "level": null, "yearsOfExperience": 2 }],
      "experiences": [],
      "educations": [],
      "certifications": [],
      "projects": []
    },
    "rawProviderPayload": {}
  }
}
```

Notes:

- This endpoint is for checking Gemini extraction quality.
- It does not create `candidate_cvs`.
- It does not create `cv_parse_requests` or `cv_parse_results`.
- It does not call candidate-service to update profile.
- Normal product parsing should use candidate APIs:
  - `POST /api/v1/cvs/upload`
  - `POST /api/v1/cvs/:id/parse`

Errors:

| Status | Code                             | Meaning                               |
| ------ | -------------------------------- | ------------------------------------- |
| 400    | `DOCUMENT.FILE_REQUIRED`         | Missing file                          |
| 400    | `DOCUMENT.UNSUPPORTED_FILE_TYPE` | File is not PDF                       |
| 400    | `DOCUMENT.FILE_TOO_LARGE`        | File exceeds 10MB                     |
| 403    | `COMMON.FORBIDDEN`               | Endpoint called in production         |
| 503    | `AI.SERVICE_UNAVAILABLE`         | Gemini or file parsing is unavailable |
