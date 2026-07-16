import { Body, Controller, Get, HttpCode, Patch, UploadedFile, UseInterceptors } from '@nestjs/common';
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
import { CandidateProfileResponseDto } from './dto/candidate-profile-response.dto';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';
import { CandidateService } from './candidate.service';
import { CANDIDATE_AVATAR_MAX_UPLOAD_SIZE_BYTES } from '../document-client/document-upload.constants';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';

@ApiTags('candidates')
@Controller('candidates')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Get('me')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current candidate profile page aggregate' })
  @ApiSuccessResponse(CandidateProfileResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getMe(@CurrentUser() user: AuthUser): Promise<CandidateProfileResponseDto> {
    return this.candidateService.getMe(user.id);
  }

  @Patch('me')
  @HttpCode(200)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the current candidate profile page aggregate' })
  @ApiSuccessResponse(CandidateProfileResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 409, 422, 500] })
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCandidateProfileDto,
  ): Promise<CandidateProfileResponseDto> {
    return this.candidateService.updateMe(user.id, dto);
  }

  @Patch('me/avatar')
  @HttpCode(200)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CANDIDATE_AVATAR_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload and set the current candidate avatar' })
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
      },
    },
  })
  @ApiSuccessResponse(CandidateProfileResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500, 503] })
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: CandidateUploadedFile,
  ): Promise<CandidateProfileResponseDto> {
    return this.candidateService.uploadAvatar(user, file);
  }
}
