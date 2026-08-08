import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthUser, ERROR_CODES, type ParsedResume, UserRole } from '@nexhire/shared';

import { CvParseProvider, CvParseRequestStatus } from '../cv-parsing/entities/cv-parsing.enum';
import { CanvasSanitizerService } from './canvas-sanitizer.service';
import {
  TemplateDesignDocumentClient,
  TemplateSourceFile,
} from './document-client/document-client.service';
import { CvTemplateDesignJob } from './entities/cv-template-design-job.entity';
import { OpenAiTemplateDesignClient } from './openai-template-design.client';
import { PdfCanvasLayoutExtractorService } from './pdf-canvas-layout-extractor.service';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const SOURCE_MIME_TYPES = new Set(['application/pdf']);

@Injectable()
export class TemplateDesignService {
  private readonly logger = new Logger(TemplateDesignService.name);

  constructor(
    @InjectRepository(CvTemplateDesignJob)
    private readonly jobRepository: Repository<CvTemplateDesignJob>,
    private readonly documentClient: TemplateDesignDocumentClient,
    private readonly designClient: OpenAiTemplateDesignClient,
    private readonly pdfLayoutExtractor: PdfCanvasLayoutExtractorService,
    private readonly sanitizer: CanvasSanitizerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Trả 202 ngay rồi xử lý nền. Đây là lý do tính năng sống được dưới timeout 30s
   * mà gateway áp riêng cho cvParsingService.
   */
  async createJob(user: AuthUser, file?: TemplateSourceFile): Promise<CvTemplateDesignJob> {
    this.assertUsableFile(file);

    const document = await this.documentClient.uploadSourcePdf(user, file!);

    const job = await this.jobRepository.save(
      this.jobRepository.create({
        createdByUserId: user.id,
        documentId: document.id,
        sourceFileName: file!.originalname,
        status: CvParseRequestStatus.QUEUED,
        provider: CvParseProvider.OPENAI,
      }),
    );

    void this.process(job.id).catch((error: unknown) => {
      this.logger.error(`Template design job ${job.id} crashed: ${String(error)}`);
    });

    return job;
  }

  async getJob(id: string): Promise<CvTemplateDesignJob> {
    const job = await this.jobRepository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException({
        code: ERROR_CODES.TEMPLATE_DESIGN.JOB_NOT_FOUND,
        message: 'Template design job not found',
      });
    }

    return this.reapIfStale(job);
  }

  /**
   * Reaper lười: process chết giữa chừng thì job kẹt PROCESSING mãi. Không dựng cron
   * cho một tính năng chạy tay — vì FE luôn poll nên chính lượt poll dọn hộ.
   */
  private async reapIfStale(job: CvTemplateDesignJob): Promise<CvTemplateDesignJob> {
    if (job.status !== CvParseRequestStatus.PROCESSING) {
      return job;
    }

    const timeoutMs = this.configService.get<number>(
      'cvParsingService.templateDesign.jobTimeoutMs',
      300000,
    );
    const startedAt = job.startedAt?.getTime() ?? 0;
    if (Date.now() - startedAt < timeoutMs) {
      return job;
    }

    job.status = CvParseRequestStatus.FAILED;
    job.errorCode = ERROR_CODES.AI.SERVICE_UNAVAILABLE;
    job.errorMessage = 'Template design job timed out';
    job.finishedAt = new Date();

    return this.jobRepository.save(job);
  }

  async process(jobId: string): Promise<void> {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`Template design job ${jobId} disappeared before processing`);
      return;
    }

    job.status = CvParseRequestStatus.PROCESSING;
    job.startedAt = new Date();
    await this.jobRepository.save(job);

    try {
      // URL presign chỉ sống 1h nên phải xin lại, không dùng lại URL lúc upload.
      const documentUrl = await this.documentClient.createDownloadUrl(
        { id: job.createdByUserId, role: UserRole.ADMIN },
        job.documentId,
      );
      const document = await this.designClient.fetchDocument(documentUrl);

      // Tuần tự, không song song: binding dùng chỉ số, hai lệnh gọi độc lập có thể
      // sắp thứ tự kinh nghiệm khác nhau và làm binding trỏ nhầm ô.
      const resume = await this.extractResumeOrEmpty(document);
      const design = await this.pdfLayoutExtractor.extract(document, resume.parsedResume);
      if (!design) {
        throw new ServiceUnavailableException({
          code: ERROR_CODES.TEMPLATE_DESIGN.LAYOUT_EXTRACTION_FAILED,
          message: 'PDF layout extraction is unavailable',
        });
      }

      const { canvas, report } = this.sanitizer.sanitize(
        design.design,
        resume.parsedResume,
        this.canvasKey(job),
      );

      job.status = CvParseRequestStatus.SUCCEEDED;
      job.canvas = canvas;
      job.parsedResume = resume.parsedResume;
      job.sanitizeReport = report;
      job.providerVersion = await this.designClient.resolveModel();
      job.rawProviderPayload = this.shouldPersistRaw()
        ? { resume: resume.rawPayload, design: design.rawPayload }
        : null;
      job.errorCode = null;
      job.errorMessage = null;
      job.finishedAt = new Date();

      await this.jobRepository.save(job);
    } catch (error) {
      job.status = CvParseRequestStatus.FAILED;
      job.errorCode = this.errorCodeOf(error);
      job.errorMessage = this.errorMessageOf(error);
      job.finishedAt = new Date();

      this.logger.error(
        `Template design job ${jobId} failed: ${job.errorCode} ${job.errorMessage}`,
      );
      await this.jobRepository.save(job);
    }
  }

  private assertUsableFile(file?: TemplateSourceFile): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'A source PDF is required',
      });
    }

    if (!SOURCE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
        message: 'Only PDF files are supported',
      });
    }

    if (file.size > MAX_SOURCE_BYTES) {
      throw new PayloadTooLargeException({
        code: ERROR_CODES.DOCUMENT.FILE_TOO_LARGE,
        message: 'Source PDF must be 10MB or smaller',
      });
    }
  }

  /** Dùng làm tiền tố cho id element; admin đổi lại key thật khi lưu preset. */
  private canvasKey(job: CvTemplateDesignJob): string {
    return `ai-${job.id.slice(0, 8)}`;
  }

  private shouldPersistRaw(): boolean {
    return this.configService.get<boolean>('cvParsingService.persistRawPayload', false) === true;
  }

  private async extractResumeOrEmpty(document: {
    data: Buffer;
    mimeType: string;
  }): Promise<{ rawPayload: Record<string, unknown>; parsedResume: ParsedResume }> {
    try {
      return await this.designClient.extractResume(document);
    } catch (error) {
      this.logger.warn(
        `Template resume extraction failed; continuing with PDF layout only: ${this.errorCodeOf(error)} ${this.errorMessageOf(error)}`,
      );
      return {
        rawPayload: {
          source: 'empty_resume_fallback',
          errorCode: this.errorCodeOf(error),
          errorMessage: this.errorMessageOf(error),
        },
        parsedResume: {
          profile: {},
          skills: [],
          experiences: [],
          educations: [],
          certifications: [],
          projects: [],
        },
      };
    }
  }

  private errorCodeOf(error: unknown): string {
    const response = (error as { response?: { code?: string } })?.response;
    return response?.code ?? ERROR_CODES.AI.SERVICE_UNAVAILABLE;
  }

  private errorMessageOf(error: unknown): string {
    const response = (error as { response?: { message?: string } })?.response;
    if (response?.message) {
      return response.message;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
