import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '@nexhire/shared';

export class CompanyResponseDto {
  @ApiProperty({ format: 'uuid', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  id: string;

  @ApiProperty({ example: 'NexHire Tech' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  logo?: string;

  @ApiPropertyOptional({ example: 'Tech company focusing on AI...' })
  description?: string;

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