import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { logAppLinks, setupApp } from '@nexhire/shared';
import { CvParsingServiceModule } from './cv-parsing-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CvParsingServiceModule);
  setupApp(app, { serviceName: 'cv-parsing-service' });
  const port = app.get(ConfigService).get<number>('cvParsingService.port', 3006);
  await app.listen(port);
  logAppLinks({
    serviceName: 'cv-parsing-service',
    baseUrl: await app.getUrl(),
    database: 'cv_parsing_service_db',
  });
}

void bootstrap();
