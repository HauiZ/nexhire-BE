import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { ApplicationServiceModule } from './application-service.module';

async function bootstrap() {
  const app = await NestFactory.create(ApplicationServiceModule);
  setupApp(app, { serviceName: 'application-service' });
  const port = app.get(ConfigService).get<number>('applicationService.port', 3005);
  await app.listen(port);
  logAppLinks({
    serviceName: 'application-service',
    baseUrl: await app.getUrl(),
    database: 'application_service_db',
  });
}

void bootstrap();
