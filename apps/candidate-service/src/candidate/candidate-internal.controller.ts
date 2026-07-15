import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses, ApiSuccessResponse, InternalServiceTokenGuard } from '@nexhire/shared';

import { CandidateService } from './candidate.service';
import { ApplyParsedResumeDto } from './dto/apply-parsed-resume.dto';
import { MarkCandidateCvParseFailedDto } from './dto/mark-candidate-cv-parse-failed.dto';
import { CandidateProfileResponseDto } from './dto/candidate-profile-response.dto';
import { CandidateCvResponseDto } from '../cv/dto/cv-response.dto';
import { CandidateApplicationSnapshotDto } from './dto/candidate-application-snapshot.dto';

@ApiTags('internal-candidates')
@UseGuards(InternalServiceTokenGuard)
@Controller('internal/candidates')
export class CandidateInternalController {
  constructor(private readonly candidateService: CandidateService) {}

  @Post(':candidateId/apply-parsed-resume')
  @ApiOperation({ summary: 'Apply a normalized parsed resume to a candidate profile' })
  @ApiSuccessResponse(CandidateProfileResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  applyParsedResume(
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body() dto: ApplyParsedResumeDto,
  ): Promise<CandidateProfileResponseDto> {
    return this.candidateService.applyParsedResume(
      candidateId,
      dto.parsedResume,
      dto.candidateCvId,
    );
  }

  @Post(':candidateId/cvs/:candidateCvId/parse-failed')
  @ApiOperation({ summary: 'Mark a candidate CV parse attempt as failed' })
  @ApiSuccessResponse(CandidateCvResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  markCvParseFailed(
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Param('candidateCvId', ParseUUIDPipe) candidateCvId: string,
    @Body() dto: MarkCandidateCvParseFailedDto,
  ): Promise<CandidateCvResponseDto> {
    return this.candidateService.markCvParseFailed(candidateId, candidateCvId, dto.errorMessage);
  }

  @Get('users/:userId/cvs/:candidateCvId/application-snapshot')
  @ApiOperation({ summary: 'Get candidate and CV snapshot for a job application' })
  @ApiSuccessResponse(CandidateApplicationSnapshotDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 500] })
  getApplicationSnapshot(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('candidateCvId', ParseUUIDPipe) candidateCvId: string,
  ): Promise<CandidateApplicationSnapshotDto> {
    return this.candidateService.getApplicationSnapshot(userId, candidateCvId);
  }
}
