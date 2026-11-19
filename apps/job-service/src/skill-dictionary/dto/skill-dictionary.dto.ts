import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '@nexhire/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDictionarySkillDto {
  @ApiProperty()
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name: string;

  @ApiProperty({ type: [String], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  @MaxLength(120, { each: true })
  aliases: string[];

  @ApiProperty()
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason: string;
}

export class UpdateDictionarySkillDto extends CreateDictionarySkillDto {
  @ApiProperty({ enum: ['ACTIVE', 'RETIRED'] })
  @IsIn(['ACTIVE', 'RETIRED'])
  status: 'ACTIVE' | 'RETIRED';

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision: number;
}

export class DictionaryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'RETIRED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'RETIRED'])
  status?: 'ACTIVE' | 'RETIRED';
}
