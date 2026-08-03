import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminNotificationRecipientDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;
}
