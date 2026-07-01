import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { MatchingServiceModule } from './matching-service.module';

async function bootstrap() {
  const app = await NestFactory.create(MatchingServiceModule);
  setupApp(app, { serviceName: 'matching-service' });
  const port = app.get(ConfigService).get<number>('matchingService.port', 3007);
  await app.listen(port);
  Logger.log(`matching-service listening on :${port} (db: matching_service_db)`, 'Bootstrap');
}

void bootstrap();
