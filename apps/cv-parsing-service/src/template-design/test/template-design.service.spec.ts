import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AuthUser, ERROR_CODES, UserRole } from '@nexhire/shared';

import { CvParseRequestStatus } from '../../cv-parsing/entities/cv-parsing.enum';
import { CanvasSanitizerService } from '../canvas-sanitizer.service';
import {
  TemplateDesignDocumentClient,
  TemplateSourceFile,
} from '../document-client/document-client.service';
import { CvTemplateDesignJob } from '../entities/cv-template-design-job.entity';
import { OpenAiTemplateDesignClient } from '../openai-template-design.client';
import { PdfCanvasLayoutExtractorService } from '../pdf-canvas-layout-extractor.service';
import { TemplateDesignService } from '../template-design.service';

const CONFIG: Record<string, unknown> = {
  'cvParsingService.templateDesign.jobTimeoutMs': 300000,
  'cvParsingService.persistRawPayload': false,
};

const admin = (): AuthUser => ({ id: 'admin-1', role: UserRole.ADMIN }) as AuthUser;

const pdfFile = (over: Partial<TemplateSourceFile> = {}): TemplateSourceFile => ({
  buffer: Buffer.from('%PDF-1.7'),
  originalname: 'mau-cv.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  ...over,
});

const job = (over: Partial<CvTemplateDesignJob> = {}): CvTemplateDesignJob =>
  ({
    id: 'job-1',
    createdByUserId: 'admin-1',
    documentId: 'doc-1',
    sourceFileName: 'mau-cv.pdf',
    status: CvParseRequestStatus.QUEUED,
    canvas: null,
    parsedResume: null,
    sanitizeReport: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  }) as CvTemplateDesignJob;

const parsedResume = () => ({
  profile: { fullName: 'A' },
  skills: [],
  experiences: [],
  educations: [],
  certifications: [],
  projects: [],
});

const sanitized = () => ({
  canvas: { id: 'template-k', name: 'k', pageSize: { width: 794, height: 1123 }, pages: [] },
  report: { elementsReturned: 10, elementsKept: 9 },
});

