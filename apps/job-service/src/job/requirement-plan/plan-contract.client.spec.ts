import { HttpService } from '@nestjs/axios';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { PlanContractClient } from './plan-contract.client';

describe('PlanContractClient', () => {
  const post = jest.fn();
  const config = {
    get: (key: string, fallback?: unknown) =>
      ({
        'jobService.services.matchingService': 'http://matching:3007',
        'jobService.internalServiceToken': 'unit-secret',
      })[key] ?? fallback,
  };
  const client = new PlanContractClient(
    { post } as unknown as HttpService,
    config as ConfigService,
  );
  beforeEach(() => post.mockReset());

  it('uses the internal token and a bounded timeout', async () => {
    post.mockReturnValue(of({ data: { success: true, data: { status: 'DRAFT' } } }));
    await client.call('draft', { fixture: true });
    expect(post).toHaveBeenCalledWith(
      'http://matching:3007/api/v1/internal/jd-plans/draft',
      { fixture: true },
      { timeout: 5000, headers: { 'x-internal-service-token': 'unit-secret' } },
    );
  });
  it('maps source validation errors without leaking provider bodies', async () => {
    post.mockReturnValue(
      throwError(() => ({ isAxiosError: true, response: { status: 422, data: 'private text' } })),
    );
    await expect(client.call('validate', {})).rejects.toBeInstanceOf(BadRequestException);
  });
  it('does not retry validation calls or leak credentials when unavailable', async () => {
    post.mockReturnValue(throwError(() => new Error('unit-secret')));
    await expect(client.call('inspect', {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
