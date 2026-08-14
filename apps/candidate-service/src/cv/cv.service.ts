import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';

import { AuthUser, ERROR_CODES, UserRole } from '@nexhire/shared';

import { ApplicationClientService } from '../application-client/application-client.service';
import { CandidateService } from '../candidate/candidate.service';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import { CandidateCvParseStatus, CandidateCvSource } from '../candidate/entities/candidate.enum';
import { DocumentClientService } from '../document-client/document-client.service';
import {
  CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES,
  CANDIDATE_CV_MIME_TYPES,
} from '../document-client/document-upload.constants';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';
import { CandidateCvResponseDto } from './dto/cv-response.dto';
import { DeleteCvResponseDto } from './dto/delete-cv-response.dto';
import { UploadCvDto } from './dto/upload-cv.dto';
import { CvEventPublisher } from './events/cv-event.publisher';

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly candidateService: CandidateService,
    private readonly applicationClientService: ApplicationClientService,
    private readonly documentClientService: DocumentClientService,
    private readonly cvEventPublisher: CvEventPublisher,
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
    const cv = await this.cvRepo.save(
      this.cvRepo.create({
        candidateId: profile.id,
        documentId: document.id,
        title: this.resolveCvTitle(dto.title, file.originalname),
        isDefault: false,
        parseStatus: CandidateCvParseStatus.NOT_PARSED,
        source: CandidateCvSource.UPLOADED,
        sourceTemplateId: null,
        sourceCvId: null,
        parsedAt: null,
        deletedAt: null,
        documentDeletedAt: null,
        documentDeleteError: null,
      }),
    );

    const latestCv = await this.cvRepo.findOne({ where: { id: cv.id } });
    return this.mapCv(latestCv ?? cv);
  }

  async parseMine(user: AuthUser, id: string): Promise<CandidateCvResponseDto> {
    const profile = await this.candidateService.ensureProfileForUser(user.id);
    const cv = await this.cvRepo.findOne({
      where: { id, candidateId: profile.id, deletedAt: IsNull() },
    });
    if (!cv) {
      throw new NotFoundException({
        code: ERROR_CODES.APPLICATION.CV_NOT_FOUND,
        message: 'Candidate CV not found',
      });
    }

    if (cv.parseStatus === CandidateCvParseStatus.PARSING) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message: 'CV parsing is already in progress',
      });
    }

    await this.cvRepo.update(cv.id, {
      parseStatus: CandidateCvParseStatus.PARSING,
      parsedAt: null,
    });

    return this.triggerParse(user, profile.id, {
      ...cv,
      parseStatus: CandidateCvParseStatus.PARSING,
      parsedAt: null,
    });
  }

  async requestParseForMatching(
    candidateId: string,
    candidateCvId: string,
    requestedByUserId: string,
    force = false,
    applyToProfile = false,
  ): Promise<CandidateCvResponseDto> {
    const cv = await this.cvRepo.findOne({
      where: { id: candidateCvId, candidateId, deletedAt: IsNull() },
    });
    if (!cv) {
      throw new NotFoundException({
        code: ERROR_CODES.APPLICATION.CV_NOT_FOUND,
        message: 'Candidate CV not found',
      });
    }

    if (!force && !applyToProfile && cv.parseStatus === CandidateCvParseStatus.PARSED) {
      return this.mapCv(cv);
    }

    if (cv.parseStatus === CandidateCvParseStatus.PARSING) {
      return this.mapCv(cv);
    }

    const result = await this.cvRepo.update(
      {
        id: cv.id,
        candidateId,
        deletedAt: IsNull(),
        parseStatus: Not(CandidateCvParseStatus.PARSING),
      },
      {
        parseStatus: CandidateCvParseStatus.PARSING,
        parsedAt: null,
      },
    );
    if (result.affected === 0) {
      const latestCv = await this.cvRepo.findOne({ where: { id: cv.id } });
      return this.mapCv(latestCv ?? cv);
    }

    return this.triggerParse(
      { id: requestedByUserId, role: UserRole.CANDIDATE } as AuthUser,
      candidateId,
      {
        ...cv,
        parseStatus: CandidateCvParseStatus.PARSING,
        parsedAt: null,
      },
      applyToProfile ? 'PROFILE_UPDATE' : 'MATCHING_APPLICATION',
    );
  }

  async deleteMine(user: AuthUser, id: string): Promise<DeleteCvResponseDto> {
    const profile = await this.candidateService.ensureProfileForUser(user.id);
    const cv = await this.cvRepo.findOne({
      where: { id, candidateId: profile.id, deletedAt: IsNull() },
    });
    if (!cv) {
      throw new NotFoundException({
        code: ERROR_CODES.APPLICATION.CV_NOT_FOUND,
        message: 'Candidate CV not found',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const cvRepo = manager.getRepository(CandidateCv);
      await cvRepo.update(cv.id, {
        deletedAt: new Date(),
        isDefault: false,
      });

      if (cv.isDefault) {
        const nextDefault = await cvRepo.findOne({
          where: { candidateId: profile.id, deletedAt: IsNull() },
          order: { createdAt: 'DESC' },
        });
        if (nextDefault) {
          await cvRepo.update(nextDefault.id, { isDefault: true });
        }
      }
    });

    this.logger.log(`Candidate deleted CV candidateId=${profile.id} candidateCvId=${cv.id}`);
    return { deleted: true };
  }

  async purgeDeletedCvDocuments(): Promise<number> {
    const deletedGraceDays = this.configService.get<number>(
      'candidateService.cvCleanup.deletedGraceDays',
      30,
    );
    const terminalApplicationRetentionDays = this.configService.get<number>(
      'candidateService.cvCleanup.terminalApplicationRetentionDays',
      180,
    );
    const batchSize = this.configService.get<number>('candidateService.cvCleanup.batchSize', 50);
    const deletedBefore = new Date(Date.now() - deletedGraceDays * 24 * 60 * 60 * 1000);
    const terminalBefore = new Date(
      Date.now() - terminalApplicationRetentionDays * 24 * 60 * 60 * 1000,
    );

    const cvs = await this.cvRepo.find({
      where: {
        deletedAt: LessThanOrEqual(deletedBefore),
        documentDeletedAt: IsNull(),
      },
      order: { deletedAt: 'ASC' },
      take: batchSize,
    });

    let purged = 0;
    for (const cv of cvs) {
      try {
        const retention = await this.applicationClientService.getCvDocumentRetention(
          cv.documentId,
          terminalBefore,
        );
        if (!retention.canDelete) {
          this.logger.log(
            `CV document retained candidateCvId=${cv.id} documentId=${cv.documentId} activeApplications=${retention.activeApplicationCount} recentTerminalApplications=${retention.recentTerminalApplicationCount}`,
          );
          continue;
        }

        await this.documentClientService.deleteDocument(cv.documentId);
        await this.cvRepo.update(cv.id, {
          documentDeletedAt: new Date(),
          documentDeleteError: null,
        });
        purged += 1;
      } catch (error) {
        const message = (error as Error).message;
        await this.cvRepo.update(cv.id, {
          documentDeleteError: message.slice(0, 1000),
        });
        this.logger.warn(
          `CV document purge failed candidateCvId=${cv.id} documentId=${cv.documentId}: ${message}`,
        );
      }
    }

    if (purged > 0) {
      this.logger.log(`CV document cleanup purged=${purged}`);
    }
    return purged;
  }

  private resolveCvTitle(title: string | undefined, fileName: string): string | null {
    const trimmedTitle = title?.trim();
    if (trimmedTitle) {
      return trimmedTitle;
    }
    const trimmedFileName = fileName.trim();
    return trimmedFileName || null;
  }

  private async triggerParse(
    user: AuthUser,
    candidateId: string,
    cv: CandidateCv,
    context: 'PROFILE_UPDATE' | 'MATCHING_APPLICATION' = 'PROFILE_UPDATE',
  ): Promise<CandidateCvResponseDto> {
    try {
      const documentDownload = await this.documentClientService.createDownloadUrl(cv.documentId);
      await this.cvEventPublisher.publishCvUploaded({
        candidateId,
        candidateUserId: user.id,
        candidateCvId: cv.id,
        documentId: cv.documentId,
        documentUrl: documentDownload.url,
        context,
        uploadedAt: new Date().toISOString(),
      });
    } catch (error) {
      await this.cvRepo.update(cv.id, {
        parseStatus: CandidateCvParseStatus.FAILED,
        parsedAt: null,
      });
      this.logger.error(
        `Failed to trigger CV parsing for candidateCvId=${cv.id}: ${(error as Error).message}`,
      );
      return this.mapCv({
        ...cv,
        parseStatus: CandidateCvParseStatus.FAILED,
        parsedAt: null,
      });
    }

    const latestCv = await this.cvRepo.findOne({ where: { id: cv.id } });
    return this.mapCv(latestCv ?? cv);
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
      source: cv.source,
      sourceTemplateId: cv.sourceTemplateId,
      sourceCvId: cv.sourceCvId,
      parsedAt: cv.parsedAt,
      createdAt: cv.createdAt,
      updatedAt: cv.updatedAt,
    };
  }
}
