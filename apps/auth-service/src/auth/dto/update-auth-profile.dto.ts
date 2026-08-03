import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserLanguage } from '@nexhire/shared';

const trimNullableString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateAuthProfileDto {
  @ApiPropertyOptional({
    example: 'Nguyen Van A',
    nullable: true,
    description:
      'Account display name. Candidate profile should be updated through candidate-service.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trimNullableString)
  fullName?: string | null;

  @ApiPropertyOptional({
    example: '0901234567',
    nullable: true,
    description: 'Account phone. Company contact phone is stored on company-service.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(trimNullableString)
  phone?: string | null;

  @ApiPropertyOptional({
    enum: UserLanguage,
    example: UserLanguage.VI,
    description: 'Preferred UI language for the current account.',
  })
  @IsOptional()
  @IsEnum(UserLanguage)
  language?: UserLanguage;
}
