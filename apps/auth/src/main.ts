import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  setupApp(app, { serviceName: 'auth' });
  const port = app.get(ConfigService).get<number>('auth.port', 3001);
  await app.listen(port);
  Logger.log(`auth service listening on :${port} (schema: auth_schema)`, 'Bootstrap');
}

void bootstrap();
