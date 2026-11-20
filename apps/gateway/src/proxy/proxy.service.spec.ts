import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HEADERS } from '@nexhire/shared';
import { Request, Response } from 'express';
import { of } from 'rxjs';
import request from 'supertest';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';
import { PATH_METADATA } from '@nestjs/common/constants';

describe('Candidate preparation gateway forwarding', () => {
  it.each([
    ['/api/v1/candidates/me/cvs/cv/jobs/job/preparation', 'POST', 85000],
    ['/api/v1/candidates/me/cvs/cv/jobs/job/preparation', 'GET', 5000],
    ['/api/v1/candidates/me/cvs/cv/job-recommendations', 'GET', 40_000],
    ['/api/v1/candidates/me/cvs/cv/job-recommendations', 'POST', 5_000],
    ['/api/v1/candidates/me', 'GET', 5000],
  ])('uses route-specific budget for %s %s', async (route, method, timeout) => {
    const http = {
      request: jest.fn().mockReturnValue(of({ status: 200, data: { success: true } })),
    };
    const config = { get: jest.fn().mockReturnValue('http://candidate-fixture') };
    const service = new ProxyService(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
    const req = {
      path: route,
      originalUrl: route,
      method,
      headers: { 'x-user-id': 'spoofed' },
      user: { id: 'verified-user', role: 'CANDIDATE' },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
    await service.forward(
      'candidateService',
      req as unknown as Request,
      res as unknown as Response,
    );
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout,
        headers: expect.objectContaining({
          [HEADERS.USER_ID]: 'verified-user',
          [HEADERS.USER_ROLE]: 'CANDIDATE',
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    if (method === 'GET' && route.endsWith('/job-recommendations'))
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    else expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('Recruiter AI2 gateway forwarding', () => {
  it.each([
    ['applications/application/ranking-score', 'GET', 25_000],
    ['jobs/job/application-rankings', 'GET', 25_000],
    ['jobs/job/application-rankings/', 'GET', 25_000],
    ['applications/application/ai2-demo', 'GET', 25_000],
    ['applications/application/ai2-pool', 'GET', 25_000],
    ['applications/application/ai2-pool', 'POST', 5_000],
    ['applications/application/matching-status', 'GET', 5_000],
  ])('uses the upstream budget for %s %s', async (path, method, timeout) => {
    const http = { request: jest.fn().mockReturnValue(of({ status: 200, data: {} })) };
    const service = new ProxyService(
      http as never,
      { get: () => 'http://application-fixture' } as never,
    );
    const route = `/api/v1/recruiter/${path}`;
    await service.forward(
      'applicationService',
      { path: route, originalUrl: route, method, headers: {} } as Request,
      { status: jest.fn().mockReturnThis(), json: jest.fn() } as never,
    );
    expect(http.request).toHaveBeenCalledWith(expect.objectContaining({ timeout }));
  });

  it('routes job rankings to Application before the Job wildcard', async () => {
    const module = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        {
          provide: ProxyService,
          useValue: {
            forward: (service: string, _req: Request, res: Response) => res.json({ service }),
          },
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    try {
      await app.init();
      await request(app.getHttpServer())
        .get('/api/v1/recruiter/jobs/job/application-rankings')
        .expect(200, { service: 'applicationService' });
      await request(app.getHttpServer())
        .get('/api/v1/recruiter/jobs/job/requirement-plan')
        .expect(200, { service: 'jobService' });
    } finally {
      await app.close();
    }
  });
});

describe('Skill dictionary gateway ownership and identity forwarding (not JWT E2E)', () => {
  it.each(['adminSkillDictionaryRoot', 'adminSkillDictionary'] as const)(
    'routes %s to jobService only',
    async (handler) => {
      const proxy = { forward: jest.fn() };
      const controller = new ProxyController(proxy as never);
      const req = {} as Request;
      const res = {} as Response;
      controller[handler](req, res);
      expect(Reflect.getMetadata(PATH_METADATA, controller[handler])).toBe(
        handler.endsWith('Root') ? 'admin/skill-dictionary' : 'admin/skill-dictionary/*',
      );
      expect(proxy.forward).toHaveBeenCalledWith('jobService', req, res);
    },
  );
  it.each([true, false])(
    'forwards trusted request.user=%s; client identity headers never grant ADMIN',
    async (trusted) => {
      const http = { request: jest.fn().mockReturnValue(of({ status: 200, data: {} })) };
      const service = new ProxyService(http as never, { get: () => 'http://job-fixture' } as never);
      const req = {
        path: '/api/v1/admin/skill-dictionary',
        originalUrl: '/api/v1/admin/skill-dictionary',
        method: 'POST',
        headers: {
          'x-user-id': 'forged',
          'x-user-role': 'ADMIN',
          'x-company-id': 'forged-company',
        },
        ...(trusted ? { user: { id: 'verified-user', role: 'RECRUITER' } } : {}),
      };
      await service.forward(
        'jobService',
        req as never,
        { status: jest.fn().mockReturnThis(), json: jest.fn() } as never,
      );
      const headers = http.request.mock.calls[0][0].headers;
      expect(headers[HEADERS.USER_ID]).toBe(trusted ? 'verified-user' : undefined);
      expect(headers[HEADERS.USER_ROLE]).toBe(trusted ? 'RECRUITER' : undefined);
      expect(headers[HEADERS.COMPANY_ID]).toBeUndefined();
    },
  );
});

describe('Recruiter JD plan gateway forwarding', () => {
  it.each([
    ['/requirement-plan/drafts', 'POST', 35_000],
    ['/requirement-plan', 'GET', 35_000],
    ['/requirement-plan', 'PATCH', 65_000],
    ['/requirement-plan/confirm', 'POST', 65_000],
    ['/requirement-plan/history', 'GET', 5_000],
    ['/requirement-plan/drafts', 'GET', 5_000],
    ['', 'GET', 5_000],
  ])('uses the upstream budget for %s %s', async (suffix, method, timeout) => {
    const http = { request: jest.fn().mockReturnValue(of({ status: 200, data: {} })) };
    const service = new ProxyService(http as never, { get: () => 'http://job-fixture' } as never);
    const route = `/api/v1/recruiter/jobs/job${suffix}`;
    await service.forward(
      'jobService',
      { path: route, originalUrl: route, method, headers: {} } as Request,
      { status: jest.fn().mockReturnThis(), json: jest.fn() } as never,
    );
    expect(http.request).toHaveBeenCalledWith(expect.objectContaining({ timeout }));
  });
});
