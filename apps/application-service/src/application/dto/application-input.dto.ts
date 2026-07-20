import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class WithdrawApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
