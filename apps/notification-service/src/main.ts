import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { NotificationServiceModule } from './notification-service.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);
  setupApp(app, { serviceName: 'notification-service' });
  const port = app.get(ConfigService).get<number>('notificationService.port', 3008);
  await app.listen(port);
  logAppLinks({
    serviceName: 'notification-service',
    baseUrl: await app.getUrl(),
  });
}

void bootstrap();
