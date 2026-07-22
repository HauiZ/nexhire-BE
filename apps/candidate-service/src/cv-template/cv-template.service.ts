import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, IsNull, QueryDeepPartialEntity, Repository } from 'typeorm';

import { AuthUser, ERROR_CODES, ParsedResume } from '@nexhire/shared';

import { CandidateService } from '../candidate/candidate.service';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import {
  CandidateCvParseStatus,
  CandidateCvSource,
  CvTemplateKey,
  CvTemplateSectionKey,
} from '../candidate/entities/candidate.enum';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';
import {
  CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES,
  CANDIDATE_CV_MIME_TYPES,
} from '../document-client/document-upload.constants';
import { DocumentClientService } from '../document-client/document-client.service';
import { CvParsingClientService } from '../cv-parsing-client/cv-parsing-client.service';
import { CandidateCvResponseDto } from '../cv/dto/cv-response.dto';
import {
  CreateCvTemplateFromCvDto,
  ExportCvTemplateDto,
  SortCvTemplateItemsDto,
  SortCvTemplateSectionsDto,
  UpdateCvTemplateDto,
} from './dto/cv-template-request.dto';
import {
  CvTemplateOptionsResponseDto,
  CvTemplateResponseDto,
} from './dto/cv-template-response.dto';
import { CandidateCvTemplate } from './entities/cv-template.entity';

const LIST_SECTIONS = new Set<CvTemplateSectionKey>([
  CvTemplateSectionKey.SKILLS,
  CvTemplateSectionKey.EXPERIENCES,
  CvTemplateSectionKey.EDUCATIONS,
  CvTemplateSectionKey.PROJECTS,
  CvTemplateSectionKey.CERTIFICATIONS,
  CvTemplateSectionKey.LANGUAGES,
  CvTemplateSectionKey.AWARDS,
  CvTemplateSectionKey.REFERENCES,
]);

type SnapshotItem = Record<string, unknown> & {
  id: string;
  sortOrder: number;
  visible: boolean;
};

@Injectable()
export class CvTemplateService {
  private readonly logger = new Logger(CvTemplateService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly candidateService: CandidateService,
    private readonly documentClientService: DocumentClientService,
    private readonly cvParsingClientService: CvParsingClientService,
    @InjectRepository(CandidateCvTemplate)
    private readonly templateRepo: Repository<CandidateCvTemplate>,
  ) {}

  getOptions(): CvTemplateOptionsResponseDto {
    return {
      templates: [
        {
          key: CvTemplateKey.MODERN,
          label: 'Modern',
          description: 'Clean modern CV layout for product and engineering roles.',
        },
        {
          key: CvTemplateKey.CLASSIC,
          label: 'Classic',
          description: 'Traditional professional CV layout.',
        },
        {
          key: CvTemplateKey.MINIMAL,
          label: 'Minimal',
          description: 'Simple ATS-friendly CV layout.',
        },
      ],
      sections: Object.values(CvTemplateSectionKey),
      sortableItemSections: Array.from(LIST_SECTIONS),
    };
  }

  async listMine(user: AuthUser): Promise<CvTemplateResponseDto[]> {
    const profile = await this.candidateService.ensureProfileForUser(user.id);
    const templates = await this.templateRepo.find({
      where: { candidateId: profile.id, deletedAt: IsNull() },
      order: { isDefault: 'DESC', updatedAt: 'DESC' },
    });
    return templates.map((template) => this.mapTemplate(template));
  }

  async getMine(user: AuthUser, id: string): Promise<CvTemplateResponseDto> {
    const template = await this.findMine(user, id);
    return this.mapTemplate(template);
  }

