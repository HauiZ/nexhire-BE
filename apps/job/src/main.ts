import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { JobModule } from './job.module';

async function bootstrap() {
  const app = await NestFactory.create(JobModule);
  setupApp(app, { serviceName: 'job' });
  const port = app.get(ConfigService).get<number>('job.port', 3002);
  await app.listen(port);
  Logger.log(`job service listening on :${port} (schema: job_schema)`, 'Bootstrap');
}

void bootstrap();
