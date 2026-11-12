import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrorResponses, AuthUser, CurrentUser, Roles, UserRole } from '@nexhire/shared';
import { PreparationService } from './preparation.service';

@ApiTags('candidate-preparation')
@ApiBearerAuth()
@Controller('candidates/me')
@Roles(UserRole.CANDIDATE)
export class PreparationController {
  constructor(private readonly preparation: PreparationService) {}

  @Post('cvs/:cvId/jobs/:jobId/preparation')
  @HttpCode(200)
  @ApiCommonErrorResponses()
  @ApiOkResponse({
    description:
      'Private candidate-preparation-v1 result in the standard data envelope; source references only, no scores or persistence.',
  })
  @ApiOperation({
    summary:
      'Privately review an owned parsed CV against a public job; no application or CV writes',
  })
  prepare(
    @CurrentUser() user: AuthUser,
    @Param('cvId', ParseUUIDPipe) cvId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.preparation.prepare(user.id, jobId, cvId);
  }
}
