import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum VerifyAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class VerifyCompanyDto {
  @ApiProperty({ enum: VerifyAction })
  @IsEnum(VerifyAction)
  action: VerifyAction;
}
