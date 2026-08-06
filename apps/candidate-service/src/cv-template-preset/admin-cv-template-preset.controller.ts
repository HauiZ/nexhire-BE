import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  Roles,
  UserRole,
} from '@nexhire/shared';
import {
  AdminCvTemplatePresetQueryDto,
  AdminCvTemplatePresetSortOrderDto,
  CreateAdminCvTemplatePresetDto,
  UpdateAdminCvTemplatePresetDto,
} from './dto/admin-cv-template-preset-request.dto';
import { AdminCvTemplatePresetResponseDto } from './dto/admin-cv-template-preset-response.dto';
import { CvTemplatePresetService } from './cv-template-preset.service';

@ApiTags('admin-cv-template-presets')
@Controller('admin/cv-template-presets')
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminCvTemplatePresetController {
  constructor(private readonly cvTemplatePresetService: CvTemplatePresetService) {}

  @Get()
  @ApiOperation({ summary: 'List CV template presets for admin management' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  listAdmin(@Query() query: AdminCvTemplatePresetQueryDto) {
    return this.cvTemplatePresetService.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CV template preset detail for admin management' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getAdmin(@Param('id', ParseUUIDPipe) id: string): Promise<AdminCvTemplatePresetResponseDto> {
    return this.cvTemplatePresetService.getAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a CV template preset draft' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 409, 422, 500] })
  createAdmin(
    @Body() dto: CreateAdminCvTemplatePresetDto,
  ): Promise<AdminCvTemplatePresetResponseDto> {
    return this.cvTemplatePresetService.createAdmin(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a CV template preset draft or published preset' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  updateAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminCvTemplatePresetDto,
  ): Promise<AdminCvTemplatePresetResponseDto> {
    return this.cvTemplatePresetService.updateAdmin(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a CV template preset' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  publishAdmin(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminCvTemplatePresetResponseDto> {
    return this.cvTemplatePresetService.publishAdmin(id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a CV template preset' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  archiveAdmin(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminCvTemplatePresetResponseDto> {
    return this.cvTemplatePresetService.archiveAdmin(id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore an archived CV template preset as draft' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  restoreAdmin(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminCvTemplatePresetResponseDto> {
    return this.cvTemplatePresetService.restoreAdmin(id);
  }

  @Patch('sort-order')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bulk update preset sort order' })
  @ApiSuccessResponse(AdminCvTemplatePresetResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  updateSortOrder(
    @Body() dto: AdminCvTemplatePresetSortOrderDto,
  ): Promise<AdminCvTemplatePresetResponseDto[]> {
    return this.cvTemplatePresetService.updateSortOrder(dto);
  }
}
