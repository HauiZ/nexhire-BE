import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ManualEmailVerificationDto {
  @ApiProperty({ example: 'candidate@nexhire.vn' })
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class ManualEmailVerificationResponseDto {
  @ApiProperty({ example: 'Manual verification token created' })
  message: string;

  @ApiProperty({ example: '9f09167e-9321-499a-91dd-025082e6a6e4' })
  verificationId: string;

  @ApiProperty({ example: 'candidate@nexhire.vn' })
  email: string;

  @ApiProperty({ example: '123456' })
  token: string;

  @ApiProperty({ example: '2026-07-01T08:15:00.000Z' })
  expiresAt: Date;
}
