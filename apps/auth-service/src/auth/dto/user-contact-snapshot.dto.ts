import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserContactSnapshotDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;
}
