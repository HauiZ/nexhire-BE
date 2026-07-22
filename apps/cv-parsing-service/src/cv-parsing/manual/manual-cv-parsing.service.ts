import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { ERROR_CODES } from '@nexhire/shared';

import { ManualGeminiCvParseResponseDto } from './dto/manual-gemini-cv-parse.dto';
import { GeminiResumeParserClient } from '../../gemini/gemini-resume-parser.client';

interface ManualUploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const MAX_MANUAL_CV_SIZE_BYTES = 10 * 1024 * 1024;
const MANUAL_CV_MIME_TYPES = new Set(['application/pdf']);

@Injectable()
export class ManualCvParsingService {
  constructor(private readonly geminiParserClient: GeminiResumeParserClient) {}

  async parseGeminiFile(file?: ManualUploadedFile): Promise<ManualGeminiCvParseResponseDto> {
    this.assertManualEndpointAllowed();
    this.assertUploadedFile(file);

    const result = await this.geminiParserClient.parseResumeFromBuffer(file.buffer, file.mimetype);
    return {
      message: 'Manual Gemini CV parse completed',
      normalizedPayload: result.normalizedPayload,
      rawProviderPayload: result.rawPayload,
    };
  }

  private assertManualEndpointAllowed(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Manual CV parsing endpoint is disabled in production',
      });
    }
  }

  private assertUploadedFile(file?: ManualUploadedFile): asserts file is ManualUploadedFile {
    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'CV file is required',
      });
    }

    if (!MANUAL_CV_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
        message: 'Manual Gemini CV parsing currently supports PDF files only',
      });
    }

    if (file.size > MAX_MANUAL_CV_SIZE_BYTES) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_TOO_LARGE,
        message: 'CV file is too large',
      });
    }
  }
}
