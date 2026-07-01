import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailResponseDto {
  @ApiProperty({ example: 'Email verified successfully' })
  message: string;

  @ApiProperty({ example: true })
  emailVerified: boolean;

  @ApiProperty({ example: 'candidate@nexhire.vn' })
  email: string;

  @ApiProperty({ example: '2026-07-01T08:15:00.000Z' })
  verifiedAt: Date;
}
