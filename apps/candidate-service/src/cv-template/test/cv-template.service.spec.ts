import { DataSource, Repository } from 'typeorm';
import { ERROR_CODES, UserRole } from '@nexhire/shared';

import { CandidateService } from '../../candidate/candidate.service';
import {
  CandidateCvParseStatus,
  CandidateCvSource,
  CvTemplateKey,
  CvTemplateSectionKey,
} from '../../candidate/entities/candidate.enum';
import { CvParsingClientService } from '../../cv-parsing-client/cv-parsing-client.service';
import { DocumentClientService } from '../../document-client/document-client.service';
import { CvTemplateService } from '../cv-template.service';
import { CandidateCvTemplate } from '../entities/cv-template.entity';

describe('CvTemplateService', () => {
  let service: CvTemplateService;
  let dataSource: { transaction: jest.Mock };
  let candidateService: { ensureProfileForUser: jest.Mock };
  let documentClientService: {
    createDownloadUrl: jest.Mock;
    deleteDocument: jest.Mock;
    uploadCandidateDocument: jest.Mock;
  };
  let cvParsingClientService: { parseTemplateFill: jest.Mock };
  let templateRepo: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const now = new Date('2026-07-22T10:00:00.000Z');
  const user = { id: 'user-1', role: UserRole.CANDIDATE };
  const profile = { id: 'candidate-1', userId: 'user-1' };
  const template = {
    id: 'template-1',
    candidateId: 'candidate-1',
    name: 'Backend CV',
    templateKey: CvTemplateKey.MODERN,
    sourceDocumentId: 'document-1',
    sourceCvId: null,
    sourceParseRequestId: 'parse-request-1',
    theme: {},
    layout: {
      sections: [
        { key: CvTemplateSectionKey.PROFILE, visible: true, sortOrder: 1 },
        { key: CvTemplateSectionKey.SKILLS, visible: true, sortOrder: 2 },
        { key: CvTemplateSectionKey.PROJECTS, visible: true, sortOrder: 3 },
      ],
    },
    contentSnapshot: {
      profile: { id: 'profile', fullName: 'Nguyen Minh Khoa', visible: true },
      skills: [
        { id: 'skill-1', name: 'NestJS', visible: true, sortOrder: 1 },
        { id: 'skill-2', name: 'PostgreSQL', visible: true, sortOrder: 2 },
      ],
      projects: [],
    },
    isDefault: false,
    lastExportedCvId: null,
    lastExportedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as unknown as CandidateCvTemplate;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback({
          create: jest.fn((_entity, payload) => payload),
          save: jest.fn((_entity, payload) =>
            Promise.resolve({
              ...payload,
              id: 'cv-export-1',
              createdAt: now,
              updatedAt: now,
            }),
          ),
          update: jest.fn().mockResolvedValue(undefined),
        }),
      ),
    };
    candidateService = {
      ensureProfileForUser: jest.fn().mockResolvedValue(profile),
    };
    documentClientService = {
      createDownloadUrl: jest.fn().mockResolvedValue({
        url: 'https://storage.local/download/source.pdf',
        expiresInSeconds: 900,
      }),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      uploadCandidateDocument: jest.fn().mockResolvedValue({
        id: 'document-1',
      }),
    };
    cvParsingClientService = {
      parseTemplateFill: jest.fn().mockResolvedValue({
        id: 'parse-result-1',
        parseRequestId: 'parse-request-1',
        candidateId: 'candidate-1',
        candidateCvId: null,
        documentId: 'document-1',
        normalizedPayload: {
          profile: {
            fullName: 'Nguyen Minh Khoa',
            headline: 'Backend Developer',
            summary: 'Build APIs',
          },
          skills: [{ name: 'NestJS' }],
          experiences: [],
          educations: [],
          certifications: [],
          projects: [{ name: 'NexHire', technologies: ['NestJS'] }],
        },
        profileApplied: false,
        createdAt: now.toISOString(),
      }),
    };
    templateRepo = {
      create: jest.fn((payload) => payload),
      find: jest.fn().mockResolvedValue([template]),
      findOne: jest.fn().mockResolvedValue(template),
      save: jest.fn((payload) =>
        Promise.resolve({
          ...payload,
          id: 'template-1',
          createdAt: now,
          updatedAt: now,
        }),
      ),
      update: jest.fn().mockResolvedValue(undefined),
    };
    service = new CvTemplateService(
      dataSource as unknown as DataSource,
      candidateService as unknown as CandidateService,
      documentClientService as unknown as DocumentClientService,
      cvParsingClientService as unknown as CvParsingClientService,
      templateRepo as unknown as Repository<CandidateCvTemplate>,
    );
  });

  it('creates a template from uploaded CV without applying profile or creating a CV library row', async () => {
    const result = await service.createFromCv(
      user,
      { templateKey: CvTemplateKey.MODERN, name: 'Backend CV' },
      {
        originalname: 'source.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('cv'),
      },
    );

    expect(documentClientService.uploadCandidateDocument).toHaveBeenCalledWith(
      user,
      'candidate-1',
      'CV',
      expect.objectContaining({ originalname: 'source.pdf' }),
    );
    expect(cvParsingClientService.parseTemplateFill).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        documentId: 'document-1',
        documentUrl: 'https://storage.local/download/source.pdf',
      }),
    );
    expect(result.sourceCvId).toBeNull();
    expect(result.sourceDocumentId).toBeNull();
    expect(result.sourceDocumentDeletedAt).toEqual(expect.any(Date));
    expect(result.sourceParseRequestId).toBe('parse-request-1');
    expect(documentClientService.deleteDocument).toHaveBeenCalledWith('document-1');
    expect((result.contentSnapshot.skills as Array<{ name: string }>)[0].name).toBe('NestJS');
  });

  it('keeps source document id and records cleanup error when source delete fails', async () => {
    documentClientService.deleteDocument.mockRejectedValueOnce(new Error('delete failed'));

    const result = await service.createFromCv(
      user,
      { templateKey: CvTemplateKey.MODERN },
      {
        originalname: 'source.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('cv'),
      },
    );

    expect(result.sourceDocumentId).toBe('document-1');
    expect(result.sourceDocumentDeletedAt).toBeNull();
    expect(result.sourceDocumentDeleteError).toBe('delete failed');
    expect(templateRepo.update).toHaveBeenCalledWith(
      'template-1',
      expect.objectContaining({
        sourceDocumentId: 'document-1',
        sourceDocumentDeletedAt: null,
        sourceDocumentDeleteError: 'delete failed',
      }),
    );
  });

  it('sorts existing sections and keeps omitted sections after provided keys', async () => {
    await service.sortSections(user, 'template-1', {
      sectionKeys: [CvTemplateSectionKey.PROJECTS, CvTemplateSectionKey.PROFILE],
    });

    expect(templateRepo.update).toHaveBeenCalledWith(
      'template-1',
      expect.objectContaining({
        layout: expect.objectContaining({
          sections: [
            { key: CvTemplateSectionKey.PROJECTS, visible: true, sortOrder: 1 },
            { key: CvTemplateSectionKey.PROFILE, visible: true, sortOrder: 2 },
            { key: CvTemplateSectionKey.SKILLS, visible: true, sortOrder: 3 },
          ],
        }),
      }),
    );
  });

  it('rejects duplicate section keys', async () => {
    await expect(
      service.sortSections(user, 'template-1', {
        sectionKeys: [CvTemplateSectionKey.SKILLS, CvTemplateSectionKey.SKILLS],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
      }),
    });
  });

  it('sorts items inside a list section', async () => {
    await service.sortItems(user, 'template-1', CvTemplateSectionKey.SKILLS, {
      itemIds: ['skill-2', 'skill-1'],
    });

    expect(templateRepo.update).toHaveBeenCalledWith(
      'template-1',
      expect.objectContaining({
        contentSnapshot: expect.objectContaining({
          skills: [
            expect.objectContaining({ id: 'skill-2', sortOrder: 1 }),
            expect.objectContaining({ id: 'skill-1', sortOrder: 2 }),
          ],
        }),
      }),
    );
  });

  it('exports a template into the candidate CV library', async () => {
    documentClientService.uploadCandidateDocument.mockResolvedValueOnce({ id: 'export-document-1' });

    const result = await service.exportMine(
      user,
      'template-1',
      { title: 'Exported CV', isDefault: true },
      {
        originalname: 'export.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('pdf'),
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'cv-export-1',
        documentId: 'export-document-1',
        title: 'Exported CV',
        isDefault: true,
        parseStatus: CandidateCvParseStatus.NOT_PARSED,
        source: CandidateCvSource.TEMPLATE_EXPORT,
        sourceTemplateId: 'template-1',
      }),
    );
  });
});
