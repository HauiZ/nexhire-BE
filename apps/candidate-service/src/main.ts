import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { CandidateServiceModule } from './candidate-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CandidateServiceModule);
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
