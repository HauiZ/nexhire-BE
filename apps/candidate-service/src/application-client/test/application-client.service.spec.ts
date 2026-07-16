import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { HEADERS, UserRole } from '@nexhire/shared';
import { of } from 'rxjs';
import { ApplicationClientService } from '../application-client.service';

describe('ApplicationClientService', () => {
  let service: ApplicationClientService;
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    httpService = { get: jest.fn() };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'candidateService.services.applicationService': 'http://application',
          'candidateService.http.timeoutMs': 30000,
          'candidateService.internalServiceToken': 'internal-token',
        };
        return values[key] ?? fallback;
      }),
    };

    service = new ApplicationClientService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('requests CV document retention with internal identity headers', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          success: true,
          data: {
            documentId: 'document-1',
            canDelete: true,
            activeApplicationCount: 0,
            recentTerminalApplicationCount: 0,
            blockingStatus: null,
          },
        },
      }),
    );

    const terminalBefore = new Date('2026-01-01T00:00:00.000Z');
    const result = await service.getCvDocumentRetention('document-1', terminalBefore);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://application/api/v1/internal/applications/cv-documents/document-1/retention',
      expect.objectContaining({
        params: { terminalBefore: terminalBefore.toISOString() },
        headers: expect.objectContaining({
          [HEADERS.INTERNAL_SERVICE_TOKEN]: 'internal-token',
          [HEADERS.USER_ID]: 'candidate-service',
          [HEADERS.USER_ROLE]: UserRole.ADMIN,
        }),
      }),
    );
    expect(result.canDelete).toBe(true);
  });
});
