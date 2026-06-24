import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule);
  setupApp(app, { serviceName: 'notification' });
  const port = app.get(ConfigService).get<number>('notification.port', 3005);
  await app.listen(port);
  Logger.log(`notification service listening on :${port}`, 'Bootstrap');
}

void bootstrap();
