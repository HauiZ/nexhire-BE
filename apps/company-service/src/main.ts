import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@nexhire/shared';
import { CompanyServiceModule } from './company-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CompanyServiceModule);
  setupApp(app, { serviceName: 'company-service' });
  const port = app.get(ConfigService).get<number>('companyService.port', 3003);
  await app.listen(port);
  Logger.log(`company-service listening on :${port} (db: company_service_db)`, 'Bootstrap');
}

void bootstrap();
