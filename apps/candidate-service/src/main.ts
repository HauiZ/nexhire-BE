import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { CandidateServiceModule } from './candidate-service.module';

const LARGE_JSON_BODY_LIMIT = '25mb';

async function bootstrap() {
  const app = await NestFactory.create(CandidateServiceModule, { bodyParser: false });
  app.use(json({ limit: LARGE_JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: LARGE_JSON_BODY_LIMIT }));
  setupApp(app, { serviceName: 'candidate-service' });
  const port = app.get(ConfigService).get<number>('candidateService.port', 3002);
  await app.listen(port);
  logAppLinks({
    serviceName: 'candidate-service',
    baseUrl: await app.getUrl(),
    database: 'candidate_service_db',
  });
}

void bootstrap();
