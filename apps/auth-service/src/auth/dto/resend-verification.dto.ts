import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ example: 'candidate@nexhire.vn' })
  @IsEmail()
  @MaxLength(255)
  email: string;
}
