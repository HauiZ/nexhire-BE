import { Reflector } from '@nestjs/core';

import { AuthUser, ROLES_KEY, UserRole } from '@nexhire/shared';

import { CvParseProvider, CvParseRequestStatus } from '../../cv-parsing/entities/cv-parsing.enum';
import { AdminTemplateDesignController } from '../admin-template-design.controller';
import { TemplateSourceFile } from '../document-client/document-client.service';
import { CvTemplateDesignJob } from '../entities/cv-template-design-job.entity';
import { TemplateDesignService } from '../template-design.service';

const admin = (): AuthUser => ({ id: 'admin-1', role: UserRole.ADMIN }) as AuthUser;

const pdfFile = (): TemplateSourceFile => ({
  buffer: Buffer.from('%PDF'),
  originalname: 'mau-cv.pdf',
  mimetype: 'application/pdf',
  size: 512,
});

const job = (over: Partial<CvTemplateDesignJob> = {}): CvTemplateDesignJob =>
  ({
    id: 'job-1',
    createdByUserId: 'admin-1',
    documentId: 'doc-1',
    sourceFileName: 'mau-cv.pdf',
    status: CvParseRequestStatus.QUEUED,
    provider: CvParseProvider.OPENAI,
    providerVersion: null,
    canvas: null,
    parsedResume: null,
    rawProviderPayload: { secret: 'không được lộ ra API' },
    sanitizeReport: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-08-07T00:00:00Z'),
    updatedAt: new Date('2026-08-07T00:00:00Z'),
    ...over,
  }) as CvTemplateDesignJob;

describe('AdminTemplateDesignController', () => {
  let controller: AdminTemplateDesignController;
  let service: { createJob: jest.Mock; getJob: jest.Mock };

  beforeEach(() => {
    service = { createJob: jest.fn(), getJob: jest.fn() };
    controller = new AdminTemplateDesignController(
      service as unknown as TemplateDesignService,
    );
  });

  it('chỉ cho ADMIN gọi', () => {
    const roles = new Reflector().get<UserRole[]>(ROLES_KEY, AdminTemplateDesignController);

    expect(roles).toEqual([UserRole.ADMIN]);
  });

  describe('POST', () => {
    it('chuyển tệp và người gọi xuống service', async () => {
      service.createJob.mockResolvedValue(job());

      await controller.create(admin(), pdfFile());

      expect(service.createJob).toHaveBeenCalledWith(admin(), pdfFile());
    });

    it('trả về job vừa tạo ở trạng thái QUEUED', async () => {
      service.createJob.mockResolvedValue(job());

      const result = await controller.create(admin(), pdfFile());

      expect(result).toMatchObject({ id: 'job-1', status: CvParseRequestStatus.QUEUED });
    });

    it('chuyển tiếp trường hợp không có tệp cho service kiểm tra', async () => {
      service.createJob.mockResolvedValue(job());

      await controller.create(admin(), undefined);

      expect(service.createJob).toHaveBeenCalledWith(admin(), undefined);
    });
  });

  describe('GET :id', () => {
    it('trả về canvas và sanitizeReport khi job đã xong', async () => {
      const canvas = { id: 'c', name: 'c', pageSize: { width: 794, height: 1123 }, pages: [] };
      service.getJob.mockResolvedValue(
        job({
          status: CvParseRequestStatus.SUCCEEDED,
          canvas: canvas as never,
          sanitizeReport: { elementsKept: 9 } as never,
          providerVersion: 'gpt-4o',
        }),
      );

      const result = await controller.get('job-1');

      expect(result).toMatchObject({
        status: CvParseRequestStatus.SUCCEEDED,
        canvas,
        sanitizeReport: { elementsKept: 9 },
        providerVersion: 'gpt-4o',
      });
    });

    it('không để lọt rawProviderPayload ra response', async () => {
      service.getJob.mockResolvedValue(job());

      const result = await controller.get('job-1');

      expect(result).not.toHaveProperty('rawProviderPayload');
    });

    it('trả về mã lỗi khi job thất bại', async () => {
      service.getJob.mockResolvedValue(
        job({
          status: CvParseRequestStatus.FAILED,
          errorCode: 'TEMPLATE_DESIGN.OUTPUT_TRUNCATED',
          errorMessage: 'cut off',
        }),
      );

      const result = await controller.get('job-1');

      expect(result).toMatchObject({
        status: CvParseRequestStatus.FAILED,
        errorCode: 'TEMPLATE_DESIGN.OUTPUT_TRUNCATED',
      });
    });
  });
});
