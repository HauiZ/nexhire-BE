import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Shape of the standard success envelope (built by ResponseInterceptor). */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

/** Shape of the standard error envelope (built by AllExceptionsFilter). */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field: string; issue: string }[];
  };
  requestId?: string;
}

/** Helper to build a paginated payload from a service. */
export function paginated<T>(items: T[], total: number, page: number, limit: number) {
  return { data: items, meta: { page, limit, total } };
}

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;
}

export class ApiErrorDetailDto {
  @ApiProperty()
  field: string;

  @ApiProperty()
  issue: string;
}

export class ApiErrorBodyDto {
  @ApiProperty({ example: 'AUTH.INVALID_CREDENTIALS' })
  code: string;

  @ApiProperty({ example: 'Invalid email or password' })
  message: string;

  @ApiPropertyOptional({ type: [ApiErrorDetailDto] })
  details?: ApiErrorDetailDto[];
}

export class ApiErrorEnvelopeDto implements ApiErrorResponse {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ type: ApiErrorBodyDto })
  error: ApiErrorBodyDto;

  @ApiPropertyOptional()
  requestId?: string;
}
