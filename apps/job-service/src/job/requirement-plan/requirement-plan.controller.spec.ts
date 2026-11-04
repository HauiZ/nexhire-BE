import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InternalAuthGuard, RolesGuard, setupApp } from '@nexhire/shared';
import request from 'supertest';
import { RequirementPlanController } from './requirement-plan.controller';
import { RequirementPlanService } from './requirement-plan.service';

describe('RequirementPlanController identity and payload boundary', () => {
  let app: INestApplication;
  const plans = {
    get: jest.fn(),
    createDraft: jest.fn(),
    confirm: jest.fn(),
    edit: jest.fn(),
    history: jest.fn(),
  };
  const url = '/api/v1/recruiter/jobs/11111111-1111-4111-8111-111111111111/requirement-plan';
  const identity = {
    'x-user-id': '22222222-2222-4222-8222-222222222222',
    'x-user-role': 'RECRUITER',
    'x-company-id': '33333333-3333-4333-8333-333333333333',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RequirementPlanController],
      providers: [
        { provide: RequirementPlanService, useValue: plans },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    setupApp(app, { serviceName: 'unit-plan', swagger: false });
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('rejects missing identity and non-HR roles', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer())
      .get(url)
      .set({ ...identity, 'x-user-role': 'CANDIDATE' })
      .expect(403);
    expect(plans.get).not.toHaveBeenCalled();
  });
  it('passes trusted gateway identity to the ownership-checking service', async () => {
    plans.get.mockResolvedValue({ status: 'UNPREPARED', publishing_blocked: false });
    await request(app.getHttpServer()).get(url).set(identity).expect(200);
    expect(plans.get).toHaveBeenCalledWith(
      { id: identity['x-user-id'], role: 'RECRUITER', companyId: identity['x-company-id'] },
      '11111111-1111-4111-8111-111111111111',
    );
  });
  it('rejects caller-supplied approval metadata', async () => {
    await request(app.getHttpServer())
      .post(url + '/confirm')
      .set(identity)
      .send({
        expectedContentSha256: 'a'.repeat(64),
        reviewer_id: 'spoof',
        approval: { origin: 'authenticated_hr' },
      })
      .expect(400);
    expect(plans.confirm).not.toHaveBeenCalled();
  });
  it('requires optimistic revision and hash bindings', async () => {
    await request(app.getHttpServer())
      .post(url + '/drafts')
      .set(identity)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(url + '/confirm')
      .set(identity)
      .send({ expectedContentSha256: 'bad' })
      .expect(400);
    expect(plans.createDraft).not.toHaveBeenCalled();
  });
  it('accepts a bound confirmation request without candidate data', async () => {
    plans.confirm.mockResolvedValue({ status: 'HR_CONFIRMED', candidate_support_verified: false });
    await request(app.getHttpServer())
      .post(url + '/confirm')
      .set(identity)
      .send({ expectedContentSha256: 'a'.repeat(64) })
      .expect(200);
    expect(plans.confirm).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.objectContaining({ expectedContentSha256: 'a'.repeat(64) }),
    );
  });
  it('does not silently coerce a false string into a true shared-context restriction', async () => {
    await request(app.getHttpServer())
      .patch(url)
      .set(identity)
      .send({
        expectedContentSha256: 'a'.repeat(64),
        requirements: [
          {
            requirement_id: 'requirements/0',
            original_text: 'Use SQL.',
            components: [{ id: 'sql', query: 'Use SQL.', source_quote: 'SQL', importance: 'core' }],
            all_of: [['sql']],
            joint_context_required: 'false',
          },
        ],
      })
      .expect(400);
    expect(plans.edit).not.toHaveBeenCalled();
  });
});
