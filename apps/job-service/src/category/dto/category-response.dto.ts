import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicCategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  activeJobCount: number;
}
