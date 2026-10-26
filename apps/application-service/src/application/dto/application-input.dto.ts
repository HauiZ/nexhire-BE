import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Equals,
} from 'class-validator';
import { ApplicationStage } from '@nexhire/shared';

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
    description:
      'Apply parsed CV to the candidate profile when parsing is requested. Automatic matching is requested regardless of this flag.',
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
  @ApiProperty({ enum: ['NOT_AVAILABLE'] })
  @Equals('NOT_AVAILABLE')
  scoringStatus: 'NOT_AVAILABLE';

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description: 'Must be null while scoringStatus is NOT_AVAILABLE; numeric values are rejected.',
  })
  @Equals(null)
  matchScore: null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Must be null while scoringStatus is NOT_AVAILABLE; string values are rejected.',
  })
  @Equals(null)
  matchLevel: null;
}
