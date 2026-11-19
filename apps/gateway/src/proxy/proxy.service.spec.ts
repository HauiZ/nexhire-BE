import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { HEADERS } from '@nexhire/shared';
import { Request, Response } from 'express';
import { of } from 'rxjs';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';
import { PATH_METADATA } from '@nestjs/common/constants';

describe('Candidate preparation gateway forwarding', () => {
  it.each([
    ['/api/v1/candidates/me/cvs/cv/jobs/job/preparation', 'POST', 85000],
    ['/api/v1/candidates/me/cvs/cv/jobs/job/preparation', 'GET', 5000],
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
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
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
