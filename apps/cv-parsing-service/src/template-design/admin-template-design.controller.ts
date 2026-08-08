import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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

import { TemplateSourceFile } from './document-client/document-client.service';
import { CvTemplateDesignJobResponseDto } from './dto/cv-template-design-response.dto';
import { TemplateDesignService } from './template-design.service';

@ApiTags('admin-cv-template-designs')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/cv-template-designs')
export class AdminTemplateDesignController {
  constructor(private readonly templateDesignService: TemplateDesignService) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({
    summary: 'Upload a sample CV PDF and queue an AI job that rebuilds it as a canvas template',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF file, max 10MB' },
      },
    },
  })
  @ApiSuccessResponse(CvTemplateDesignJobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 413, 500, 503] })
  async create(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: TemplateSourceFile,
  ): Promise<CvTemplateDesignJobResponseDto> {
    const job = await this.templateDesignService.createJob(user, file);
    return CvTemplateDesignJobResponseDto.fromEntity(job);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Poll an AI canvas design job' })
  @ApiSuccessResponse(CvTemplateDesignJobResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CvTemplateDesignJobResponseDto> {
    const job = await this.templateDesignService.getJob(id);
    return CvTemplateDesignJobResponseDto.fromEntity(job);
  }
}
