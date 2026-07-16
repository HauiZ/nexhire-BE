import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobExperienceLevel, JobStatus } from '@nexhire/shared';

export class SavedJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  jobId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional()
  companyName: string | null;

  @ApiPropertyOptional()
  companyLogoUrl: string | null;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel;

  @ApiProperty()
  location: string;

  @ApiPropertyOptional()
  salaryMin: number | null;

  @ApiPropertyOptional()
  salaryMax: number | null;

  @ApiProperty()
  salaryCurrency: string;

  @ApiProperty()
  isSalaryVisible: boolean;

  @ApiPropertyOptional()
  deadline: Date | null;

  @ApiPropertyOptional()
  publishedAt: Date | null;

  @ApiProperty()
  savedAt: Date;
}

export class SavedJobStatusResponseDto {
  @ApiProperty()
  saved: boolean;
}

export class SavedJobBatchStatusResponseDto {
  @ApiProperty({ type: [String] })
  savedJobIds: string[];
}

export class DeleteSavedJobResponseDto {
  @ApiProperty({ example: true })
  deleted: true;
}
