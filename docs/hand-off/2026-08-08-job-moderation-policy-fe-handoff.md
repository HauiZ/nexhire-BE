# Job Moderation Policy FE Handoff

## Purpose

Admin can manage job moderation policies used to score recruiter job submissions before manual review.

The backend uses exactly one `ACTIVE` policy at a time. Each policy record contains a complete `rules` object. When a job or job revision is submitted, the backend stores `moderation.policyId` and `moderation.policyVersion` on the moderation result so the review can be traced back to the policy used at that time.

## Source Of Truth

The active policy in DB is the operational source of truth.

Use this endpoint to show what the system is currently using:

```http
GET /api/v1/admin/job-moderation-policies?status=ACTIVE
```

`default-rules` is not the active policy. It is only a code-level template/fallback.

Use this endpoint only to prefill a create form or reset a draft to the backend default template:

```http
GET /api/v1/admin/job-moderation-policies/default-rules
```

`default-rules` returns only a `rules` object. It does not return `id`, `name`, `status`, `version`, or timestamps.

## Policy Lifecycle

Statuses:

```text
DRAFT: admin is editing/testing the policy before use
ACTIVE: the only policy currently used by job moderation
UNPUBLISHED: inactive policy that remains visible and can be restored as active
ARCHIVED: hidden from the default operational list and cannot be edited or published again
```

List behavior:

```http
GET /api/v1/admin/job-moderation-policies
```

Returns `DRAFT`, `ACTIVE`, and `UNPUBLISHED`. It excludes `ARCHIVED`.

To show archived policies:

```http
GET /api/v1/admin/job-moderation-policies?status=ARCHIVED
```

Publish behavior:

```text
Before:
Policy A = ACTIVE
Policy B = DRAFT or UNPUBLISHED

Publish/restore Policy B:
Policy A -> UNPUBLISHED
Policy B -> ACTIVE
```

Archive behavior:

```text
DRAFT or UNPUBLISHED -> ARCHIVED
ACTIVE cannot be archived directly
ARCHIVED cannot be restored/published
```

## Recommended UI Actions

For each policy:

```text
DRAFT: Save draft, Test rules, Publish, Archive
ACTIVE: Test active policy, Rename only
UNPUBLISHED: Restore as active, Archive
ARCHIVED: View only
```

Do not label `UNPUBLISHED -> ACTIVE` as `Publish` in the UI. Use:

```text
Restore as active
```

Do not show archived policies in the normal policy list unless admin explicitly opens an archive view.

## Risk Scoring

The backend normalizes job text by lowercasing and removing Vietnamese diacritics, then evaluates enabled rules.

Formula:

```text
riskScore = min(sum(score of matched rule ids), 100)
```

Important: keyword rules may reuse the same `id` for aliases. If multiple aliases with the same `id` match, the backend adds that rule score only once.

Default thresholds:

```text
0-24: LOW
25-49: MEDIUM
50-79: HIGH
80-100: CRITICAL
```

Decision mapping:

```text
LOW -> PENDING_REVIEW
MEDIUM -> NEEDS_REVIEW
HIGH -> NEEDS_REVIEW
CRITICAL -> SHOULD_REJECT
```

## Keyword Rule UI

Do not expose `keywordRules.id` as a raw editable input. It is a technical rule code for backend matching, audit, and logs.

Render keyword rules like this:

```text
Enabled | Rule group | Keyword/Alias | Score | Reason | Actions
```

`Rule group` should be a readable label derived from `id`, or a dropdown of existing groups.

When admin creates a new group, FE should generate the id from the group name:

```text
Upfront payment -> RISK_UPFRONT_PAYMENT
Sensitive document request -> RISK_SENSITIVE_DOCUMENT_REQUEST
```

Keyword row actions:

```text
Add keyword
Add alias
Delete selected
```

Do not implement `Duplicate selected` or `Clone selected` for keyword rows.

`Add alias` should:

```text
reuse selected rule id
reuse score
reuse reason
reuse enabled state
leave keyword empty
```

The admin must enter a unique keyword/alias.

## State Handling Warning

