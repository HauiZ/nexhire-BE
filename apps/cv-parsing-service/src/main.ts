import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { CvParsingServiceModule } from './cv-parsing-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CvParsingServiceModule);
  setupApp(app, { serviceName: 'cv-parsing-service' });
  const port = app.get(ConfigService).get<number>('cvParsingService.port', 3006);
  await app.listen(port);
  Logger.log(`cv-parsing-service listening on :${port} (db: cv_parsing_service_db)`, 'Bootstrap');
}

void bootstrap();
