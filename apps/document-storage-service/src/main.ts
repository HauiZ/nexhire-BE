import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { DocumentStorageServiceModule } from './document-storage-service.module';

async function bootstrap() {
  const app = await NestFactory.create(DocumentStorageServiceModule);
  setupApp(app, { serviceName: 'document-storage-service' });
  const port = app.get(ConfigService).get<number>('documentStorageService.port', 3009);
  await app.listen(port);
  Logger.log(
    `document-storage-service listening on :${port} (db: document_storage_service_db)`,
    'Bootstrap',
  );
}

void bootstrap();
