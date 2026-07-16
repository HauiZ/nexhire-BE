import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { HEADERS, UserRole } from '@nexhire/shared';
import { of } from 'rxjs';
import { CvParsingClientService } from '../cv-parsing-client.service';

describe('CvParsingClientService', () => {
  let service: CvParsingClientService;
  let httpService: { post: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    httpService = { post: jest.fn() };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'candidateService.services.cvParsingService': 'http://cv-parsing',
          'candidateService.http.timeoutMs': 30000,
          'candidateService.internalServiceToken': 'internal-token',
        };
        return values[key] ?? fallback;
      }),
    };

    service = new CvParsingClientService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('creates a parse request with internal identity headers', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          success: true,
          data: {
            id: 'parse-request-1',
            candidateId: 'candidate-1',
            candidateCvId: 'cv-1',
            documentId: 'document-1',
            status: 'QUEUED',
          },
        },
      }),
    );

    const result = await service.createParseRequest({
      user: { id: 'user-1', role: UserRole.CANDIDATE },
      candidateId: 'candidate-1',
      candidateCvId: 'cv-1',
      documentId: 'document-1',
      documentUrl: 'https://storage.local/cv.pdf',
    });

    expect(httpService.post).toHaveBeenCalledWith(
      'http://cv-parsing/api/v1/cv-parsing/parse',
      expect.objectContaining({
        candidateId: 'candidate-1',
        requestedByUserId: 'user-1',
        candidateCvId: 'cv-1',
        documentId: 'document-1',
        documentUrl: 'https://storage.local/cv.pdf',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          [HEADERS.INTERNAL_SERVICE_TOKEN]: 'internal-token',
          [HEADERS.USER_ID]: 'user-1',
          [HEADERS.USER_ROLE]: UserRole.CANDIDATE,
        }),
      }),
    );
    expect(result.status).toBe('QUEUED');
  });
});
