import { HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { HEADERS, UserRole } from '@nexhire/shared';
import { ApplicationInternalClientService } from '../application-internal-client.service';

describe('ApplicationInternalClientService', () => {
  let service: ApplicationInternalClientService;
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    httpService = { get: jest.fn() };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'applicationService.services.jobService': 'http://job-service:3004',
          'applicationService.services.documentStorageService': 'http://document-storage:3007',
          'applicationService.http.timeoutMs': 5000,
          'applicationService.internalServiceToken': 'internal-token',
        };
        return values[key] ?? fallback;
      }),
    };
    service = new ApplicationInternalClientService(
      httpService as any,
      configService as any,
      redis as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls upstream services with internal identity headers', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          success: true,
          data: {
            id: 'job-1',
            companyId: 'company-1',
            companyName: 'NexHire',
            companyLogoUrl: null,
            title: 'Backend Engineer',
            status: 'PUBLISHED',
            deadline: null,
            isApplyable: true,
          },
        },
      }),
    );

    const result = await service.getJobApplicationSnapshot('job-1');

    expect(httpService.get).toHaveBeenCalledWith(
      'http://job-service:3004/api/v1/internal/jobs/job-1/application-snapshot',
      expect.objectContaining({
        timeout: 5000,
        headers: expect.objectContaining({
          [HEADERS.INTERNAL_SERVICE_TOKEN]: 'internal-token',
          [HEADERS.USER_ID]: 'application-service',
          [HEADERS.USER_ROLE]: UserRole.ADMIN,
        }),
      }),
    );
    expect(result.id).toBe('job-1');
  });

  it('preserves upstream HTTP errors for user-facing invalid references', async () => {
    const upstreamError = new AxiosError('not found', undefined, undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: {} as any,
      data: { code: 'COMMON.NOT_FOUND', message: 'Job not found' },
    });
    httpService.get.mockReturnValue(throwError(() => upstreamError));

    await expect(service.getJobApplicationSnapshot('missing-job')).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(service.getJobApplicationSnapshot('missing-job')).rejects.toMatchObject({
      status: 404,
      response: { code: 'COMMON.NOT_FOUND', message: 'Job not found' },
    });
  });

  it('maps network failures to service unavailable', async () => {
    httpService.get.mockReturnValue(throwError(() => new AxiosError('timeout')));

    await expect(service.getJobApplicationSnapshot('job-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('caches document download URLs until shortly before expiry', async () => {
    const cachedPayload = {
      id: 'document-1',
      fileName: 'cv.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: 'https://storage.local/cv.pdf',
      expiresInSeconds: 3600,
    };
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(cachedPayload));
    httpService.get.mockReturnValue(
      of({
        data: {
          success: true,
          data: cachedPayload,
        },
      }),
    );

    await expect(service.getDocumentDownload('document-1')).resolves.toEqual(
      expect.objectContaining({ url: 'https://storage.local/cv.pdf' }),
    );
    await expect(service.getDocumentDownload('document-1')).resolves.toEqual(
      expect.objectContaining({ url: 'https://storage.local/cv.pdf' }),
    );

    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(httpService.get).toHaveBeenCalledWith(
      'http://document-storage:3007/api/v1/internal/documents/document-1/download-url',
      expect.any(Object),
    );
    expect(redis.set).toHaveBeenCalledWith(
      'application:document-download:document-1',
      expect.any(String),
      'EX',
      3540,
    );
  });

  it('uses cached document download URLs from Redis', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({
        id: 'document-1',
        fileName: 'cv.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        url: 'https://storage.local/cached-cv.pdf',
        expiresInSeconds: 3600,
      }),
    );

    await expect(service.getDocumentDownload('document-1')).resolves.toEqual(
      expect.objectContaining({ url: 'https://storage.local/cached-cv.pdf' }),
    );

    expect(httpService.get).not.toHaveBeenCalled();
  });
});
