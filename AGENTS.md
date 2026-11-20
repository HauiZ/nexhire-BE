# Hướng dẫn làm việc với NexHire Backend

*Đọc docs/PROJECT_MAP.md trước khi làm việc*

## Kiến trúc

- NexHire là nền tảng tìm việc và quản lý tuyển dụng. NestJS monorepo chạy Gateway và các service Auth, Candidate, Company, Job, Application, CV Parsing, Notification và Document Storage. `npm run start:matching-service` chạy FastAPI qua Uvicorn với entry point `app.main:app`. Port local của backend là 3000–3009. Frontend React nằm trong repo cùng cấp `../Nexthire-FE/`. [Cấu hình monorepo](nest-cli.json) · [Launcher Matching](scripts/matching-service.js) · [README frontend](../Nexthire-FE/README.md)
- Gateway là điểm vào HTTP `/api/v1`, kiểm tra access JWT do Auth cấp và chuyển tiếp danh tính. Các service kiểm tra role, quyền sở hữu và phạm vi công ty. API nội bộ dùng guard/token theo contract của endpoint. [Quy ước xác thực và tenancy](development-rules/11-auth-and-tenancy.md)
- Mỗi service sở hữu dữ liệu của mình trong PostgreSQL. Giao tiếp xuyên service qua HTTP hoặc event RabbitMQ. Redis phục vụ token/cache, Document Storage quản lý file trên MinIO/S3. [Hạ tầng](docker-compose.yml) · [Event bus](api-docs/event-bus/event-rabbit.md)
- Candidate lưu CV upload ở trạng thái `NOT_PARSED`. Application lấy kết quả parse trước khi enqueue matching. Worker trả bằng chứng với điểm fit tổng là `null`. AI1 mặc định tắt. Đặt `MATCHING_AI1_BACKEND=local_m1` cùng `MATCHING_AI1_MANIFEST_PATH` và `MATCHING_AI1_MANIFEST_SHA256` để truy hồi bằng chứng bằng M1 local. AI2 xếp hạng thử nghiệm trong dev/test qua `MATCHING_AI2_DEMO_ENABLED` và `MATCHING_AI2_DEMO_ARTIFACT_PATH`. [Cấu hình Matching](apps/matching-service/app/config.py) · [AI2 loader](apps/matching-service/app/ranking/demo_loader.py)

## Quy ước code

- Làm theo [development-rules](development-rules/README.md). Controller xử lý HTTP, DTO validation và Swagger. Service giữ nghiệp vụ, quyền truy cập dữ liệu và transaction.
- Đặt contract, guard, enum, error code và hằng số event dùng chung trong `@nexhire/shared`. Đặt adapter hạ tầng trong `@nexhire/infra`. Dùng alias hiện có và giữ quan hệ ORM trong database của service sở hữu dữ liệu. [Import](development-rules/03-import-conventions.md) · [Hạ tầng](development-rules/12-infrastructure-patterns.md)
- Mỗi service dùng TypeORM có `apps/<service>/data-source.ts` riêng, trỏ tới DB của service đó. Luôn giữ `synchronize: false`. Với thay đổi entity thông thường, dùng `npm run db:<scope>:generate -- <Name>` để gọi `migration:generate`. Ví dụ `npm run db:candidate:generate -- AddCandidateProfileField`. Áp dụng migration đang chờ vào DB local phù hợp trước khi generate, rồi review SQL và chạy `npm run db:migration:lint -- candidate-service`. Matching FastAPI dùng SQL trong `apps/matching-service/migrations/` qua `npm run matching:migrate`. [Entity và migration](development-rules/08-entity-patterns.md) · [TypeORM factory](packages/infra/src/database/typeorm.factory.ts) · [Python migrations](apps/matching-service/app/migrate.py)
- Các giá trị `<scope>` là `auth`, `candidate`, `company`, `job`, `application`, `cv-parsing`, `matching`, `notification`, `document-storage`. Migration lint dùng tên service đầy đủ với hậu tố `-service`. Ví dụ `candidate` khi generate và `candidate-service` khi lint. Script TypeORM của `matching` thuộc cây NestJS, còn migration của FastAPI dùng lệnh SQL riêng ở trên. [Scripts](package.json) · [Migration lint](scripts/migration-lint.js)
- Khi đổi API hoặc env, cập nhật tài liệu API liên quan và giữ `.env.example`, schema validation, config service đồng bộ với thay đổi tương ứng. Khi được yêu cầu commit, theo mẫu đang dùng trong lịch sử Git, ví dụ `docs(repo): update agent guidance`. [API docs](api-docs/README.md) · [Config](development-rules/10-config-patterns.md)

