import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FollowedCompanyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  companyId: string;

  @ApiProperty()
  companyName: string;

  @ApiPropertyOptional({ nullable: true })
  companyLogoUrl: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  companyLogoDocumentId: string | null;

  @ApiProperty({ format: 'date-time' })
  followedAt: Date;
}

export class FollowedCompanyStatusResponseDto {
  @ApiProperty()
  followed: boolean;
}

export class FollowedCompanyBatchStatusResponseDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  followedCompanyIds: string[];
}

export class DeleteFollowedCompanyResponseDto {
  @ApiProperty({ example: true })
  deleted: true;
}
