import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  PaginationQueryDto,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { FollowedCompanyBatchStatusQueryDto } from './dto/followed-company-query.dto';
import {
  DeleteFollowedCompanyResponseDto,
  FollowedCompanyBatchStatusResponseDto,
  FollowedCompanyResponseDto,
  FollowedCompanyStatusResponseDto,
} from './dto/followed-company-response.dto';
import { FollowedCompanyService } from './followed-company.service';

@ApiTags('followed-companies')
@Controller('followed-companies')
@Roles(UserRole.CANDIDATE)
@ApiBearerAuth()
export class FollowedCompanyController {
  constructor(private readonly followedCompanyService: FollowedCompanyService) {}

  @Get()
  @ApiOperation({ summary: 'List companies followed by the current candidate' })
  @ApiSuccessResponse(FollowedCompanyResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  listMine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.followedCompanyService.listMine(user, query);
  }

  @Post(':companyId')
  @ApiOperation({ summary: 'Follow an approved company for new-job notifications' })
  @ApiSuccessResponse(FollowedCompanyResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [401, 403, 404, 409, 503] })
  followMine(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ): Promise<FollowedCompanyResponseDto> {
    return this.followedCompanyService.followMine(user, companyId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Batch-check which companies are followed by the current candidate' })
  @ApiSuccessResponse(FollowedCompanyBatchStatusResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  getMineBatchStatus(
    @CurrentUser() user: AuthUser,
    @Query() query: FollowedCompanyBatchStatusQueryDto,
  ): Promise<FollowedCompanyBatchStatusResponseDto> {
    return this.followedCompanyService.getMineBatchStatus(user, query.companyIds);
  }

  @Delete(':companyId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unfollow a company for the current candidate' })
  @ApiSuccessResponse(DeleteFollowedCompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  unfollowMine(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ): Promise<DeleteFollowedCompanyResponseDto> {
    return this.followedCompanyService.unfollowMine(user, companyId);
  }

  @Get(':companyId/status')
  @ApiOperation({ summary: 'Check whether the current candidate follows a company' })
  @ApiSuccessResponse(FollowedCompanyStatusResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getMineStatus(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ): Promise<FollowedCompanyStatusResponseDto> {
    return this.followedCompanyService.getMineStatus(user, companyId);
  }
}
