import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles, UserRole } from '@nexhire/shared';
import { JobRecommendationsQueryDto } from './dto/job-recommendations.dto';
import { JobRecommendationsService } from './job-recommendations.service';

@ApiTags('candidate-job-recommendations')
@ApiBearerAuth()
@Roles(UserRole.CANDIDATE)
@Controller('candidates/me/cvs')
export class JobRecommendationsController {
  constructor(private readonly recommendations: JobRecommendationsService) {}

  @Get(':cvId/job-recommendations')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Rank a bounded public-job pool using the selected owned parsed CV',
  })
  recommend(
    @CurrentUser() user: AuthUser,
    @Param('cvId', ParseUUIDPipe) cvId: string,
    @Query() query: JobRecommendationsQueryDto,
  ) {
    return this.recommendations.recommend(user, cvId, query);
  }
}
