import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { CandidateServiceModule } from './candidate-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CandidateServiceModule);
  setupApp(app, { serviceName: 'candidate-service' });
  const port = app.get(ConfigService).get<number>('candidateService.port', 3002);
  await app.listen(port);
  Logger.log(`candidate-service listening on :${port} (db: candidate_service_db)`, 'Bootstrap');
}

void bootstrap();
