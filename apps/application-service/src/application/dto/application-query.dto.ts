import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApplicationStage, PaginationQueryDto } from '@nexhire/shared';

export class CandidateApplicationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  status?: ApplicationStage;
}

export class RecruiterApplicationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  status?: ApplicationStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
