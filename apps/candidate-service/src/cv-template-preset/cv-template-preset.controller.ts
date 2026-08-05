import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, Public } from '@nexhire/shared';
import { ListCvTemplatePresetsQueryDto } from './dto/cv-template-preset-query.dto';
import { CvTemplatePresetResponseDto } from './dto/cv-template-preset-response.dto';
import { CvTemplatePresetService } from './cv-template-preset.service';

@ApiTags('cv-template-presets')
@Controller('cv-template-presets')
export class CvTemplatePresetController {
  constructor(private readonly cvTemplatePresetService: CvTemplatePresetService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List published CV template presets' })
  @ApiSuccessResponse(CvTemplatePresetResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [400, 500] })
  listPublished(
    @Query() query: ListCvTemplatePresetsQueryDto,
  ): Promise<CvTemplatePresetResponseDto[]> {
    return this.cvTemplatePresetService.listPublished(query);
  }

  @Get(':idOrKey')
  @Public()
  @ApiOperation({ summary: 'Get a published CV template preset by id or key' })
  @ApiSuccessResponse(CvTemplatePresetResponseDto)
  @ApiErrorResponses({ statuses: [404, 500] })
  getPublished(@Param('idOrKey') idOrKey: string): Promise<CvTemplatePresetResponseDto> {
    return this.cvTemplatePresetService.getPublishedByIdOrKey(idOrKey);
  }
}
