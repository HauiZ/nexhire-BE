import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@nexhire/shared';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: '0987654321' })
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  phone: string;

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
    enum: [UserRole.CANDIDATE, UserRole.RECRUITER],
    description: 'Public self-registration role. ADMIN accounts cannot self-register.',
  })
  @IsEnum(UserRole)
  role: UserRole;
}
