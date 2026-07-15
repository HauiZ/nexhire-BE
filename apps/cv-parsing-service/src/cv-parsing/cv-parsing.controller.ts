import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses, ApiSuccessResponse, InternalServiceTokenGuard } from '@nexhire/shared';

import { CvParsingService } from './cv-parsing.service';
import { CompleteCvParseRequestDto } from './dto/complete-cv-parse-request.dto';
import { CreateCvParseRequestDto } from './dto/create-cv-parse-request.dto';
import { CvParseRequestResponseDto } from './dto/cv-parse-request-response.dto';
import { CvParseResultResponseDto } from './dto/cv-parse-result-response.dto';

@ApiTags('cv-parsing')
@UseGuards(InternalServiceTokenGuard)
@Controller('cv-parsing')
export class CvParsingController {
  constructor(private readonly cvParsingService: CvParsingService) {}

  @Post('parse')
  @ApiOperation({ summary: 'Create a CV parse request for asynchronous processing' })
  @ApiSuccessResponse(CvParseRequestResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  parse(@Body() dto: CreateCvParseRequestDto): Promise<CvParseRequestResponseDto> {
    return this.cvParsingService.createParseRequest(dto);
  }

  @Post('requests/:id/complete')
  @ApiOperation({ summary: 'Persist a parsed CV result and apply it to candidate profile' })
  @ApiSuccessResponse(CvParseResultResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCvParseRequestDto,
  ): Promise<CvParseResultResponseDto> {
    return this.cvParsingService.completeParseRequest(id, dto);
  }
}
