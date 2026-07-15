import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value).toLowerCase() === 'true';
}

export class UploadCvDto {
  @ApiPropertyOptional({ example: 'Backend Engineer CV' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isDefault?: boolean;
}
