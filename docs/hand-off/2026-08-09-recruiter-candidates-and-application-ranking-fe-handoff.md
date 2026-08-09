# 2026-08-09 Recruiter Candidates And Application Ranking FE Handoff

## Mục tiêu

Tách rõ hai page recruiter:

- `Applications / Đơn ứng tuyển`: đơn vị chính là một application, dùng để xử lý hồ sơ ứng tuyển và ranking ứng viên theo từng job.
- `Candidates / Ứng viên`: đơn vị chính là candidate profile trong phạm vi company của recruiter, dùng để xem lịch sử ứng tuyển của một ứng viên với company mình.

Recruiter không được xem global candidates. Candidate chỉ xuất hiện ở Candidates page nếu đã từng apply vào ít nhất một job thuộc company của recruiter.

## Applications Page

Endpoint:

```http
GET /api/v1/recruiter/applications
```

Query mới:

```http
?jobId=uuid
&status=SUBMITTED
&search=nguyen
&matchLevel=HIGH
&minMatchScore=70
&sortBy=matchScore
&sortOrder=desc
&page=1
&limit=20
```

`sortBy`:

- `submittedAt`
- `updatedAt`
- `matchScore`

`sortOrder`:

- `asc`
- `desc`

Use case:

- Từ job detail tab "Ứng viên": gọi `jobId=...&sortBy=matchScore&sortOrder=desc`.
- Từ menu "Đơn ứng tuyển": không truyền `jobId`, nhưng mỗi card phải hiển thị `jobTitle`.

Card nên hiển thị:

```json
{
  "id": "application-id",
  "jobId": "job-id",
  "jobTitle": "Backend Engineer",
  "candidateId": "candidate-id",
  "candidateFullName": "Nguyen Van A",
  "candidateEmail": "a@example.com",
  "candidateAvatarUrl": "https://...",
  "candidateCvId": "cv-id",
  "cvTitle": "Backend CV",
  "cvParseStatus": "PARSED",
  "matchScore": 92,
  "matchLevel": "EXCELLENT",
  "status": "SUBMITTED",
  "submittedAt": "2026-08-09T10:00:00.000Z"
}
```

## Candidates Page

Endpoint:

```http
GET /api/v1/recruiter/candidates
```

Query:

```http
?jobId=uuid
&status=SUBMITTED
&search=nguyen
&matchLevel=HIGH
&minMatchScore=70
&sortBy=lastAppliedAt
&sortOrder=desc
&page=1
&limit=20
```

`sortBy`:

- `lastAppliedAt`
- `bestMatchScore`
- `applicationCount`
- `candidateName`

Response item:

```json
{
  "candidateId": "candidate-id",
  "candidateUserId": "candidate-user-id",
  "fullName": "Nguyen Van A",
  "email": "a@example.com",
  "phone": "0912345678",
  "avatarDocumentId": "document-id",
  "avatarUrl": "https://...",
  "headline": "Backend Developer",
  "location": "Ha Noi",
  "skills": [
    {
      "name": "NestJS",
      "level": "ADVANCED",
      "yearsOfExperience": 3
    }
  ],
  "latestApplicationId": "application-id",
  "latestJobId": "job-id",
  "latestJobTitle": "Backend Engineer",
  "latestStatus": "SUBMITTED",
  "applicationCount": 3,
  "lastAppliedAt": "2026-08-09T10:00:00.000Z",
  "bestMatchScore": 92,
  "bestMatchLevel": "EXCELLENT",
  "bestMatchedApplicationId": "application-id",
  "bestMatchedJobId": "job-id",
  "bestMatchedJobTitle": "Backend Engineer"
}
```

FE notes:

- `skills`, `headline`, `location` là best-effort từ candidate-service sau khi BE đã xác nhận candidate thuộc company scope.
- Nếu service enrich lỗi tạm thời, BE vẫn trả card với `skills=[]`.
- Page này không thay thế Applications page. Nó giúp recruiter nhìn theo người, không phải theo từng đơn.

## Candidate Detail

Endpoint:

```http
GET /api/v1/recruiter/candidates/:candidateId
```

Rule:

- Candidate phải có ít nhất một application thuộc company của recruiter.
- BE chỉ trả application history trong company hiện tại.

Response: candidate list item fields + `applications`.

```json
{
  "candidateId": "candidate-id",
  "fullName": "Nguyen Van A",
  "applicationCount": 2,
  "bestMatchScore": 92,
  "applications": [
    {
      "id": "application-id",
      "jobId": "job-id",
      "jobTitle": "Backend Engineer",
      "status": "SUBMITTED",
      "matchScore": 92,
      "matchLevel": "EXCELLENT",
      "submittedAt": "2026-08-09T10:00:00.000Z"
    }
  ]
}
```

## UX Gợi Ý

- Applications page: dùng cho xử lý hồ sơ, xem CV, offer/reject, ranking theo job.
- Candidates page: dùng cho xem ứng viên theo người, xem họ đã apply những job nào trong company, best match là job nào.
- Job detail tab Applications: dùng chung `GET /recruiter/applications?jobId=...&sortBy=matchScore&sortOrder=desc`.