  async createFromCv(
    user: AuthUser,
    dto: CreateCvTemplateFromCvDto,
    file?: CandidateUploadedFile,
  ): Promise<CvTemplateResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'CV file is required',
      });
    }
    this.assertCvFile(file);

    const profile = await this.candidateService.ensureProfileForUser(user.id);
    const document = await this.documentClientService.uploadCandidateDocument(
      user,
      profile.id,
      'CV',
      file,
    );
    const download = await this.documentClientService.createDownloadUrl(document.id);
    const parseResult = await this.cvParsingClientService.parseTemplateFill({
      user,
      candidateId: profile.id,
      documentId: document.id,
      documentUrl: download.url,
    });
    const contentSnapshot = this.buildContentSnapshot(parseResult.normalizedPayload);
    const layout = this.buildLayout(contentSnapshot);

    const template = await this.templateRepo.save(
      this.templateRepo.create({
        candidateId: profile.id,
        name: this.resolveTemplateName(dto.name, dto.templateKey),
        templateKey: dto.templateKey,
        sourceDocumentId: document.id,
        sourceDocumentDeletedAt: null,
        sourceDocumentDeleteError: null,
        sourceCvId: null,
        sourceParseRequestId: parseResult.parseRequestId,
        theme: {},
        layout,
        contentSnapshot,
        isDefault: false,
        lastExportedCvId: null,
        lastExportedAt: null,
        deletedAt: null,
      }),
    );

    const cleanedTemplate = await this.cleanupSourceDocumentAfterParse(template, document.id);
    this.logger.log(`CV template created candidateId=${profile.id} templateId=${template.id}`);
    return this.mapTemplate(cleanedTemplate);
  }

  async updateMine(
    user: AuthUser,
    id: string,
    dto: UpdateCvTemplateDto,
  ): Promise<CvTemplateResponseDto> {
    const template = await this.findMine(user, id);
    const patch: Partial<CandidateCvTemplate> = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.templateKey !== undefined ? { templateKey: dto.templateKey } : {}),
      ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
      ...(dto.layout !== undefined ? { layout: this.validateLayout(dto.layout) } : {}),
      ...(dto.contentSnapshot !== undefined
        ? { contentSnapshot: this.validateContentSnapshot(dto.contentSnapshot) }
        : {}),
    };

    await this.dataSource.transaction(async (manager) => {
      if (dto.isDefault === true) {
        await manager.update(
          CandidateCvTemplate,
          { candidateId: template.candidateId, isDefault: true, deletedAt: IsNull() },
          { isDefault: false },
        );
        patch.isDefault = true;
      } else if (dto.isDefault === false) {
        patch.isDefault = false;
      }
      if (Object.keys(patch).length > 0) {
        await manager.update(
          CandidateCvTemplate,
          template.id,
          patch as QueryDeepPartialEntity<CandidateCvTemplate>,
        );
      }
    });

    return this.getMine(user, id);
  }

  async sortSections(
    user: AuthUser,
    id: string,
    dto: SortCvTemplateSectionsDto,
  ): Promise<CvTemplateResponseDto> {
    const template = await this.findMine(user, id);
    const layout = this.validateLayout(template.layout);
    const sections = this.getLayoutSections(layout);
    const sectionKeys = this.assertUniqueSectionKeys(dto.sectionKeys);
    const existingKeys = new Set(sections.map((section) => section.key));

    for (const key of sectionKeys) {
      if (!existingKeys.has(key)) {
        throw new BadRequestException({
          code: ERROR_CODES.COMMON.VALIDATION_FAILED,
          message: `Section ${key} does not exist in this template`,
        });
      }
    }

    const sortedKeys = new Set(sectionKeys);
    const reordered = [
      ...sectionKeys.map((key, index) => ({
        ...sections.find((section) => section.key === key),
        key,
        sortOrder: index + 1,
      })),
      ...sections
        .filter((section) => !sortedKeys.has(section.key))
        .map((section, index) => ({
          ...section,
          sortOrder: sectionKeys.length + index + 1,
        })),
    ];

    await this.templateRepo.update(template.id, {
      layout: {
        ...layout,
        sections: reordered,
      },
    });
    return this.getMine(user, id);
  }

  async sortItems(
    user: AuthUser,
    id: string,
    sectionKey: CvTemplateSectionKey,
    dto: SortCvTemplateItemsDto,
  ): Promise<CvTemplateResponseDto> {
    if (!LIST_SECTIONS.has(sectionKey)) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: `Section ${sectionKey} does not support item sorting`,
      });
    }

    const template = await this.findMine(user, id);
    const contentSnapshot = this.validateContentSnapshot(template.contentSnapshot);
    const items = this.getSnapshotItems(contentSnapshot, sectionKey);
    const itemIds = this.assertUniqueStrings(dto.itemIds, 'itemIds');
    const existingIds = new Set(items.map((item) => item.id));

    if (itemIds.length !== items.length) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'itemIds must include every item in the section exactly once',
      });
    }

    for (const itemId of itemIds) {
      if (!existingIds.has(itemId)) {
        throw new BadRequestException({
          code: ERROR_CODES.COMMON.VALIDATION_FAILED,
          message: `Unknown item id: ${itemId}`,
        });
      }
    }

    const byId = new Map(items.map((item) => [item.id, item]));
    contentSnapshot[sectionKey] = itemIds.map((itemId, index) => ({
      ...byId.get(itemId),
      sortOrder: index + 1,
    }));

    await this.templateRepo.update(template.id, {
      contentSnapshot,
    } as QueryDeepPartialEntity<CandidateCvTemplate>);
    return this.getMine(user, id);
  }

  async exportMine(
    user: AuthUser,
    id: string,
    dto: ExportCvTemplateDto,
    file?: CandidateUploadedFile,
  ): Promise<CandidateCvResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'Exported CV file is required',
      });
    }
    this.assertCvFile(file);

    const template = await this.findMine(user, id);
    const document = await this.documentClientService.uploadCandidateDocument(
      user,
      template.candidateId,
      'CV',
      file,
    );
    const shouldSetDefault = dto.isDefault ?? false;

    const cv = await this.dataSource.transaction(async (manager) => {
      if (shouldSetDefault) {
        await manager.update(
          CandidateCv,
          { candidateId: template.candidateId, isDefault: true, deletedAt: IsNull() },
          { isDefault: false },
        );
      }

      const savedCv = await manager.save(
        CandidateCv,
        manager.create(CandidateCv, {
          candidateId: template.candidateId,
          documentId: document.id,
          title: this.resolveExportTitle(dto.title, template.name, file.originalname),
          isDefault: shouldSetDefault,
          parseStatus: CandidateCvParseStatus.NOT_PARSED,
          source: CandidateCvSource.TEMPLATE_EXPORT,
          sourceTemplateId: template.id,
          sourceCvId: template.sourceCvId,
          parsedAt: null,
          deletedAt: null,
          documentDeletedAt: null,
          documentDeleteError: null,
        }),
      );

      await manager.update(CandidateCvTemplate, template.id, {
        lastExportedCvId: savedCv.id,
        lastExportedAt: new Date(),
      });
      return savedCv;
    });

    return this.mapCv(cv);
  }

  async deleteMine(user: AuthUser, id: string): Promise<{ deleted: true }> {
    const template = await this.findMine(user, id);
    await this.templateRepo.update(template.id, {
      deletedAt: new Date(),
      isDefault: false,
    });
    return { deleted: true };
  }

  private async findMine(user: AuthUser, id: string): Promise<CandidateCvTemplate> {
    const profile = await this.candidateService.ensureProfileForUser(user.id);
    const template = await this.templateRepo.findOne({
      where: { id, candidateId: profile.id, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundException({
        code: ERROR_CODES.COMMON.NOT_FOUND,
        message: 'CV template not found',
      });
    }
    return template;
  }

  private async cleanupSourceDocumentAfterParse(
    template: CandidateCvTemplate,
    documentId: string,
  ): Promise<CandidateCvTemplate> {
    try {
      await this.documentClientService.deleteDocument(documentId);
      const deletedAt = new Date();
      await this.templateRepo.update(template.id, {
        sourceDocumentId: null,
        sourceDocumentDeletedAt: deletedAt,
        sourceDocumentDeleteError: null,
      });
      return {
        ...template,
        sourceDocumentId: null,
        sourceDocumentDeletedAt: deletedAt,
        sourceDocumentDeleteError: null,
      };
    } catch (error) {
      const message = (error as Error).message.slice(0, 1000);
      await this.templateRepo.update(template.id, {
        sourceDocumentId: documentId,
        sourceDocumentDeletedAt: null,
        sourceDocumentDeleteError: message,
      });
      this.logger.warn(
        `CV template source document cleanup failed templateId=${template.id} documentId=${documentId}: ${message}`,
      );
      return {
        ...template,
        sourceDocumentId: documentId,
        sourceDocumentDeletedAt: null,
        sourceDocumentDeleteError: message,
      };
    }
  }

  private buildContentSnapshot(parsedResume: ParsedResume): Record<string, unknown> {
    return {
      [CvTemplateSectionKey.PROFILE]: {
        ...parsedResume.profile,
        id: 'profile',
        visible: true,
      },
      [CvTemplateSectionKey.SUMMARY]: {
        id: 'summary',
        text: parsedResume.profile.summary ?? null,
        visible: Boolean(parsedResume.profile.summary),
      },
      [CvTemplateSectionKey.SKILLS]: this.withListMetadata(parsedResume.skills),
      [CvTemplateSectionKey.EXPERIENCES]: this.withListMetadata(parsedResume.experiences),
      [CvTemplateSectionKey.EDUCATIONS]: this.withListMetadata(parsedResume.educations),
      [CvTemplateSectionKey.PROJECTS]: this.withListMetadata(parsedResume.projects),
      [CvTemplateSectionKey.CERTIFICATIONS]: this.withListMetadata(parsedResume.certifications),
      [CvTemplateSectionKey.LANGUAGES]: [],
      [CvTemplateSectionKey.AWARDS]: [],
      [CvTemplateSectionKey.REFERENCES]: [],
    };
  }

  private buildLayout(contentSnapshot: Record<string, unknown>): Record<string, unknown> {
    const sections = Object.values(CvTemplateSectionKey)
      .filter((key) => this.sectionHasContent(contentSnapshot, key))
      .map((key, index) => ({
        key,
        visible: true,
        sortOrder: index + 1,
      }));
    return { sections };
  }

  private sectionHasContent(
    contentSnapshot: Record<string, unknown>,
    key: CvTemplateSectionKey,
  ): boolean {
    const value = contentSnapshot[key];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (key === CvTemplateSectionKey.PROFILE) {
      return true;
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some((entry) => entry !== null && entry !== '');
    }
    return false;
  }

  private withListMetadata<T extends object>(items: T[]): SnapshotItem[] {
    return items.map((item, index) => ({
      id: randomUUID(),
      ...item,
      visible: true,
      sortOrder: index + 1,
    }));
  }

  private validateLayout(layout: Record<string, unknown>): Record<string, unknown> {
    const sections = this.getLayoutSections(layout);
    this.assertUniqueSectionKeys(sections.map((section) => section.key));
    return {
      ...layout,
      sections,
    };
  }

  private validateContentSnapshot(
    contentSnapshot: Record<string, unknown>,
  ): Record<string, unknown> {
    for (const key of Object.keys(contentSnapshot)) {
      if (!Object.values(CvTemplateSectionKey).includes(key as CvTemplateSectionKey)) {
        throw new BadRequestException({
          code: ERROR_CODES.COMMON.VALIDATION_FAILED,
          message: `Unknown CV template section: ${key}`,
        });
      }
    }
    return contentSnapshot;
  }

  private getLayoutSections(layout: Record<string, unknown>): Array<{
    key: CvTemplateSectionKey;
    visible: boolean;
    sortOrder: number;
  }> {
    const sections = layout.sections;
    if (!Array.isArray(sections)) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'layout.sections must be an array',
      });
    }

    return sections.map((section, index) => {
      if (!section || typeof section !== 'object') {
        throw new BadRequestException({
          code: ERROR_CODES.COMMON.VALIDATION_FAILED,
          message: 'layout.sections contains an invalid section',
        });
      }
      const candidate = section as Record<string, unknown>;
      const key = candidate.key as CvTemplateSectionKey;
      if (!Object.values(CvTemplateSectionKey).includes(key)) {
        throw new BadRequestException({
          code: ERROR_CODES.COMMON.VALIDATION_FAILED,
          message: `Unknown CV template section: ${String(candidate.key)}`,
        });
      }
      return {
        key,
        visible: typeof candidate.visible === 'boolean' ? candidate.visible : true,
        sortOrder: Number.isInteger(candidate.sortOrder) ? Number(candidate.sortOrder) : index + 1,
      };
    });
  }

  private getSnapshotItems(
    contentSnapshot: Record<string, unknown>,
    sectionKey: CvTemplateSectionKey,
  ): SnapshotItem[] {
    const items = contentSnapshot[sectionKey];
    if (!Array.isArray(items)) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: `Section ${sectionKey} does not contain sortable items`,
      });
    }
    return items.map((item) => item as SnapshotItem);
  }

  private assertUniqueSectionKeys(sectionKeys: CvTemplateSectionKey[]): CvTemplateSectionKey[] {
    return this.assertUniqueStrings(sectionKeys, 'sectionKeys') as CvTemplateSectionKey[];
  }

  private assertUniqueStrings(values: string[], field: string): string[] {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) {
        throw new BadRequestException({
          code: ERROR_CODES.COMMON.VALIDATION_FAILED,
          message: `${field} contains duplicate value: ${value}`,
        });
      }
      seen.add(value);
    }
    return values;
  }

  private assertCvFile(file: CandidateUploadedFile): void {
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

  private resolveTemplateName(name: string | undefined, templateKey: CvTemplateKey): string {
    const trimmed = name?.trim();
    if (trimmed) {
      return trimmed;
    }
    const label = this.getOptions().templates.find((template) => template.key === templateKey);
    return `${label?.label ?? 'Custom'} CV`;
  }

  private resolveExportTitle(
    title: string | undefined,
    templateName: string,
    fileName: string,
  ): string {
    const trimmedTitle = title?.trim();
    if (trimmedTitle) {
      return trimmedTitle;
    }
    return templateName.trim() || fileName.trim() || 'Exported CV';
  }

  private mapTemplate(template: CandidateCvTemplate): CvTemplateResponseDto {
    return {
      id: template.id,
      candidateId: template.candidateId,
      name: template.name,
      templateKey: template.templateKey,
      sourceDocumentId: template.sourceDocumentId,
      sourceDocumentDeletedAt: template.sourceDocumentDeletedAt,
      sourceDocumentDeleteError: template.sourceDocumentDeleteError,
      sourceCvId: template.sourceCvId,
      sourceParseRequestId: template.sourceParseRequestId,
      theme: template.theme,
      layout: template.layout,
      contentSnapshot: template.contentSnapshot,
      isDefault: template.isDefault,
      lastExportedCvId: template.lastExportedCvId,
      lastExportedAt: template.lastExportedAt,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
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
