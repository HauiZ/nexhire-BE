import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@nexhire/shared';

export class AuthUserDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty()
  emailVerified: boolean;
}

export class AuthTokensDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  accessTokenExpiresIn: number;

  @ApiProperty()
  refreshTokenExpiresIn: number;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  @ApiProperty({ type: AuthTokensDto })
  tokens: AuthTokensDto;
}
