import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class RequestCvParseDto {
  @ApiProperty()
  @IsUUID()
  requestedByUserId: string;

  @ApiPropertyOptional({
    description: 'Force a new parse request even when the CV is already marked as parsed.',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({
    description: 'When true, parsed CV data may be applied to the candidate profile.',
  })
  @IsOptional()
  @IsBoolean()
  applyToProfile?: boolean;
}
