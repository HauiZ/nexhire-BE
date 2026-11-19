import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, PaginationQueryDto, Roles, UserRole } from '@nexhire/shared';
import {
  CreateDictionarySkillDto,
  DictionaryListQueryDto,
  UpdateDictionarySkillDto,
} from './dto/skill-dictionary.dto';
import { SkillDictionaryService } from './skill-dictionary.service';

@ApiTags('admin-skill-dictionary')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/skill-dictionary')
export class SkillDictionaryController {
  constructor(private readonly dictionary: SkillDictionaryService) {}
  @Get()
  @ApiOperation({ summary: 'List admin dictionary entries; no parser/model effect' })
  list(@CurrentUser() user: AuthUser, @Query() query: DictionaryListQueryDto) {
    return this.dictionary.list(user, query);
  }
  @Get(':id/history')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.dictionary.history(user, id, query);
  }
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.dictionary.detail(user, id);
  }
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDictionarySkillDto) {
    return this.dictionary.create(user, dto);
  }
  @Patch(':id')
  @HttpCode(200)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDictionarySkillDto,
  ) {
    return this.dictionary.update(user, id, dto);
  }
}
