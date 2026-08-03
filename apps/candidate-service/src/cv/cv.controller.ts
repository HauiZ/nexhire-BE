import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  InternalServiceTokenGuard,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { CvService } from './cv.service';
import { CandidateCvResponseDto } from './dto/cv-response.dto';
import { DeleteCvResponseDto } from './dto/delete-cv-response.dto';
import { RequestCvParseDto } from './dto/request-cv-parse.dto';
import { UploadCvDto } from './dto/upload-cv.dto';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';
import { CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES } from '../document-client/document-upload.constants';

@ApiTags('cvs')
@Controller('cvs')
export class CvController {
  constructor(private readonly cvService: CvService) {}

  @Post('upload')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload a CV to the candidate CV library' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        title: {
          type: 'string',
          example: 'Backend Engineer CV',
        },
        isDefault: {
          type: 'boolean',
          example: true,
        },
        parse: {
          type: 'boolean',
          example: false,
          description: 'When true, trigger profile parsing immediately after upload.',
        },
      },
    },
  })
  @ApiSuccessResponse(CandidateCvResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 409, 422, 500, 503] })
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadCvDto,
    @UploadedFile() file?: CandidateUploadedFile,
  ): Promise<CandidateCvResponseDto> {
    return this.cvService.uploadCv(user, dto, file);
  }

  @Post(':id/parse')
  @HttpCode(200)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger parsing for a saved CV' })
  @ApiSuccessResponse(CandidateCvResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500, 503] })
  parseMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CandidateCvResponseDto> {
    return this.cvService.parseMine(user, id);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a saved CV from candidate library' })
  @ApiSuccessResponse(DeleteCvResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  deleteMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteCvResponseDto> {
    return this.cvService.deleteMine(user, id);
  }
}

@ApiTags('internal-cvs')
@Controller('internal/cvs')
@UseGuards(InternalServiceTokenGuard)
export class CvInternalController {
  constructor(private readonly cvService: CvService) {}

  @Post(':candidateId/:candidateCvId/request-parse')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request parsing for a candidate CV before matching' })
  @ApiSuccessResponse(CandidateCvResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500, 503] })
  requestParse(
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Param('candidateCvId', ParseUUIDPipe) candidateCvId: string,
    @Body() dto: RequestCvParseDto,
  ): Promise<CandidateCvResponseDto> {
    return this.cvService.requestParseForMatching(
      candidateId,
      candidateCvId,
      dto.requestedByUserId,
      dto.force,
    );
  }
}
