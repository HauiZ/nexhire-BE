import { OmitType } from '@nestjs/swagger';
import { CompanyResponseDto } from './company-response.dto';

export class PublicCompanyProfileDto extends OmitType(CompanyResponseDto, [
  'taxCode',
  'ownerId',
  'status',
  'createdAt',
  'updatedAt',
] as const) {}
