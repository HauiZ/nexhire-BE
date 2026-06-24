import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { HealthModule } from '../src/health/health.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns status ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.status).toBe('ok');
      });
  });
});