Do not mutate policy rules directly from list state.

When opening a policy editor, deep clone the selected policy rules:

```ts
setEditorRules(structuredClone(selectedPolicy.rules));
```

Avoid this:

```ts
setEditorRules(selectedPolicy.rules);
```

When publish/restore succeeds, do not copy the returned active policy rules into other policies. Only update the affected policy statuses and replace the published policy with the response.

Correct merge shape:

```ts
policies.map((policy) => {
  if (policy.id === published.id) return published;
  if (policy.status === 'ACTIVE') return { ...policy, status: 'UNPUBLISHED' };
  return policy;
});
```

## Endpoints

All endpoints use gateway base:

```text
/api/v1
```

All endpoints require admin bearer auth.

### List Policies

```http
GET /api/v1/admin/job-moderation-policies
GET /api/v1/admin/job-moderation-policies?status=ACTIVE
GET /api/v1/admin/job-moderation-policies?status=ARCHIVED
```

### Get Default Rule Template

```http
GET /api/v1/admin/job-moderation-policies/default-rules
```

Use only for form bootstrap/reset.

### Get Policy Detail

```http
GET /api/v1/admin/job-moderation-policies/{id}
```

### Create Draft Policy

```http
POST /api/v1/admin/job-moderation-policies
```

Body:

```json
{
  "name": "Vietnam job safety policy",
  "rules": {}
}
```

### Update Policy

```http
PATCH /api/v1/admin/job-moderation-policies/{id}
```

Rules:

```text
DRAFT: name and rules can be edited
ACTIVE: name can be edited, rules cannot be edited
UNPUBLISHED: name and rules can be edited
ARCHIVED: cannot be edited
```

Updating `rules` increments `version`.

### Publish Or Restore Policy

```http
POST /api/v1/admin/job-moderation-policies/{id}/publish
```

Rules:

```text
DRAFT -> ACTIVE
UNPUBLISHED -> ACTIVE
ACTIVE -> no-op response
ARCHIVED -> rejected
```

### Archive Policy

```http
POST /api/v1/admin/job-moderation-policies/{id}/archive
```

Rules:

```text
DRAFT -> ARCHIVED
UNPUBLISHED -> ARCHIVED
ACTIVE -> rejected
ARCHIVED -> no-op response
```

### Test Policy Rules

```http
POST /api/v1/admin/job-moderation-policies/test
```

Body:

```json
{
  "rules": {},
  "companyTrustLevel": "MEDIUM",
  "job": {
    "title": "Remote Sales Collaborator",
    "description": "Lien he telegram va dong phi ho so truoc khi nhan viec.",
    "requirements": "Can giao tiep tot.",
    "skills": ["Sales"],
    "salaryMin": 10000000,
    "salaryMax": 50000000,
    "experienceLevel": "FRESHER",
    "workingType": "REMOTE",
    "employmentType": "PART_TIME",
    "location": "Remote"
  }
}
```

`rules` is optional. If omitted, backend tests with the current active policy. If provided, backend tests with the supplied draft rules and returns `policyId: null`, `policyVersion: null`.

## Validation Rules

Backend rejects invalid policies when creating, updating, publishing, or testing draft rules.

Rules must satisfy:

```text
rules must be an object
thresholds must satisfy 0 < medium < high < critical <= 100
keywordRules must be an array
each keyword rule needs id, keyword, score, reason
keyword rule ids may be reused for aliases of the same logical rule
keyword rule keywords must be unique within one policy after lowercasing and Vietnamese diacritic removal
all rule sections are required
salaryRules.maxByExperienceLevel must include INTERN, FRESHER, JUNIOR, MIDDLE, SENIOR, LEAD
all score, limit, min, max fields must be numbers >= 0
domain/signal fields must be string arrays
```

## Job Response Change

Admin/recruiter job moderation responses include the policy snapshot:

```json
{
  "moderation": {
    "riskScore": 50,
    "riskLevel": "HIGH",
    "decision": "NEEDS_REVIEW",
    "reasons": [],
    "matchedRules": [],
    "policyId": "uuid",
    "policyVersion": 2
  }
}
```
