# Candidate CV Parsing Flow

Base URL:

```txt
/api/v1
```

## Upload CV Without Parsing

Endpoint:

```http
POST /cvs/upload
Content-Type: multipart/form-data
```

Use when candidate only wants to store/manage CV.

Form:

```txt
file=<pdf/doc/docx>
title=Backend CV
parse=false
isDefault=false
```

Result:

- Document is stored.
- `candidate_cvs` row is created.
- Candidate profile is not changed.
- `parseStatus=NOT_PARSED`.

## Upload CV And Parse Into Profile

Same endpoint:

```http
POST /cvs/upload
```

Set:

```txt
parse=true
```

Result:

- Candidate-service stores CV.
- Candidate-service asks cv-parsing-service to parse.
- cv-parsing-service uses Gemini.
- Parsed normalized payload is applied to candidate profile tables.
- `candidate_cvs.parseStatus=PARSED` when completed.

Profile apply behavior:

- updates `candidate_profiles`
- replaces old `source=CV_PARSE` skills
- replaces old `source=CV_PARSE` educations
- replaces old `source=CV_PARSE` experiences
- replaces old `source=CV_PARSE` certifications
- replaces old `source=CV_PARSE` projects
- keeps `source=MANUAL` rows

Meaning of "replace CV parse rows":

- BE deletes/removes previous rows that came from older CV parsing.
- BE inserts rows from the latest parse result.
- Manually entered profile data is preserved.

## Parse Existing Saved CV

Endpoint:

```http
POST /cvs/:id/parse
```

Use when user uploaded CV earlier with `parse=false`, then later chooses "Cap nhat ho so tu CV".

## Manual Gemini Test

Dev/manual endpoint:

```http
POST /cv-parsing/manual/gemini/parse-file
Content-Type: multipart/form-data
```

Use this in Swagger to test whether Gemini can parse a sample CV correctly. It returns normalized payload and does not apply to candidate profile.

See `api-docs/manual/cv-parsing-service.md` for curl.

## AI Rate Limit Notes

Gemini failed attempts can still count toward quota because the model request already happened.

Config currently supports retry control:

- `CV_PARSE_GEMINI_MAX_RETRIES`
- `CV_PARSE_PERSIST_RAW_PAYLOAD`

For free quota testing, keep retries low or disabled.

## Internal Endpoints

FE should not call:

- `/internal/cv-parsing/parse`
- `/internal/cv-parsing/requests/:id/complete`
- `/internal/cv-parsing/template-fill`

These are service-to-service APIs guarded by internal token.
