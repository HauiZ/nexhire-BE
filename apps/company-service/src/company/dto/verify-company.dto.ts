import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum VerifyAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class VerifyCompanyDto {
  @ApiProperty({ enum: VerifyAction })
  @IsEnum(VerifyAction)
  action: VerifyAction;

  @ApiPropertyOptional({ example: 'Business license is invalid or incomplete' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
