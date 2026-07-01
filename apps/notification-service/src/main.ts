import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { NotificationServiceModule } from './notification-service.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);
  setupApp(app, { serviceName: 'notification-service' });
  const port = app.get(ConfigService).get<number>('notificationService.port', 3008);
  await app.listen(port);
  Logger.log(`notification-service listening on :${port}`, 'Bootstrap');
}

void bootstrap();
