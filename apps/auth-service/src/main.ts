import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { AuthServiceModule } from './auth-service.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthServiceModule);
  setupApp(app, { serviceName: 'auth-service' });
  const port = app.get(ConfigService).get<number>('authService.port', 3001);
  await app.listen(port);
  logAppLinks({
    serviceName: 'auth-service',
    baseUrl: await app.getUrl(),
    database: 'auth_service_db',
  });
}

void bootstrap();
