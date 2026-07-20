import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '@nexhire/shared';

export class CompanyResponseDto {
  @ApiProperty({ format: 'uuid', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  id: string;

  @ApiProperty({ example: 'NexHire Tech' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  logo?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Document id for the company logo uploaded through document-storage',
  })
  logoDocumentId?: string;

  @ApiPropertyOptional({ example: 'Tech company focusing on AI...' })
  description?: string;

  @ApiPropertyOptional({ example: 'HR Tech' })
  industry?: string;

  @ApiPropertyOptional({ example: '100-500' })
  size?: string;

  @ApiPropertyOptional({ example: 2018 })
  foundedYear?: number;

  @ApiPropertyOptional({ example: 'Build reliable recruitment automation for modern teams.' })
  mission?: string;

  @ApiPropertyOptional({ example: 'Small teams, clear goals, and product-minded engineering.' })
  culture?: string;

  @ApiPropertyOptional({ type: [String], example: ['Clear ownership', 'Candidate empathy'] })
  values: string[];

  @ApiPropertyOptional({ type: [String], example: ['Flexible schedule', 'Learning budget'] })
  perks: string[];

  @ApiPropertyOptional({ example: 'https://cdn.nexhire.vn/company/hero.png' })
  heroImageUrl?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Document id for the company hero image uploaded through document-storage',
  })
  heroImageDocumentId?: string;

  @ApiPropertyOptional({ example: 'https://nexhire.com' })
  website?: string;

  @ApiPropertyOptional({ example: '123 Tech Street, HCMC' })
  address?: string;

  @ApiProperty({ example: '0101234567' })
  taxCode: string;

  @ApiProperty({ format: 'uuid', description: 'ID of the user who owns this company' })
  ownerId: string;

  @ApiProperty({ enum: CompanyStatus, example: CompanyStatus.PENDING })
  status: CompanyStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
