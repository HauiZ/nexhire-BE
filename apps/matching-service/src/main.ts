import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { MatchingServiceModule } from './matching-service.module';

async function bootstrap() {
  const app = await NestFactory.create(MatchingServiceModule);
  setupApp(app, { serviceName: 'matching-service' });
  const port = app.get(ConfigService).get<number>('matchingService.port', 3007);
  await app.listen(port);
  logAppLinks({
    serviceName: 'matching-service',
    baseUrl: await app.getUrl(),
    database: 'matching_service_db',
  });
}

void bootstrap();
