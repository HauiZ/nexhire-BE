import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { AiModule } from './ai.module';

async function bootstrap() {
  const app = await NestFactory.create(AiModule);
  setupApp(app, { serviceName: 'ai' });
  const port = app.get(ConfigService).get<number>('ai.port', 3004);
  await app.listen(port);
  Logger.log(`ai service listening on :${port} (schema: ai_schema)`, 'Bootstrap');
}

void bootstrap();
