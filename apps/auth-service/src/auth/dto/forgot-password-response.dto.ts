import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordResponseDto {
  @ApiProperty({ example: 'Password reset code queued if the email exists' })
  message: string;

  @ApiProperty({ example: 60 })
  resendCooldownSeconds: number;
}
