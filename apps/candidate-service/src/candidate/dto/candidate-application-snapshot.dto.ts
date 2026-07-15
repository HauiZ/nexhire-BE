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