## Lệnh chạy và test

Chạy từ gốc backend. Nếu một lệnh cần cấu hình local mà thiếu `.env.local`, dừng lệnh đó và hỏi người dùng. Không tự tạo file từ `.env.example` với khóa giả. Xác nhận DB đích là DB local dành cho công việc trước khi chạy lệnh migration, kể cả `generate`. [Hướng dẫn local](docs/PROJECT_MAP.md)

| Mục đích | Lệnh |
| --- | --- |
| Chạy hạ tầng local | `docker compose up -d` |
| Chạy toàn bộ backend | `npm run start:all` |
| Chạy một service | `npm run start:candidate-service` hoặc `npm run start:matching-service` |
| Dùng cấu hình `.env.local` | `npm run start:local -- start:all` |
| Build ứng dụng NestJS mặc định | `npm run build` |
| Build service NestJS cụ thể | `npm run build -- candidate-service` |
| Chạy Jest | `npm test` |
| Chạy một test suite | `npm test -- --runInBand apps/auth-service/src/auth/test/auth.service.spec.ts` |
| Chạy Jest e2e | `npm run test:e2e` |
| Chạy test Python của Matching | `npm run matching:test` |
| Kiểm tra trước khi chạy API flow local | `npm run test:flows:preflight` |

Swagger ở `http://localhost:3000/api/docs`. Health ở `http://localhost:3000/api/v1/health`. Các script root `npm run lint` và `npm run format` có thể ghi lại source trên toàn repo. Khi cần kiểm tra hoặc sửa format, truyền trực tiếp danh sách file đã đổi cho ESLint hoặc Prettier. [Scripts](package.json) · [API flow tests](test/test-flows/README.md)

Nếu làm việc với React, đọc [AGENTS.md của Nexthire-FE](../Nexthire-FE/AGENTS.md). Từ gốc repo FE, dùng `npm run dev`, `npm run build` và `npm test`. [Scripts frontend](../Nexthire-FE/package.json)

Với test ghi PostgreSQL, dùng DB local dành riêng cho suite. Ví dụ suite review workspace của Application dùng `HR_WORKSPACE_TEST_DB_URL`, `HR_WORKSPACE_TEST_DB_NAME` và `HR_WORKSPACE_TEST_DB_ROLE` để chỉ định DB và role dành riêng cho test. [Test suite](apps/application-service/src/application/test/review-workspace.postgres.spec.ts)

## Ranh giới và quy trình

- Không sửa migration đã áp dụng. Tạo migration mới cho mọi thay đổi schema và luôn giữ `synchronize: false`.
- Sau khi generate trên DB local đã chạy đủ baseline, đọc cả `up` và `down` trước khi chạy lint hoặc apply. Nếu TypeORM sinh thêm thay đổi index, khóa ngoại hoặc default ngoài phạm vi, xác minh và giữ đúng SQL thuộc yêu cầu trong migration mới. Báo phần chênh lệch schema cũ để xử lý riêng.
- Hỏi trước khi chạy lệnh phá dữ liệu như drop/reset DB hoặc `docker compose down -v`.
- Không đọc, sửa hoặc commit các file env chứa bí mật như `.env`, `.env.local`, `.env.deploy` hay khóa Gemini, OpenAI, SMTP. Dùng `.env.example` để đối chiếu cấu hình.
- Giới hạn thay đổi trong service được giao. Nếu cần đổi `@nexhire/shared` hoặc contract liên service, nêu rõ bên gọi, bên nhận và ảnh hưởng tương thích rồi hỏi trước khi sửa.
- Với việc lớn hoặc liên quan nhiều service, nêu kế hoạch ngắn trước khi sửa. Khi code và tài liệu mâu thuẫn, trỏ tới cả hai nguồn, báo lại và xác nhận hành vi mong muốn trước khi sửa phần liên quan.
- Với thay đổi code, chạy test liên quan của service và `npm run build`. Build mặc định nhắm Gateway, nên khi sửa một service NestJS khác, chạy thêm `npm run build -- <service>`. Nếu đổi entity, chạy thêm `npm run db:migration:lint -- <service>`. Báo lệnh đã chạy, kết quả và phần chưa kiểm chứng.
- Khi thay đổi kiến trúc, luồng hoặc port, cập nhật `docs/PROJECT_MAP.md` theo code. Nếu thiếu file, lập lại bản đồ từ source và cấu hình hiện tại trước khi dùng làm tham chiếu.
