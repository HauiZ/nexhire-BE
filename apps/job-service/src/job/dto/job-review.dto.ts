import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JobReviewDecision } from '@nexhire/shared';

export class ReviewJobDto {
  @ApiProperty({ enum: JobReviewDecision })
  @IsEnum(JobReviewDecision)
  decision: JobReviewDecision;

  @ApiPropertyOptional({ example: 'Content is legitimate and company profile is verified.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class JobReasonDto {
  @ApiPropertyOptional({ example: 'Temporarily paused by company.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
