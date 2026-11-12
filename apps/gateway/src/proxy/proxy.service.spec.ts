import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { HEADERS } from '@nexhire/shared';
import { Request, Response } from 'express';
import { of } from 'rxjs';
import { ProxyService } from './proxy.service';

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
