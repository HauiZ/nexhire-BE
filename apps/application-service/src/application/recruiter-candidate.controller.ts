import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { ApplicationService } from './application.service';
import { RecruiterCandidateQueryDto } from './dto/application-query.dto';
import {
  RecruiterCandidateDetailDto,
  RecruiterCandidateListItemDto,
} from './dto/application-response.dto';

@ApiTags('recruiter-candidates')
@Controller('recruiter/candidates')
@Roles(UserRole.RECRUITER)
@ApiBearerAuth()
export class RecruiterCandidateController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get()
  @ApiOperation({
    summary: 'List company candidates derived from applications',
    description:
      'Returns only candidates that have applied to at least one job owned by the recruiter company.',
  })
  @ApiSuccessResponse(RecruiterCandidateListItemDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  listCompanyCandidates(@CurrentUser() user: AuthUser, @Query() query: RecruiterCandidateQueryDto) {
    return this.applicationService.listCompanyCandidates(user, query);
  }

  @Get(':candidateId')
  @ApiOperation({
    summary: 'Get company candidate detail and application history',
    description: 'The candidate must have at least one application for the recruiter company.',
  })
  @ApiSuccessResponse(RecruiterCandidateDetailDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getCompanyCandidate(
    @CurrentUser() user: AuthUser,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ): Promise<RecruiterCandidateDetailDto> {
    return this.applicationService.getCompanyCandidate(user, candidateId);
  }
}
