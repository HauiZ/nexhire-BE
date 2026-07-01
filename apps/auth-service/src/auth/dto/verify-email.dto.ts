import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'candidate@nexhire.vn' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Email verification token sent to the user',
  })
  @IsString()
  @Length(4, 32)
  token: string;
}
