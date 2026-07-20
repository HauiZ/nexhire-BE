import { OmitType } from '@nestjs/swagger';
import { CompanyResponseDto } from './company-response.dto';

export class PublicCompanyProfileDto extends OmitType(CompanyResponseDto, [
  'taxCode',
  'ownerId',
  'status',
  'canPostJobs',
  'completionPercent',
  'missingRequiredFields',
  'submittedAt',
  'rejectionReason',
  'statusReason',
  'statusChangedAt',
  'statusChangedByUserId',
  'createdAt',
  'updatedAt',
] as const) {}
