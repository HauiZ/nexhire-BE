import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApplicationStage } from '@nexhire/shared';
import { ApplicationMatchLevel } from '../entities/application.entity';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value).toLowerCase() === 'true';
}

export class CreateApplicationDto {
  @ApiProperty()
  @IsUUID()
  jobId: string;

  @ApiProperty()
  @IsUUID()
  candidateCvId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'When true, trigger CV parsing and automatic matching after applying.',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  parse?: boolean;
}

export class UpdateApplicationStageDto {
  @ApiProperty({ enum: [ApplicationStage.OFFERED, ApplicationStage.REJECTED] })
  @IsEnum(ApplicationStage)
  status: ApplicationStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateApplicationMatchSnapshotDto {
  @ApiProperty({ example: 82 })
  @IsNumber()
  @Min(0)
  @Max(100)
  matchScore: number;

  @ApiPropertyOptional({ enum: ApplicationMatchLevel })
  @IsOptional()
  @IsEnum(ApplicationMatchLevel)
  matchLevel?: ApplicationMatchLevel;
}
