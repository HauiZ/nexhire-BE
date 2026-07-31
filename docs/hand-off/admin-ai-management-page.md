# Admin AI Management Page Hand-off

Base URL qua gateway:

```text
/api/v1
```

Tat ca endpoint can:

```http
Authorization: Bearer <adminToken>
```

Page nay dung de admin chon provider/model cho CV parsing va xem usage/cost cua AI. Matching-service hien khong dung AI config nay.

## 1. Page Scope

Nen gom 2 khu:

- Runtime config: provider dang active, model Gemini, model OpenAI-compatible.
- Usage summary: tong request/token/cost theo provider/model trong 30 ngay gan nhat.

Khong hien API key tren UI. API key nam trong env cua BE.

## 2. Get Current Config

```http
GET /admin/ai-configs
```

Response:

```json
{
  "success": true,
  "data": {
    "currentConfig": {
      "activeProvider": "OPENAI",
      "geminiModel": "gemini-3.5-flash",
      "openAiModel": "gpt-5.5",
      "updatedByUserId": "admin-user-id",
      "updatedAt": "2026-08-01T10:00:00.000Z"
    },
    "supportedModels": {
      "GEMINI": [
        {
          "id": "gemini-3.5-flash",
          "name": "Gemini 3.5 Flash",
          "isDefault": true
        },
        {
          "id": "gemini-1.5-flash",
          "name": "Gemini 1.5 Flash",
          "isDefault": false
        },
        {
          "id": "gemini-1.5-pro",
          "name": "Gemini 1.5 Pro",
          "isDefault": false
        }
      ],
      "OPENAI": [
        {
          "id": "gpt-4o-mini",
          "name": "GPT-4o Mini",
          "isDefault": false
        },
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "isDefault": false
        },
        {
          "id": "gpt-5.5",
          "name": "GPT-5.5 Compatible",
          "isDefault": true
        }
      ]
    }
  }
}
```

UI notes:

- Provider options lay tu enum: `GEMINI`, `OPENAI`.
- Model select nen lay tu `supportedModels[provider]`.
- `updatedByUserId` va `updatedAt` co the null neu chua co admin update.
- Runtime config trong DB uu tien hon env. Env chi la fallback luc DB chua co config.

## 3. Update Config

```http
PUT /admin/ai-configs
Content-Type: application/json
```

Body:

```json
{
  "activeProvider": "OPENAI",
  "geminiModel": "gemini-3.5-flash",
  "openAiModel": "gpt-5.5"
}
```

Rules:

- Field nao khong gui thi BE giu gia tri hien tai.
- `geminiModel` va `openAiModel` phai nam trong whitelist.
- Sau khi save thanh cong, BE tra lai full config moi cung shape voi `GET /admin/ai-configs`.
- Thay doi chi ap dung cho parse request moi. Request dang chay van dung provider/model da ghi trong `cv_parse_requests`.

Validation errors FE can show:

| Status | Meaning                       |
| ------ | ----------------------------- |
| `400`  | Unsupported provider/model    |
| `401`  | Chua login hoac token het han |
| `403`  | User khong phai admin         |
| `422`  | Body sai validation           |
| `500`  | Loi service/DB                |

## 4. Usage Summary

```http
GET /admin/ai-configs/usage-summary
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "provider": "OPENAI",
      "model": "gpt-5.5",
      "totalRequests": 12,
      "succeededRequests": 10,
      "failedRequests": 2,
      "inputTokens": 69760,
      "outputTokens": 7580,
      "totalTokens": 77340,
      "estimatedCostUsd": "0.518580",
      "pricing": {
        "currency": "USD",
        "inputUsdPerMillionTokens": 5,
        "outputUsdPerMillionTokens": 30,
        "multiplier": 0.9,
        "formula": "((inputTokens * inputUsdPerMillionTokens) + (outputTokens * outputUsdPerMillionTokens)) / 1000000 * multiplier"
      }
    }
  ]
}
```

UI notes:

- Endpoint hien tai mac dinh 30 ngay gan nhat, chua co query filter.
- `estimatedCostUsd` co the null neu model chua co pricing config.
- `pricing` co the null neu model chua co pricing config.
- `gpt-5.5` dang tinh theo gia compatible provider:
  - input: `$5 / 1M tokens`
  - output: `$30 / 1M tokens`
  - multiplier: `0.9`
- Nen hien failed rate:

```text
failedRequests / totalRequests
```

## 5. Suggested Layout

Header:

- Title: `AI Management`
- Subtitle nho: `CV parsing provider and usage`

Runtime config panel:

- Segmented control: `Gemini`, `OpenAI`
- Select: Gemini model
- Select: OpenAI-compatible model
- Save button
- Last updated text: `updatedAt`, `updatedByUserId`

Usage table:

Columns:

- Provider
- Model
- Requests
- Success
- Failed
- Failure rate
- Input tokens
- Output tokens
- Total tokens
- Estimated cost

Small summary cards:

- Total requests
- Failed requests
- Total tokens
- Estimated cost

## 6. Important Copy

Use neutral admin wording:

- `Provider/model changes affect new CV parsing jobs only.`
- `API keys are configured on the backend environment and are not visible here.`
- `Cost is estimated from configured model pricing and may differ from provider billing.`

## 7. Test Checklist

- Login as admin and open page.
- `GET /admin/ai-configs` loads current config.
- Switch provider to `OPENAI`, choose `gpt-5.5`, save.
- Refresh page, selected provider/model still persist.
- Upload a candidate CV with parse enabled.
- `GET /admin/ai-configs/usage-summary` shows request count/token/cost increasing.
- Switch back to `GEMINI` and confirm future parse requests use Gemini.
