import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateCvParseStatus } from '../entities/candidate.enum';

export class CandidateApplicationSnapshotDto {
  @ApiProperty()
  candidateId: string;

  @ApiProperty()
  candidateUserId: string;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarDocumentId: string | null;

  @ApiProperty()
  candidateCvId: string;

  @ApiProperty()
  cvDocumentId: string;

  @ApiPropertyOptional({ nullable: true })
  cvTitle: string | null;

  @ApiProperty({ enum: CandidateCvParseStatus })
  cvParseStatus: CandidateCvParseStatus;
}

export class CandidateMatchingSkillSnapshotDto {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  level: string | null;

  @ApiPropertyOptional({ nullable: true })
  yearsOfExperience: number | null;
}

export class CandidateMatchingExperienceSnapshotDto {
  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiPropertyOptional({ nullable: true })
  company: string | null;

  @ApiPropertyOptional({ nullable: true })
  startYear: number | null;

  @ApiPropertyOptional({ nullable: true })
  startMonth: number | null;

  @ApiPropertyOptional({ nullable: true })
  endYear: number | null;

  @ApiPropertyOptional({ nullable: true })
  endMonth: number | null;

  @ApiPropertyOptional({ nullable: true })
  isCurrent: boolean | null;
}

export class CandidateMatchingEducationSnapshotDto {
  @ApiPropertyOptional({ nullable: true })
  degree: string | null;

  @ApiPropertyOptional({ nullable: true })
  school: string | null;

  @ApiPropertyOptional({ nullable: true })
  fieldOfStudy: string | null;
}

export class CandidateMatchingSnapshotDto {
  @ApiProperty()
  candidateId: string;

  @ApiPropertyOptional({ nullable: true })
  candidateUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  candidateCvId: string | null;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  headline: string | null;

  @ApiPropertyOptional({ nullable: true })
  summary: string | null;

  @ApiPropertyOptional({ nullable: true })
  location: string | null;

  @ApiProperty({ type: [CandidateMatchingSkillSnapshotDto] })
  skills: CandidateMatchingSkillSnapshotDto[];

  @ApiProperty({ type: [CandidateMatchingExperienceSnapshotDto] })
  experiences: CandidateMatchingExperienceSnapshotDto[];

  @ApiProperty({ type: [CandidateMatchingEducationSnapshotDto] })
  educations: CandidateMatchingEducationSnapshotDto[];

  @ApiProperty({ type: [String] })
  certifications: string[];

  @ApiProperty({ type: [String] })
  projects: string[];
}
