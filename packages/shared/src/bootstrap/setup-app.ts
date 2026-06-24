import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { ResponseInterceptor } from '../interceptors/response.interceptor';

interface SetupOptions {
  /** Service name shown in the Swagger title (e.g. 'auth'). */
  serviceName: string;
  /** Global route prefix. Defaults to 'api/v1'. */
  prefix?: string;
  /** Expose Swagger at /api/docs. Defaults to true outside production. */
  swagger?: boolean;
}

/**
 * Applies the project-wide HTTP conventions to a Nest app:
 * global prefix, strict validation, standard response/error envelopes,
 * and (in non-production) a per-service Swagger UI at /api/docs.
 * Each service calls this in its main.ts.
 */
export function setupApp(app: INestApplication, options: SetupOptions): void {
  const prefix = options.prefix ?? 'api/v1';
  const enableSwagger = options.swagger ?? process.env.NODE_ENV !== 'production';

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle(`NexHire - ${options.serviceName} service`)
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }
}
