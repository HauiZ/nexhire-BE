import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationResponseDto {
  @ApiProperty({ example: 'Verification email queued successfully' })
  message: string;

  @ApiProperty({ example: 'candidate@nexhire.vn' })
  email: string;

  @ApiProperty({ example: 60 })
  resendCooldownSeconds: number;

  @ApiProperty({ example: 2 })
  resendCount: number;
}
