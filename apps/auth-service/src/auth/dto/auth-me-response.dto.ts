import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@nexhire/shared';

export class AuthMeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Document id for recruiter company logo when available',
  })
  logoDocumentId: string | null;
}