describe('TemplateDesignService', () => {
  let service: TemplateDesignService;
  let repository: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let documentClient: { uploadSourcePdf: jest.Mock; createDownloadUrl: jest.Mock };
  let designClient: {
    fetchDocument: jest.Mock;
    extractResume: jest.Mock;
    designCanvas: jest.Mock;
    resolveModel: jest.Mock;
  };
  let pdfLayoutExtractor: { extract: jest.Mock };
  let sanitizer: { sanitize: jest.Mock };

  // Service mutate cùng một entity rồi save lại nhiều lần (cách dùng TypeORM chuẩn),
  // nên phải chụp ảnh tại thời điểm gọi — đọc mock.calls sẽ thấy trạng thái cuối cùng.
  let saveSnapshots: Array<Record<string, unknown>>;
  const savedWith = (index = 0) => saveSnapshots[index];
  const lastSaved = () => saveSnapshots.at(-1)!;

  beforeEach(() => {
    // Các test đường lỗi cố tình kích hoạt logger.error — giữ output test sạch.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    saveSnapshots = [];
    repository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => {
        saveSnapshots.push({ ...input });
        return { id: 'job-1', ...input };
      }),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    documentClient = {
      uploadSourcePdf: jest
        .fn()
        .mockResolvedValue({ id: 'doc-1', url: 'https://s/u', fileName: 'mau-cv.pdf' }),
      createDownloadUrl: jest.fn().mockResolvedValue('https://s/presigned'),
    };
    designClient = {
      fetchDocument: jest
        .fn()
        .mockResolvedValue({ data: Buffer.from('x'), mimeType: 'application/pdf' }),
      extractResume: jest
        .fn()
        .mockResolvedValue({ rawPayload: { a: 1 }, parsedResume: parsedResume() }),
      designCanvas: jest.fn().mockResolvedValue({ rawPayload: { b: 2 }, design: { pages: [] } }),
      resolveModel: jest.fn().mockResolvedValue('gpt-4o'),
    };
    pdfLayoutExtractor = {
      extract: jest
        .fn()
        .mockResolvedValue({ rawPayload: { source: 'pdftohtml' }, design: { pages: [] } }),
    };
    sanitizer = { sanitize: jest.fn().mockReturnValue(sanitized()) };

    service = new TemplateDesignService(
      repository as unknown as Repository<CvTemplateDesignJob>,
      documentClient as unknown as TemplateDesignDocumentClient,
      designClient as unknown as OpenAiTemplateDesignClient,
      pdfLayoutExtractor as unknown as PdfCanvasLayoutExtractorService,
      sanitizer as unknown as CanvasSanitizerService,
      {
        get: jest.fn((key: string, fallback?: unknown) => CONFIG[key] ?? fallback),
      } as unknown as ConfigService,
    );
  });

  describe('createJob — kiểm tra tệp đầu vào', () => {
    beforeEach(() => {
      jest.spyOn(service, 'process').mockResolvedValue();
    });

    it('từ chối khi không có tệp', async () => {
      await expect(service.createJob(admin(), undefined)).rejects.toMatchObject({
        response: { code: ERROR_CODES.DOCUMENT.FILE_REQUIRED },
      });
    });

    it('từ chối tệp không phải PDF', async () => {
      await expect(
        service.createJob(admin(), pdfFile({ mimetype: 'image/png' })),
      ).rejects.toMatchObject({
        response: { code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE },
      });
    });

    it('từ chối tệp lớn hơn 10MB', async () => {
      await expect(
        service.createJob(admin(), pdfFile({ size: 10 * 1024 * 1024 + 1 })),
      ).rejects.toMatchObject({
        response: { code: ERROR_CODES.DOCUMENT.FILE_TOO_LARGE },
      });
    });

    it('không tải tệp hỏng lên document storage', async () => {
      await expect(
        service.createJob(admin(), pdfFile({ mimetype: 'text/plain' })),
      ).rejects.toBeDefined();

      expect(documentClient.uploadSourcePdf).not.toHaveBeenCalled();
    });
  });

  describe('createJob — tạo job', () => {
    beforeEach(() => {
      jest.spyOn(service, 'process').mockResolvedValue();
    });

    it('tải PDF lên rồi lưu job trạng thái QUEUED', async () => {
      const created = await service.createJob(admin(), pdfFile());

      expect(documentClient.uploadSourcePdf).toHaveBeenCalledWith(admin(), pdfFile());
      expect(savedWith()).toMatchObject({
        createdByUserId: 'admin-1',
        documentId: 'doc-1',
        sourceFileName: 'mau-cv.pdf',
        status: CvParseRequestStatus.QUEUED,
      });
      expect(created.status).toBe(CvParseRequestStatus.QUEUED);
    });

    it('trả về ngay mà không chờ xử lý xong', async () => {
      const processing = service.process as jest.Mock;
      let resolveProcess: () => void = () => {};
      processing.mockReturnValue(new Promise<void>((r) => (resolveProcess = r)));

      const created = await service.createJob(admin(), pdfFile());

      expect(created.status).toBe(CvParseRequestStatus.QUEUED);
      expect(processing).toHaveBeenCalledWith('job-1');
      resolveProcess();
    });

    it('không làm hỏng request khi xử lý nền ném lỗi', async () => {
      (service.process as jest.Mock).mockRejectedValue(new Error('boom'));

      await expect(service.createJob(admin(), pdfFile())).resolves.toBeDefined();
    });
  });

  describe('process — đường đi thành công', () => {
    beforeEach(() => {
      repository.findOne.mockResolvedValue(job());
    });

    it('đánh dấu PROCESSING kèm startedAt trước khi gọi provider', async () => {
      await service.process('job-1');

      expect(savedWith(0)).toMatchObject({ status: CvParseRequestStatus.PROCESSING });
      expect(savedWith(0).startedAt).toBeInstanceOf(Date);
    });

    it('xin URL tải mới thay vì dùng lại URL cũ đã hết hạn', async () => {
      await service.process('job-1');

      expect(documentClient.createDownloadUrl).toHaveBeenCalledWith(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
        },
        'doc-1',
      );
      expect(designClient.fetchDocument).toHaveBeenCalledWith('https://s/presigned');
    });

    it('gọi trích dữ liệu trước rồi mới trích layout PDF', async () => {
      await service.process('job-1');

      const extractOrder = designClient.extractResume.mock.invocationCallOrder[0];
      const layoutOrder = pdfLayoutExtractor.extract.mock.invocationCallOrder[0];
      expect(extractOrder).toBeLessThan(layoutOrder);
    });

    it('đưa ParsedResume của lệnh gọi #1 vào bước trích layout PDF', async () => {
      await service.process('job-1');

      expect(pdfLayoutExtractor.extract).toHaveBeenCalledWith(expect.anything(), parsedResume());
    });

    it('không gọi AI layout khi Poppler trích được layout PDF', async () => {
      await service.process('job-1');

      expect(designClient.designCanvas).not.toHaveBeenCalled();
    });

    it('lưu canvas, parsedResume, report và model đã dùng khi thành công', async () => {
      await service.process('job-1');

      expect(lastSaved()).toMatchObject({
        status: CvParseRequestStatus.SUCCEEDED,
        canvas: sanitized().canvas,
        parsedResume: parsedResume(),
        sanitizeReport: sanitized().report,
        providerVersion: 'gpt-4o',
        errorCode: null,
      });
      expect(lastSaved().finishedAt).toBeInstanceOf(Date);
    });

    it('vẫn dựng canvas bằng Poppler khi AI parse resume lỗi', async () => {
      designClient.extractResume.mockRejectedValue(
        new ServiceUnavailableException({
          code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
          message: 'model unavailable',
        }),
      );

      await service.process('job-1');

      expect(pdfLayoutExtractor.extract).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          profile: {},
          skills: [],
          experiences: [],
          educations: [],
          certifications: [],
          projects: [],
        }),
      );
      expect(lastSaved()).toMatchObject({
        status: CvParseRequestStatus.SUCCEEDED,
        parsedResume: {
          profile: {},
          skills: [],
          experiences: [],
          educations: [],
          certifications: [],
          projects: [],
        },
        errorCode: null,
      });
    });

    it('không lưu payload thô khi chưa bật cờ persist', async () => {
      await service.process('job-1');

      expect(lastSaved().rawProviderPayload).toBeNull();
    });

    it('lưu payload thô khi đã bật cờ persist', async () => {
      (service as unknown as { configService: ConfigService }).configService.get = jest.fn(
        (key: string, fallback?: unknown) =>
          key === 'cvParsingService.persistRawPayload' ? true : (CONFIG[key] ?? fallback),
      ) as never;

      await service.process('job-1');

      expect(lastSaved().rawProviderPayload).toEqual({
        resume: { a: 1 },
        design: { source: 'pdftohtml' },
      });
    });
  });

  describe('process — đường đi lỗi', () => {
    beforeEach(() => {
      repository.findOne.mockResolvedValue(job());
    });

    it('ghi FAILED kèm mã lỗi khi không tải được PDF nguồn', async () => {
      designClient.fetchDocument.mockRejectedValue(
        new ServiceUnavailableException({
          code: ERROR_CODES.TEMPLATE_DESIGN.OUTPUT_TRUNCATED,
          message: 'cut off',
        }),
      );

      await service.process('job-1');

      expect(lastSaved()).toMatchObject({
        status: CvParseRequestStatus.FAILED,
        errorCode: ERROR_CODES.TEMPLATE_DESIGN.OUTPUT_TRUNCATED,
        errorMessage: 'cut off',
      });
      expect(lastSaved().finishedAt).toBeInstanceOf(Date);
    });

    it('ghi FAILED khi không trích được layout PDF và không fallback sang AI layout', async () => {
      pdfLayoutExtractor.extract.mockResolvedValue(null);

      await service.process('job-1');

      expect(designClient.designCanvas).not.toHaveBeenCalled();
      expect(lastSaved()).toMatchObject({
        status: CvParseRequestStatus.FAILED,
        errorCode: ERROR_CODES.TEMPLATE_DESIGN.LAYOUT_EXTRACTION_FAILED,
        errorMessage: 'PDF layout extraction is unavailable',
      });
    });

    it('ghi FAILED với CANVAS_INVALID khi sanitizer loại hết element', async () => {
      sanitizer.sanitize.mockImplementation(() => {
        throw new UnprocessableEntityException({
          code: ERROR_CODES.TEMPLATE_DESIGN.CANVAS_INVALID,
          message: 'empty',
        });
      });

      await service.process('job-1');

      expect(lastSaved()).toMatchObject({
        status: CvParseRequestStatus.FAILED,
        errorCode: ERROR_CODES.TEMPLATE_DESIGN.CANVAS_INVALID,
      });
    });

    it('không ném ra ngoài vì chạy nền, chỉ ghi vào job', async () => {
      pdfLayoutExtractor.extract.mockRejectedValue(new Error('mạng chập chờn'));

      await expect(service.process('job-1')).resolves.toBeUndefined();
      expect(lastSaved().status).toBe(CvParseRequestStatus.FAILED);
    });

    it('dùng mã lỗi chung cho lỗi không có code', async () => {
      pdfLayoutExtractor.extract.mockRejectedValue(new Error('mạng chập chờn'));

      await service.process('job-1');

      expect(lastSaved().errorCode).toBe(ERROR_CODES.AI.SERVICE_UNAVAILABLE);
    });

    it('bỏ qua khi job đã biến mất', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.process('job-1')).resolves.toBeUndefined();
      expect(designClient.extractResume).not.toHaveBeenCalled();
    });
  });

  describe('getJob — reaper lười', () => {
    it('ném JOB_NOT_FOUND khi không có job', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.getJob('nope')).rejects.toMatchObject({
        response: { code: ERROR_CODES.TEMPLATE_DESIGN.JOB_NOT_FOUND },
      });
    });

    it('lật job PROCESSING quá hạn thành FAILED', async () => {
      repository.findOne.mockResolvedValue(
        job({
          status: CvParseRequestStatus.PROCESSING,
          startedAt: new Date(Date.now() - 400000),
        }),
      );

      const result = await service.getJob('job-1');

      expect(result.status).toBe(CvParseRequestStatus.FAILED);
      expect(result.errorCode).toBe(ERROR_CODES.AI.SERVICE_UNAVAILABLE);
      expect(repository.save).toHaveBeenCalled();
    });

    it('để yên job PROCESSING còn trong hạn', async () => {
      repository.findOne.mockResolvedValue(
        job({
          status: CvParseRequestStatus.PROCESSING,
          startedAt: new Date(Date.now() - 10000),
        }),
      );

      const result = await service.getJob('job-1');

      expect(result.status).toBe(CvParseRequestStatus.PROCESSING);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('để yên job đã SUCCEEDED dù tạo từ lâu', async () => {
      repository.findOne.mockResolvedValue(
        job({
          status: CvParseRequestStatus.SUCCEEDED,
          startedAt: new Date(Date.now() - 999999),
        }),
      );

      const result = await service.getJob('job-1');

      expect(result.status).toBe(CvParseRequestStatus.SUCCEEDED);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
