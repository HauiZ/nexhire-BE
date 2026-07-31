# Followed Companies Gateway 404 Explanation - 2026-07-31

## Error

FE gọi API follow company:

```http
POST /api/v1/followed-companies/10000000-0000-4000-8000-000000000004
```

Response nhận được:

```json
{
  "success": false,
  "error": {
    "code": "COMMON.NOT_FOUND",
    "message": "Cannot POST /api/v1/followed-companies/10000000-0000-4000-8000-000000000004"
  }
}
```

## Kết luận nhanh

API follow company đã tồn tại trong `candidate-service`, nhưng `gateway` chưa khai báo route proxy cho prefix `followed-companies`.

Vì vậy request không đi được tới `candidate-service`. Nó bị rơi ngay tại gateway và Nest trả về `Cannot POST ...`.

Đây là lỗi routing/proxy ở gateway, không phải lỗi logic follow company.

## Bằng chứng

Controller follow company có thật ở:

```txt
apps/candidate-service/src/followed-company/followed-company.controller.ts
```

Các route đã có:

```ts
@Controller('followed-companies')
@Roles(UserRole.CANDIDATE)
export class FollowedCompanyController {
  @Get()
  listMine(...)

  @Post(':companyId')
  followMine(...)

  @Delete(':companyId')
  unfollowMine(...)

  @Get('status')
  getMineBatchStatus(...)

  @Get(':companyId/status')
  getMineStatus(...)
}
```

Nhưng trong gateway proxy trước đó chỉ có các prefix như:

```ts
@All('candidates/*')
@All('companies/*')
@All('jobs/*')
@All('saved-jobs/*')
```

Chưa có:

```ts
@All('followed-companies/*')
@All('followed-companies')
```

Nên route `/api/v1/followed-companies/:companyId` không match controller nào ở gateway.

## Fix

Thêm proxy route vào:

```txt
apps/gateway/src/proxy/proxy.controller.ts
```

Đoạn cần thêm:

```ts
@All('followed-companies/*')
followedCompanies(@Req() req: Request, @Res() res: Response) {
  return this.proxy.forward('candidateService', req, res);
}

@All('followed-companies')
followedCompaniesRoot(@Req() req: Request, @Res() res: Response) {
  return this.proxy.forward('candidateService', req, res);
}
```

## Verify

Build gateway:

```bash
npm run build -- gateway
```

Sau đó restart gateway và gọi lại:

```http
POST /api/v1/followed-companies/:companyId
Authorization: Bearer <candidateToken>
```

Nếu route đã vào đúng service:

- candidate hợp lệ + company approved: trả success follow record.
- company chưa approved: trả lỗi business `JOB.COMPANY_NOT_APPROVED`.
- không có token hoặc sai role: trả auth/forbidden.

Nếu vẫn trả `Cannot POST /api/v1/followed-companies/...` thì gateway đang chạy bản cũ hoặc chưa restart đúng process.

## Trạng thái local

Đã patch route proxy trong local và `npm run build -- gateway` đã pass.
