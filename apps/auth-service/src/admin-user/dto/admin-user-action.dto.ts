import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminUserActionDto {
  @ApiProperty({ maxLength: 500, minLength: 3 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class AdminUserRestoreDto {
  @ApiPropertyOptional({ maxLength: 500, minLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
