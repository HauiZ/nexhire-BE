import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { AuthServiceModule } from './auth-service.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthServiceModule);
  setupApp(app, { serviceName: 'auth-service' });
  const port = app.get(ConfigService).get<number>('authService.port', 3001);
  await app.listen(port);
  Logger.log(`auth-service listening on :${port} (db: auth_service_db)`, 'Bootstrap');
}

void bootstrap();
