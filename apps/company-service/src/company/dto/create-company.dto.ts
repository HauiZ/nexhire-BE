import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trimOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeOptionalStringArray = ({ value }: { value: unknown }) => {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return value;
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
};

export class CreateCompanyDto {
  @ApiProperty({ example: 'NexHire Tech' })
  @IsString()
  @Length(2, 255)
  @Transform(trimOptionalString)
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsUrl()
  logo?: string;

  @ApiPropertyOptional({ example: 'Tech company focusing on AI...' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trimOptionalString)
  description?: string;

  @ApiPropertyOptional({ example: 'HR Tech' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trimOptionalString)
  industry?: string;

  @ApiPropertyOptional({ example: '100-500' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(trimOptionalString)
  size?: string;

  @ApiPropertyOptional({ example: 2018 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(2100)
  foundedYear?: number;

  @ApiPropertyOptional({ example: 'Build reliable recruitment automation for modern teams.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trimOptionalString)
  mission?: string;

  @ApiPropertyOptional({ example: 'Small teams, clear goals, and product-minded engineering.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trimOptionalString)
  culture?: string;

  @ApiPropertyOptional({
    example: ['Clear ownership', 'Candidate empathy', 'Continuous improvement'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Transform(normalizeOptionalStringArray)
  values?: string[];

  @ApiPropertyOptional({ example: ['Flexible schedule', 'Learning budget', 'Transparent reviews'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Transform(normalizeOptionalStringArray)
  perks?: string[];

  @ApiPropertyOptional({ example: 'https://cdn.nexhire.vn/company/hero.png' })
  @IsOptional()
  @IsUrl()
  heroImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://nexhire.com' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: '123 Tech Street, HCMC' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimOptionalString)
  address?: string;

  @ApiProperty({ example: '0101234567' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(10, 50)
  taxCode: string;
}
