import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, Public } from '@nexhire/shared';
import { CategoryService } from './category.service';
import { PublicCategoryDto } from './dto/category-response.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active job categories with public job counts' })
  @ApiSuccessResponse(PublicCategoryDto, { isArray: true })
  @ApiErrorResponses({ statuses: [500] })
  listPublic(): Promise<PublicCategoryDto[]> {
    return this.categoryService.listPublic();
  }
}
