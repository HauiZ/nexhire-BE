import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
