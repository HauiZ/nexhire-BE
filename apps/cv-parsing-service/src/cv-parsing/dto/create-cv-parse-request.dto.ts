import { IsEnum, IsOptional, IsUrl, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CvParseContext } from '../entities/cv-parsing.enum';

export class CreateCvParseRequestDto {
  @ApiProperty({ example: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5' })
  @IsUUID()
  candidateId: string;

  @ApiProperty({ example: '9e0f9786-4b63-4b29-9f80-59c2d7bc6cc5' })
  @IsUUID()
  requestedByUserId: string;

  @ApiProperty({ example: 'bb4f26c9-2bb3-4177-8483-ff057db9f675' })
  @IsUUID()
  candidateCvId: string;

  @ApiProperty({ example: '2f67a247-7ff0-4e50-bff7-a2dcfbf6de2e' })
  @IsUUID()
  documentId: string;

  @ApiPropertyOptional({ example: 'https://minio.local/nexhire/...' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  documentUrl?: string;

  @ApiProperty({ enum: CvParseContext, example: CvParseContext.PROFILE_UPDATE })
  @IsEnum(CvParseContext)
  context: CvParseContext;
}
