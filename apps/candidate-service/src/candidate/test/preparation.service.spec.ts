import { of, throwError } from 'rxjs';
import { PreparationService } from '../preparation.service';
import { CandidateService } from '../candidate.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

describe('Private candidate preparation', () => {
  const owned = { candidateId: 'candidate', cvDocumentId: 'document' };
  const candidates = { getPreparationSource: jest.fn() };
  const http = { get: jest.fn(), post: jest.fn() };
  const config = {
    get: (key: string) => (key.endsWith('internalServiceToken') ? 'test-only' : 'http://fixture'),
  };
  const service = new PreparationService(
    candidates as unknown as CandidateService,
    http as unknown as HttpService,
    config as unknown as ConfigService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    candidates.getPreparationSource.mockResolvedValue(owned);
    http.get.mockImplementation((url: string) =>
      of({
        data: {
          success: true,
          data: url.includes('latest-result')
            ? {
                candidateId: 'candidate',
                candidateCvId: 'cv',
                documentId: 'document',
                normalizedPayload: { skills: [] },
              }
            : { id: 'job', title: 'Backend', requirements: 'SQL', skills: [] },
        },
      }),
    );
    http.post.mockReturnValue(
      of({
        data: {
          success: true,
          data: {
            status: 'READY',
            jobSnapshotSha256: 'a'.repeat(64),
            cvSnapshotSha256: 'b'.repeat(64),
            requirements: [{ requirement: 'SQL', status: 'NO_REFERENCE_FOUND', evidence: [] }],
            warnings: [],
            schemaVersion: 'candidate-preparation-v1',
            jobId: 'job',
            candidateCvId: 'cv',
            private: true,
            applicationCreated: false,
            candidateSupportVerified: false,
          },
        },
      }),
    );
  });
  it('owner-verified selected parse feeds private matching, never HR/application endpoints', async () => {
    await service.prepare('user', 'job', 'cv');
    expect(candidates.getPreparationSource).toHaveBeenCalledWith('user', 'cv');
    expect(http.get.mock.calls[0][0]).toBe('http://fixture/api/v1/jobs/job');
    expect(http.get.mock.calls[1][1].headers).toEqual({
      'x-internal-service-token': 'test-only',
      'x-user-id': 'user',
      'x-user-role': 'CANDIDATE',
    });
    expect(http.post.mock.calls[0][0]).toBe('http://fixture/api/v1/internal/candidate-preparation');
    expect(http.post.mock.calls[0][1].parsed_resume).toEqual({ skills: [] });
  });
  it('reports model input bounds as validation rather than availability', async () => {
    http.post.mockReturnValue(throwError(() => ({ response: { status: 422 } })));
    await expect(service.prepare('user', 'job', 'cv')).rejects.toThrow(
      'exceeds preparation bounds',
    );
  });
  it('fails closed on malformed model output', async () => {
    http.post.mockReturnValue(of({ data: { success: true, data: { private: false } } }));
    await expect(service.prepare('user', 'job', 'cv')).rejects.toThrow('Preparation unavailable');
  });
  it('denies foreign CV before dependency lookups', async () => {
    candidates.getPreparationSource.mockRejectedValue(new Error('not owned'));
    await expect(service.prepare('foreign', 'job', 'cv')).rejects.toThrow();
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
  it('rejects a parse result belonging to another CV or document', async () => {
    http.get.mockImplementation((url: string) =>
      of({
        data: {
          success: true,
          data: url.includes('latest-result')
            ? {
                candidateId: 'candidate',
                candidateCvId: 'other',
                documentId: 'document',
                normalizedPayload: {},
              }
            : { id: 'job' },
        },
      }),
    );
    await expect(service.prepare('user', 'job', 'cv')).rejects.toThrow('binding');
    expect(http.post).not.toHaveBeenCalled();
  });
  it.each([404, 403, 500])(
    'distinguishes saved parse failures (HTTP %s) from public job failures',
    async (status) => {
      const original = http.get.getMockImplementation()!;
      http.get.mockImplementation((url: string) =>
        url.includes('latest-result')
          ? throwError(() => ({ response: { status } }))
          : original(url),
      );
      try {
        await service.prepare('user', 'job', 'cv');
        throw new Error('Expected preparation failure');
      } catch (error) {
        expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({
          code:
            status === 404
              ? 'CANDIDATE.PREPARATION_PARSE_MISSING'
              : 'CANDIDATE.PREPARATION_PARSE_UNAVAILABLE',
        });
      }
      expect(http.post).not.toHaveBeenCalled();
    },
  );
  it('refuses unavailable public jobs without falling back to internal snapshots', async () => {
    http.get.mockReturnValue(throwError(() => new Error('not public')));
    await expect(service.prepare('user', 'job', 'cv')).rejects.toThrow('Public job');
    expect(http.post).not.toHaveBeenCalled();
  });
});
