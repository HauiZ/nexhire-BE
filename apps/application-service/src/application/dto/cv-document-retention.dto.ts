import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStage } from '@nexhire/shared';

export class CvDocumentRetentionResponseDto {
  @ApiProperty()
  documentId: string;

  @ApiProperty()
  canDelete: boolean;

  @ApiProperty()
  activeApplicationCount: number;

  @ApiProperty()
  recentTerminalApplicationCount: number;

  @ApiPropertyOptional({ enum: ApplicationStage, nullable: true })
  blockingStatus: ApplicationStage | null;
}
