import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { JobServiceModule } from './job-service.module';

async function bootstrap() {
  const app = await NestFactory.create(JobServiceModule);
  setupApp(app, { serviceName: 'job-service' });
  const port = app.get(ConfigService).get<number>('jobService.port', 3004);
  await app.listen(port);
  logAppLinks({
    serviceName: 'job-service',
    baseUrl: await app.getUrl(),
    database: 'job_service_db',
  });
}

void bootstrap();
