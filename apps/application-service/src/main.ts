import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { ApplicationServiceModule } from './application-service.module';

async function bootstrap() {
  const app = await NestFactory.create(ApplicationServiceModule);
  setupApp(app, { serviceName: 'application-service' });
  const port = app.get(ConfigService).get<number>('applicationService.port', 3005);
  await app.listen(port);
  Logger.log(`application-service listening on :${port} (db: application_service_db)`, 'Bootstrap');
}

void bootstrap();
