import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
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
import { CvService } from './cv.service';
import { CandidateCvResponseDto } from './dto/cv-response.dto';
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
  @ApiOperation({ summary: 'Upload a CV and trigger automatic parsing' })
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
}
