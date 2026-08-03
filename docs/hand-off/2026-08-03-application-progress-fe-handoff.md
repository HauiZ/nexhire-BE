# 2026-08-03 - Application Progress Handoff For FE

## Muc Tieu

Flow nay dung de hien thi tien trinh ung tuyen cho candidate theo tung application. BE luu timeline theo dang event, FE render theo `progress.events`.

Recruiter khong can man hinh timeline rieng trong phase nay. Khi recruiter mo CV cua ung vien, BE se tu dong danh dau `CV_VIEWED` va gui notification in-app cho candidate.

## Progress Steps

Thu tu hien thi de xuat:

```txt
CV_SUBMITTED -> CV_RECEIVED -> CV_VIEWED -> RESPONDED
```

Step huy:

```txt
CANCELLED
```

Y nghia:

```txt
CV_SUBMITTED: Ung vien nop ho so thanh cong.
CV_RECEIVED: Nha tuyen dung da tiep nhan ho so.
CV_VIEWED: Nha tuyen dung da mo/xem CV.
RESPONDED: Nha tuyen dung da phan hoi ket qua, OFFERED hoac REJECTED.
CANCELLED: Application bi huy do job closed/system lifecycle.
```

BE khong luu `IN_REVIEW`. Neu FE can hien thi trang thai "Dang xu ly", co the suy ra:

```txt
CV_VIEWED da done va RESPONDED chua done
```

## Candidate API

### List Application Cua Candidate

```http
GET /api/v1/applications/me?page=1&limit=10&status=SUBMITTED
```

Query:

```txt
page: optional number
limit: optional number
status: optional enum SUBMITTED | OFFERED | REJECTED | WITHDRAWN | CANCELLED
```

Response la paginated envelope. Moi item trong `data` co them:

