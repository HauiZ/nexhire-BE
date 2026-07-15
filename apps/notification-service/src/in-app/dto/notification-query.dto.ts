import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@nexhire/shared';

export type NotificationReadStatus = 'ALL' | 'READ' | 'UNREAD';

export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', 'READ', 'UNREAD'], default: 'ALL' })
  @IsOptional()
  @IsIn(['ALL', 'READ', 'UNREAD'])
  readStatus: NotificationReadStatus = 'ALL';
}
