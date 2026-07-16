import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { AuthUser, ERROR_CODES } from '@nexhire/shared';

import { ApplicationClientService } from '../application-client/application-client.service';
import { CandidateService } from '../candidate/candidate.service';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import { CandidateCvParseStatus } from '../candidate/entities/candidate.enum';
import { CvParsingClientService } from '../cv-parsing-client/cv-parsing-client.service';
import { DocumentClientService } from '../document-client/document-client.service';
import {
  CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES,
  CANDIDATE_CV_MIME_TYPES,
} from '../document-client/document-upload.constants';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';
import { CandidateCvResponseDto } from './dto/cv-response.dto';
import { DeleteCvResponseDto } from './dto/delete-cv-response.dto';
import { UploadCvDto } from './dto/upload-cv.dto';

const FAILED_PARSE_STATUS = 'FAILED';

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly candidateService: CandidateService,
    private readonly applicationClientService: ApplicationClientService,
    private readonly cvParsingClientService: CvParsingClientService,
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
      dto.isDefault ??
      (await this.cvRepo.count({
        where: { candidateId: profile.id, deletedAt: IsNull() },
      })) === 0;

    if (shouldSetDefault) {
      await this.cvRepo.update(
        { candidateId: profile.id, isDefault: true, deletedAt: IsNull() },
        { isDefault: false },
      );
    }

    const cv = await this.cvRepo.save(
      this.cvRepo.create({
        candidateId: profile.id,
        documentId: document.id,
        title: this.resolveCvTitle(dto.title, file.originalname),
        isDefault: shouldSetDefault,
        parseStatus: CandidateCvParseStatus.PARSING,
        parsedAt: null,
        deletedAt: null,
        documentDeletedAt: null,
        documentDeleteError: null,
      }),
    );

    try {
      const parseRequest = await this.cvParsingClientService.createParseRequest({
        user,
        candidateId: profile.id,
        candidateCvId: cv.id,
        documentId: document.id,
        documentUrl: document.url,
      });

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