```json
{
  "success": true,
  "data": [
    {
      "id": "application-id",
      "jobId": "job-id",
      "jobTitle": "Backend Engineer",
      "companyId": "company-id",
      "companyName": "NexHire",
      "companyLogoUrl": "https://cdn.nexhire.vn/company/logo.png",
      "candidateCvId": "candidate-cv-id",
      "cvDocumentId": "cv-document-id",
      "cvTitle": "Nguyen Van A CV.pdf",
      "status": "SUBMITTED",
      "currentProgressStep": "CV_VIEWED",
      "firstCvReceivedAt": "2026-08-03T09:00:00.000Z",
      "firstCvViewedAt": "2026-08-03T09:30:00.000Z",
      "progress": {
        "currentProgressStep": "CV_VIEWED",
        "events": [
          {
            "id": "event-id-3",
            "step": "CV_VIEWED",
            "title": "NTD da xem CV",
            "description": null,
            "actorType": "RECRUITER",
            "actorUserId": "recruiter-user-id",
            "note": null,
            "metadata": null,
            "occurredAt": "2026-08-03T09:30:00.000Z",
            "isLatest": true
          },
          {
            "id": "event-id-2",
            "step": "CV_RECEIVED",
            "title": "NTD da tiep nhan ho so",
            "description": null,
            "actorType": "SYSTEM",
            "actorUserId": null,
            "note": null,
            "metadata": null,
            "occurredAt": "2026-08-03T09:00:00.000Z",
            "isLatest": false
          },
          {
            "id": "event-id-1",
            "step": "CV_SUBMITTED",
            "title": "Ung vien gui ho so thanh cong",
            "description": null,
            "actorType": "CANDIDATE",
            "actorUserId": "candidate-user-id",
            "note": null,
            "metadata": null,
            "occurredAt": "2026-08-03T09:00:00.000Z",
            "isLatest": false
          }
        ]
      },
      "submittedAt": "2026-08-03T09:00:00.000Z",
      "decidedAt": null,
      "cancelledAt": null,
      "createdAt": "2026-08-03T09:00:00.000Z",
      "updatedAt": "2026-08-03T09:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### Detail Application Cua Candidate

```http
GET /api/v1/applications/me/:id
```

Response la 1 `ApplicationResponseDto`, co `progress` de render card/timeline detail:

```json
{
  "success": true,
  "data": {
    "id": "application-id",
    "status": "SUBMITTED",
    "currentProgressStep": "CV_VIEWED",
    "progress": {
      "currentProgressStep": "CV_VIEWED",
      "events": [
        {
          "id": "event-id-3",
          "step": "CV_VIEWED",
          "title": "NTD da xem CV",
          "description": null,
          "actorType": "RECRUITER",
          "actorUserId": "recruiter-user-id",
          "note": null,
          "metadata": null,
          "occurredAt": "2026-08-03T09:30:00.000Z",
          "isLatest": true
        }
      ]
    }
  }
}
```

### Candidate Mo Lai CV Da Apply

```http
GET /api/v1/applications/me/:id/cv
```

Dung de candidate xem/download lai CV da dung de apply. API nay khong tao `CV_VIEWED`, khong gui notification.

### Apply Job

```http
POST /api/v1/applications
```

Request:

```json
{
  "jobId": "job-id",
  "candidateCvId": "candidate-cv-id",
  "coverLetter": "Optional short cover letter"
}
```

Sau khi apply thanh cong, BE tao ngay:

```txt
CV_SUBMITTED
CV_RECEIVED
```

Candidate co the thay "NTD da tiep nhan ho so" ngay sau khi nop.

Response apply cung tra `progress` giong detail.

## Recruiter API Side Effects

### Recruiter Mo CV

```http
GET /api/v1/recruiter/applications/:id/cv
```

Side effect:

```txt
1. Neu application chua co CV_RECEIVED thi BE tao CV_RECEIVED.
2. Neu application chua co CV_VIEWED thi BE tao CV_VIEWED.
3. Neu CV_VIEWED moi duoc tao, BE publish event application.cv-viewed.
4. Notification-service consume event va tao in-app notification cho candidate.
```

API nay idempotent theo step. Recruiter goi lai nhieu lan khong tao them event `CV_VIEWED` va khong gui them notification.

Notification candidate nhan:

```json
{
  "type": "APPLICATION_CV_VIEWED",
  "title": "Nha tuyen dung da xem CV",
  "body": "NexHire da xem CV cua ban cho Backend Engineer.",
  "data": {
    "applicationId": "application-id",
    "jobId": "job-id",
    "jobTitle": "Backend Engineer",
    "companyId": "company-id",
    "companyName": "NexHire",
    "viewedByUserId": "recruiter-user-id",
    "viewedAt": "2026-08-03T09:30:00.000Z"
  }
}
```

FE lay notification qua API co san:

```http
GET /api/v1/notifications?page=1&limit=20&readStatus=ALL
GET /api/v1/notifications/unread-count
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/read-all
```

`APPLICATION_CV_VIEWED` la notification user-scoped, candidate nao dang login thi chi lay notification cua candidate do.

### Recruiter Cap Nhat Ket Qua

```http
PATCH /api/v1/recruiter/applications/:id/status
```

Request:

```json
{
  "status": "OFFERED",
  "note": "Optional recruiter note"
}
```

`status` chi chap nhan:

```txt
OFFERED | REJECTED
```

Khi status la `OFFERED` hoac `REJECTED`, BE tao:

```txt
RESPONDED
```

Flow notification ket qua van dung notification cu `APPLICATION_STAGE_CHANGED`.

## Data Model FE Can Biet

`application_progress_events` khong phai 1 application 1 record. Moi application co nhieu event, moi step chi tao toi da 1 lan:

```txt
unique(application_id, step)
```

`applications.currentProgressStep` la snapshot nhanh de FE hien trang thai card. `progress.events` la source de render timeline.

`progress.events` hien dang tra theo thu tu moi nhat truoc. Neu FE render timeline trai sang phai/cu den moi, hay map theo `step` thay vi tin vao thu tu array.

## Render De Xuat

FE nen co danh sach step co dinh:

```ts
const orderedSteps = ['CV_SUBMITTED', 'CV_RECEIVED', 'CV_VIEWED', 'RESPONDED'];
```

Sau do map `progress.events` theo `step` de danh dau done/current.

Neu `currentProgressStep === 'CANCELLED'`, co the hien timeline bi huy va an step `RESPONDED` neu thiet ke can gon.

## Migration Can Chay

Application-service co migration moi:

```txt
1786100000000-AddApplicationProgressEvents.ts
```

Notification-service co migration moi:

```txt
1786100100000-AddApplicationCvViewedNotificationType.ts
```

Can chay migration truoc khi test flow:

```bash
npm run db:application:run
npm run db:notification:run
```
