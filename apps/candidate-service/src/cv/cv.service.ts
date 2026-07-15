import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';

import { CandidateService } from '../candidate/candidate.service';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import { CandidateCvParseStatus } from '../candidate/entities/candidate.enum';
import { DocumentClientService } from '../document-client/document-client.service';
import {
  CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES,
  CANDIDATE_CV_MIME_TYPES,
} from '../document-client/document-upload.constants';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';
import { CandidateCvResponseDto } from './dto/cv-response.dto';
import { UploadCvDto } from './dto/upload-cv.dto';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ParseRequestResponse {
  id: string;
  candidateId: string;
  candidateCvId: string;
  documentId: string;
  status: string;
}

const FAILED_PARSE_STATUS = 'FAILED';

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly candidateService: CandidateService,
    private readonly documentClientService: DocumentClientService,
    @InjectRepository(CandidateCv)
    private readonly cvRepo: Repository<CandidateCv>,
  ) {}

  async uploadCv(
    user: AuthUser,
    dto: UploadCvDto,
    file?: CandidateUploadedFile,
  ): Promise<CandidateCvResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'CV file is required',
      });
    }
    this.assertUploadedFile(file);

    const profile = await this.candidateService.ensureProfileForUser(user.id);
    const document = await this.documentClientService.uploadCandidateDocument(
      user,
      profile.id,
      'CV',
      file,
    );
    const shouldSetDefault =
      dto.isDefault ?? (await this.cvRepo.count({ where: { candidateId: profile.id } })) === 0;

    if (shouldSetDefault) {
      await this.cvRepo.update({ candidateId: profile.id, isDefault: true }, { isDefault: false });
    }

    const cv = await this.cvRepo.save(
      this.cvRepo.create({
        candidateId: profile.id,
        documentId: document.id,
        title: this.resolveCvTitle(dto.title, file.originalname),
        isDefault: shouldSetDefault,
        parseStatus: CandidateCvParseStatus.PARSING,
        parsedAt: null,
      }),
    );

    try {
      const parseRequest = await this.triggerCvParsing(
        user,
        profile.id,
        cv.id,
        document.id,
        document.url,
      );

      if (parseRequest.status === FAILED_PARSE_STATUS) {
        await this.cvRepo.update(cv.id, { parseStatus: CandidateCvParseStatus.FAILED });
        return this.mapCv({ ...cv, parseStatus: CandidateCvParseStatus.FAILED });
      }
    } catch (error) {
      await this.cvRepo.update(cv.id, { parseStatus: CandidateCvParseStatus.FAILED });
      this.logger.error(
        `Failed to trigger CV parsing for candidateCvId=${cv.id}: ${(error as Error).message}`,
      );
      return this.mapCv({ ...cv, parseStatus: CandidateCvParseStatus.FAILED });
    }

    const latestCv = await this.cvRepo.findOne({ where: { id: cv.id } });
    return this.mapCv(latestCv ?? cv);
  }

  private async triggerCvParsing(
    user: AuthUser,
    candidateId: string,
    candidateCvId: string,
    documentId: string,
    documentUrl: string,
  ): Promise<ParseRequestResponse> {
    const baseUrl = this.configService.get<string>('candidateService.services.cvParsingService');
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<ApiEnvelope<ParseRequestResponse>>(
          `${baseUrl}/api/v1/cv-parsing/parse`,
          {
            candidateId,
            requestedByUserId: user.id,
            candidateCvId,
            documentId,
            documentUrl,
            context: 'PROFILE_UPDATE',
          },
          {
            timeout,
            headers: {
              ...this.buildIdentityHeaders(user),
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      throw this.externalServiceUnavailable('CV parsing trigger failed', error);
    }
  }

  private buildIdentityHeaders(user: AuthUser): Record<string, string> {
    return {
      [HEADERS.USER_ID]: user.id,
      [HEADERS.USER_ROLE]: user.role ?? UserRole.CANDIDATE,
      ...(user.companyId ? { [HEADERS.COMPANY_ID]: user.companyId } : {}),
    };
  }

  private externalServiceUnavailable(message: string, error: unknown): ServiceUnavailableException {
    const detail = error instanceof AxiosError ? error.message : String(error);
    this.logger.error(`${message}: ${detail}`);
    return new ServiceUnavailableException({
      code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
      message,
    });
  }

  private resolveCvTitle(title: string | undefined, fileName: string): string | null {
    const trimmedTitle = title?.trim();
    if (trimmedTitle) {
      return trimmedTitle;
    }
    const trimmedFileName = fileName.trim();
    return trimmedFileName || null;
  }

  private assertUploadedFile(file: CandidateUploadedFile): void {
    if (!CANDIDATE_CV_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
        message: 'Unsupported CV file type',
      });
    }
    if (file.size > CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_TOO_LARGE,
        message: 'CV file is too large',
      });
    }
  }

  private mapCv(cv: CandidateCv): CandidateCvResponseDto {
    return {
      id: cv.id,
      documentId: cv.documentId,
      title: cv.title,
      isDefault: cv.isDefault,
      parseStatus: cv.parseStatus,
      parsedAt: cv.parsedAt,
      createdAt: cv.createdAt,
      updatedAt: cv.updatedAt,
    };
  }
}
