import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@nexhire/shared';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token from Google Identity Services credential response.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsString()
  @MinLength(20)
  idToken: string;

  @ApiProperty({
    enum: [UserRole.CANDIDATE, UserRole.RECRUITER],
    description: 'Login/signup context. ADMIN is not allowed through public Google login.',
  })
  @IsIn([UserRole.CANDIDATE, UserRole.RECRUITER])
  role: UserRole.CANDIDATE | UserRole.RECRUITER;

  @ApiProperty({
    required: false,
    description: 'Optional client nonce if FE uses nonce in Google Identity Services.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nonce?: string;
}
