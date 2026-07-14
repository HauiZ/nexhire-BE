import { OmitType } from '@nestjs/swagger';
import { CompanyResponseDto } from './company-response.dto';

// OmitType giúp loại bỏ các field nhạy cảm, chỉ giữ lại các field public
export class PublicCompanyProfileDto extends OmitType(CompanyResponseDto, [
  'taxCode',
  'ownerId',
  'status',
  'createdAt',
  'updatedAt',
] as const) {}
