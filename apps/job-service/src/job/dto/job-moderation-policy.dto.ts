import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  JobModerationPolicy,
  JobModerationPolicyRules,
  JobModerationPolicyStatus,
} from '../entities/job-moderation-policy.entity';
import { CompanyTrustLevel } from '../entities/job.enum';

export class JobModerationPolicyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Default job moderation policy' })
  name: string;

  @ApiProperty({ enum: JobModerationPolicyStatus })
  status: JobModerationPolicyStatus;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ type: 'object' })
  rules: JobModerationPolicyRules;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(policy: JobModerationPolicy): JobModerationPolicyResponseDto {
    return {
      id: policy.id,
      name: policy.name,
      status: policy.status,
      version: policy.version,
      rules: policy.rules,
      createdByUserId: policy.createdByUserId,
      updatedByUserId: policy.updatedByUserId,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }
}

export class JobModerationPolicyQueryDto {
  @ApiPropertyOptional({ enum: JobModerationPolicyStatus })
  @IsOptional()
  @IsEnum(JobModerationPolicyStatus)
  status?: JobModerationPolicyStatus;
}

export class CreateJobModerationPolicyDto {
  @ApiProperty({ example: 'Default job moderation policy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ type: 'object' })
  @IsObject()
  rules: JobModerationPolicyRules;
}

export class UpdateJobModerationPolicyDto extends PartialType(CreateJobModerationPolicyDto) {}

export class TestJobModerationPolicyDto {
  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  rules?: JobModerationPolicyRules;

  @ApiProperty({ type: 'object' })
  @IsObject()
  job: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CompanyTrustLevel, default: CompanyTrustLevel.MEDIUM })
  @IsOptional()
  @IsEnum(CompanyTrustLevel)
  companyTrustLevel?: CompanyTrustLevel;
}
