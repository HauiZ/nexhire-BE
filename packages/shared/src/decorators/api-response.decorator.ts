import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiResponse as SwaggerApiResponse,
  ApiResponseOptions,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelopeDto, PaginationMetaDto } from '../dto/api-response';

export const DEFAULT_ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Unprocessable entity',
  429: 'Too many requests',
  500: 'Internal server error',
};

interface ApiSuccessResponseOptions {
  description?: string;
  isArray?: boolean;
  paginated?: boolean;
  status?: number;
}

interface ApiErrorResponsesOptions {
  statuses?: number[];
  descriptions?: Partial<Record<number, string>>;
}

function buildSuccessSchema(model: Type<unknown>, options: ApiSuccessResponseOptions) {
  const dataSchema = options.isArray
    ? { type: 'array', items: { $ref: getSchemaPath(model) } }
    : { $ref: getSchemaPath(model) };

  const properties: Record<string, unknown> = {
    success: { type: 'boolean', example: true },
    data: dataSchema,
  };

  const schema: Record<string, unknown> = {
    type: 'object',
    properties,
    required: ['success', 'data'],
  };

  if (options.paginated) {
    properties.meta = { $ref: getSchemaPath(PaginationMetaDto) };
  }

  return schema;
}

function buildErrorResponseOptions(status: number, description: string): ApiResponseOptions {
  return {
    status,
    description,
    schema: {
      allOf: [{ $ref: getSchemaPath(ApiErrorEnvelopeDto) }],
    },
  };
}

export function ApiSuccessResponse(model: Type<unknown>, options: ApiSuccessResponseOptions = {}) {
  const status = options.status ?? 200;
  const responseDecorator =
    status === 201
      ? ApiCreatedResponse
      : (swaggerOptions: ApiResponseOptions) => SwaggerApiResponse(swaggerOptions);

  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    responseDecorator({
      status,
      description: options.description,
      schema: buildSuccessSchema(model, options),
    }),
  );
}

export function ApiErrorResponses(options: ApiErrorResponsesOptions = {}) {
  const statuses = options.statuses ?? [400, 401, 403, 404, 409, 422, 429, 500];
  const descriptions = options.descriptions ?? {};

  return applyDecorators(
    ApiExtraModels(ApiErrorEnvelopeDto),
    ...statuses.map((status) =>
      SwaggerApiResponse(
        buildErrorResponseOptions(
          status,
          descriptions[status] ?? DEFAULT_ERROR_DESCRIPTIONS[status] ?? 'Error',
        ),
      ),
    ),
  );
}

export function ApiCommonErrorResponses() {
  return ApiErrorResponses();
}
