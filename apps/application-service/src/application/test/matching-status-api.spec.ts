import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InternalAuthGuard, RolesGuard, UserRole, setupApp } from '@nexhire/shared';
import request from 'supertest';
import { ApplicationService } from '../application.service';
import { ApplicationInternalClientService } from '../application-internal-client.service';
import {
  RecruiterApplicationController,
  RecruiterJobApplicationRankingsController,
} from '../recruiter-application.controller';
import { Application } from '../entities/application.entity';
import { ApplicationProgressEvent } from '../entities/application-progress-event.entity';
import { ApplicationEventPublisher } from '../events/application-event.publisher';
import { ReviewWorkspaceService } from '../review-workspace.service';

describe('Recruiter matching HTTP contract (mock repositories/upstream)', () => {
  let app: INestApplication;
  const id = '11111111-1111-4111-8111-111111111111';
  const jobId = '22222222-2222-4222-8222-222222222222';
  const application = { id, jobId, candidateId: 'candidate-1', candidateCvId: 'cv-1' };
  const repo = { findOne: jest.fn(), find: jest.fn() };
  const client = {
    getLatestApplicationMatchResult: jest.fn(),
    getLatestApplicationAi2Demo: jest.fn().mockResolvedValue(null),
    getLatestApplicationHrReview: jest.fn().mockResolvedValue(null),
    getJobApplicationSnapshot: jest.fn(),
  };
  const url = `/api/v1/recruiter/applications/${id}/matching-status`;
  const headers = {
    'x-user-id': 'recruiter-1',
    'x-user-role': UserRole.RECRUITER,
    'x-company-id': 'company-1',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RecruiterApplicationController, RecruiterJobApplicationRankingsController],
      providers: [
        ApplicationService,
        { provide: ReviewWorkspaceService, useValue: {} },
        { provide: ApplicationInternalClientService, useValue: client },
        { provide: ApplicationEventPublisher, useValue: {} },
        { provide: getRepositoryToken(Application), useValue: repo },
        { provide: getRepositoryToken(ApplicationProgressEvent), useValue: {} },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    setupApp(app, { serviceName: 'application-test', swagger: false });
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(application);
    client.getLatestApplicationMatchResult.mockResolvedValue(null);
    client.getJobApplicationSnapshot.mockResolvedValue({
      id: jobId,
      companyId: headers['x-company-id'],
    });
    repo.find.mockResolvedValue([]);
  });
  afterAll(async () => {
    await app?.close();
  });
  it('returns the standard data:null envelope for no result', async () => {
    const response = await request(app.getHttpServer()).get(url).set(headers).expect(200);
    expect(response.body).toEqual({ success: true, data: null });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id, companyId: 'company-1' } });
  });
  it('returns exactly the allowlist including request correlation', async () => {
    client.getLatestApplicationMatchResult.mockResolvedValue({
      ...application,
      applicationId: id,
      id: 'result-1',
      matchRequestId: 'prior-request',
      status: 'SUCCEEDED',
      scoringStatus: 'NOT_AVAILABLE',
      totalScore: null,
      matchLevel: null,
      createdAt: '2026-10-25T00:00:00Z',
      explanation: { private: 'hidden' },
      fullSnapshot: 'hidden',
    });
    const response = await request(app.getHttpServer()).get(url).set(headers).expect(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        schemaVersion: 'matching-status-v1',
        applicationId: id,
        jobId,
        candidateId: 'candidate-1',
        candidateCvId: 'cv-1',
        resultId: 'result-1',
        matchRequestId: 'prior-request',
        status: 'SUCCEEDED',
        createdAt: '2026-10-25T00:00:00Z',
        scoringStatus: 'NOT_AVAILABLE',
      },
    });
  });
  it('rejects missing authentication before upstream access', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
    expect(client.getLatestApplicationMatchResult).not.toHaveBeenCalled();
  });
  it('rejects the candidate role', async () => {
    await request(app.getHttpServer())
      .get(url)
      .set({ ...headers, 'x-user-role': UserRole.CANDIDATE })
      .expect(403);
    expect(client.getLatestApplicationMatchResult).not.toHaveBeenCalled();
  });
  it('hides foreign-company applications', async () => {
    repo.findOne.mockResolvedValue(null);
    await request(app.getHttpServer()).get(url).set(headers).expect(404);
    expect(client.getLatestApplicationMatchResult).not.toHaveBeenCalled();
  });
  it('rejects cross-application upstream results without exposing them', async () => {
    client.getLatestApplicationMatchResult.mockResolvedValue({
      applicationId: 'other',
      explanation: 'private',
    });
    const response = await request(app.getHttpServer()).get(url).set(headers).expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private');
  });

  it.each(['ranking-score', 'matching-evidence', 'ai2-demo', 'hr-review'])(
    'serves %s as a company-scoped GET',
    async (route) => {
      const path = `/api/v1/recruiter/applications/${id}/${route}`;
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set(headers)
        .expect(200, { success: true, data: null });
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id, companyId: headers['x-company-id'] },
      });
    },
  );

  it.each(['matching-requests', 'match'])(
    'accepts POST %s with the same request response',
    async (route) => {
      repo.findOne.mockResolvedValueOnce({ ...application, cvParseStatus: 'PARSING' });
      const response = await request(app.getHttpServer())
        .post(`/api/v1/recruiter/applications/${id}/${route}`)
        .set(headers)
        .expect(201);
      expect(response.body.data).toMatchObject({
        id: null,
        applicationId: id,
        requestType: 'RECRUITER_MANUAL',
      });
    },
  );

  it('requires a valid job ID and company ownership for job rankings', async () => {
    const path = `/api/v1/recruiter/jobs/${jobId}/application-rankings`;
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set({ ...headers, 'x-user-role': UserRole.CANDIDATE })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/recruiter/jobs/invalid/application-rankings')
      .set(headers)
      .expect(400);
    expect(client.getJobApplicationSnapshot).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .get(path)
      .set({ ...headers, 'x-company-id': 'another-company' })
      .expect(404);
    expect(repo.find).not.toHaveBeenCalled();
    const response = await request(app.getHttpServer()).get(path).set(headers).expect(200);
    expect(response.body.data).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'NEED_MORE_APPLICATIONS',
      requestedCount: 0,
    });
  });
});
