import { Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses, ApiSuccessResponse, Public } from '@nexhire/shared';

import { ManualGeminiCvParseResponseDto } from './dto/manual-gemini-cv-parse.dto';
import { ManualCvParsingService } from './manual-cv-parsing.service';

interface ManualUploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@ApiTags('manual-cv-parsing')
@Controller('cv-parsing/manual')
export class ManualCvParsingController {
  constructor(private readonly manualCvParsingService: ManualCvParsingService) {}

  @Post('gemini/parse-file')
  @Public()
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: 'Manual/dev only: parse a CV file with Gemini without saving or applying profile data',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF file, max 10MB',
        },
      },
    },
  })
  @ApiSuccessResponse(ManualGeminiCvParseResponseDto)
  @ApiErrorResponses({ statuses: [400, 403, 422, 500, 503] })
  parseGeminiFile(
    @UploadedFile() file?: ManualUploadedFile,
  ): Promise<ManualGeminiCvParseResponseDto> {
    return this.manualCvParsingService.parseGeminiFile(file);
  }
}
