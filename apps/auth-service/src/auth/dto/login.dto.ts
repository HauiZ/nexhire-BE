import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@nexhire/shared';

export class LoginDto {
  @ApiProperty({ example: 'candidate@nexhire.vn' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({
    enum: [UserRole.CANDIDATE, UserRole.RECRUITER, UserRole.ADMIN],
    description:
      'Login context. Candidate, recruiter, and admin login pages must send their matching role.',
  })
  @IsIn([UserRole.CANDIDATE, UserRole.RECRUITER, UserRole.ADMIN])
  role: UserRole.CANDIDATE | UserRole.RECRUITER | UserRole.ADMIN;
}
