import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, InternalServiceTokenGuard, Roles, UserRole } from '@nexhire/shared';
import { CreatePlanDraftDto, EditRequirementPlanDto, PlanBindingDto } from './requirement-plan.dto';
import { RequirementPlanService } from './requirement-plan.service';

@ApiTags('recruiter-requirement-plans')
@Controller('recruiter/jobs/:id/requirement-plan')
@Roles(UserRole.RECRUITER)
@ApiBearerAuth()
export class RequirementPlanController {
  constructor(private readonly plans: RequirementPlanService) {}

  @Get()
  @ApiOperation({ summary: 'Inspect the optional JD plan without changing job publication' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.get(user, id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Read the latest 50 plan revisions and 100 audit events' })
  history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.history(user, id);
  }

  @Post('drafts')
  @ApiOperation({
    summary: 'Prepare an unconfirmed source-bound JD plan revision, without LLM calls',
  })
  draft(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePlanDraftDto,
  ) {
    return this.plans.createDraft(user, id, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Save edited requirement structure as a new unconfirmed revision' })
  edit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditRequirementPlanDto,
  ) {
    return this.plans.edit(user, id, dto);
  }

  @Post('confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm a current JD structure, not candidate support' })
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlanBindingDto,
  ) {
    return this.plans.confirm(user, id, dto);
  }
}

@ApiTags('internal-jd-plans')
@Controller('internal/jobs/:id/requirement-plan')
@UseGuards(InternalServiceTokenGuard)
export class InternalRequirementPlanController {
  constructor(private readonly plans: RequirementPlanService) {}

  @Get()
  @ApiOperation({ summary: 'Read the latest source-bound plan for an internal matching consumer' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.getInternal(id);
  }
}
