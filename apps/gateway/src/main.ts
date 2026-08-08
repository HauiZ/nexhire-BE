import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter, logAppLinks } from '@nexhire/shared';
import { GatewayModule } from './gateway.module';

const LARGE_JSON_BODY_LIMIT = '25mb';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const port = config.get<number>('gateway.port', 3000);
  const frontendUrl = config.get<string>('gateway.frontendUrl');

  app.use(json({ limit: LARGE_JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: LARGE_JSON_BODY_LIMIT }));
  app.use(helmet());
  app.enableCors({ origin: frontendUrl, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NexHire API')
    .setDescription('Online job-search & recruitment management - gateway API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  logAppLinks({
    serviceName: 'gateway',
    baseUrl: await app.getUrl(),
  });
}

void bootstrap();
