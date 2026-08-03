import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserLanguage, UserRole } from '@nexhire/shared';

export class AuthMeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserLanguage, example: UserLanguage.VI })
  language: UserLanguage;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Document id for current account avatar when available',
  })
  avatarDocumentId: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Document id for recruiter company logo when available',
  })
  logoDocumentId: string | null;
}
