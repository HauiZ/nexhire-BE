import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { CvAppModule } from './cv-app.module';

async function bootstrap() {
  const app = await NestFactory.create(CvAppModule);
  setupApp(app, { serviceName: 'cv-app' });
  const port = app.get(ConfigService).get<number>('cvapp.port', 3003);
  await app.listen(port);
  Logger.log(`cv-app service listening on :${port} (db: cvapp_db)`, 'Bootstrap');
}

void bootstrap();
