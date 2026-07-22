import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Roles,
  UserRole,
} from '@nexhire/shared';

import { CvTemplateSectionKey } from '../candidate/entities/candidate.enum';
import {
  CANDIDATE_AVATAR_MAX_UPLOAD_SIZE_BYTES,
  CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES,
} from '../document-client/document-upload.constants';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';
import { CandidateCvResponseDto } from '../cv/dto/cv-response.dto';
import {
  CreateCvTemplateDto,
  CreateCvTemplateFromCvDto,
  ExportCvTemplateDto,
  SortCvTemplateItemsDto,
  SortCvTemplateSectionsDto,
  UpdateCvTemplateDto,
} from './dto/cv-template-request.dto';
import {
  CvTemplateOptionsResponseDto,
  CvTemplateResponseDto,
  DeleteCvTemplateResponseDto,
} from './dto/cv-template-response.dto';
import { CvTemplateService } from './cv-template.service';

@ApiTags('cv-templates')
@Controller('cv-templates')
export class CvTemplateController {
  constructor(private readonly cvTemplateService: CvTemplateService) {}

  @Get('options')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get supported CV template keys and section keys' })
  @ApiSuccessResponse(CvTemplateOptionsResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getOptions(): CvTemplateOptionsResponseDto {
    return this.cvTemplateService.getOptions();
  }

  @Get()
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my saved CV templates' })
  @ApiSuccessResponse(CvTemplateResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  listMine(@CurrentUser() user: AuthUser): Promise<CvTemplateResponseDto[]> {
    return this.cvTemplateService.listMine(user);
  }

  @Get(':id')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my CV template detail' })
  @ApiSuccessResponse(CvTemplateResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CvTemplateResponseDto> {
    return this.cvTemplateService.getMine(user, id);
  }

  @Post()
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a CV template manually from empty state or default profile' })
  @ApiSuccessResponse(CvTemplateResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  createMine(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCvTemplateDto,
  ): Promise<CvTemplateResponseDto> {
    return this.cvTemplateService.createMine(user, dto);
  }

  @Post('from-cv')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload a CV and fill a template without applying candidate profile' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'templateKey'],
      properties: {
        file: { type: 'string', format: 'binary' },
        templateKey: { type: 'string', example: 'modern' },
        name: { type: 'string', example: 'Backend Engineer CV' },
      },
    },
  })
  @ApiSuccessResponse(CvTemplateResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500, 503] })
  createFromCv(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCvTemplateFromCvDto,
    @UploadedFile() file?: CandidateUploadedFile,
  ): Promise<CvTemplateResponseDto> {
    return this.cvTemplateService.createFromCv(user, dto, file);
  }

  @Patch(':id')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update CV template metadata, theme, layout, or content snapshot' })
  @ApiSuccessResponse(CvTemplateResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  updateMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCvTemplateDto,
  ): Promise<CvTemplateResponseDto> {
    return this.cvTemplateService.updateMine(user, id, dto);
  }

  @Patch(':id/sections/sort-order')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk update CV template section sort order' })
  @ApiSuccessResponse(CvTemplateResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  sortSections(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SortCvTemplateSectionsDto,
  ): Promise<CvTemplateResponseDto> {
    return this.cvTemplateService.sortSections(user, id, dto);
  }

  @Patch(':id/sections/:sectionKey/items/sort-order')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk update item sort order inside a CV template section' })
  @ApiSuccessResponse(CvTemplateResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  sortItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionKey', new ParseEnumPipe(CvTemplateSectionKey)) sectionKey: CvTemplateSectionKey,
    @Body() dto: SortCvTemplateItemsDto,
  ): Promise<CvTemplateResponseDto> {
    return this.cvTemplateService.sortItems(user, id, sectionKey, dto);
  }

  @Patch(':id/avatar')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CANDIDATE_AVATAR_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload or replace avatar for a CV template only' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiSuccessResponse(CvTemplateResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500, 503] })
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: CandidateUploadedFile,
  ): Promise<CvTemplateResponseDto> {
    return this.cvTemplateService.uploadAvatar(user, id, file);
  }

  @Post(':id/export')
  @HttpCode(200)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload exported CV file from a template into candidate CV library' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string', example: 'Backend Engineer CV - Modern' },
        isDefault: { type: 'boolean', example: false },
      },
    },
  })
  @ApiSuccessResponse(CandidateCvResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500, 503] })
  exportMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExportCvTemplateDto,
    @UploadedFile() file?: CandidateUploadedFile,
  ): Promise<CandidateCvResponseDto> {
    return this.cvTemplateService.exportMine(user, id, dto, file);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete my CV template' })
  @ApiSuccessResponse(DeleteCvTemplateResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  deleteMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: true }> {
    return this.cvTemplateService.deleteMine(user, id);
  }
}
