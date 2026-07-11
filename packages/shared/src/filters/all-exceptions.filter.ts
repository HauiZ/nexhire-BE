import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODES } from '../constants/error-codes';
import { HEADERS } from '../constants/headers';
import { ApiErrorResponse } from '../dto/api-response';

/** Formats every thrown error into the standard error envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.headers[HEADERS.REQUEST_ID] as string | undefined;

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const { code, message, details } = this.normalize(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${requestId ?? '-'}] ${request.method} ${request.url}`,
        exception as Error,
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      error: { code, message, ...(details ? { details } : {}) },
      requestId,
    };
    response.status(status).json(body);
  }

  private normalize(exception: unknown, status: number) {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        const rawMessage = r.message;
        // class-validator returns an array of messages
        if (Array.isArray(rawMessage)) {
          return {
            code: ERROR_CODES.COMMON.VALIDATION_FAILED,
            message: 'Validation failed',
            details: rawMessage.map((m) => ({ field: '', issue: String(m) })),
          };
        }
        return {
          code: (r.code as string) ?? this.codeForStatus(status),
          message: (rawMessage as string) ?? exception.message,
          details: undefined as { field: string; issue: string }[] | undefined,
        };
      }
      return { code: this.codeForStatus(status), message: exception.message, details: undefined };
    }
    return {
      code: ERROR_CODES.COMMON.INTERNAL_ERROR,
      message: 'Internal server error',
      details: undefined,
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.COMMON.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.COMMON.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.COMMON.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.COMMON.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.COMMON.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.COMMON.RATE_LIMITED;
      default:
        return ERROR_CODES.COMMON.INTERNAL_ERROR;
    }
  }
}
