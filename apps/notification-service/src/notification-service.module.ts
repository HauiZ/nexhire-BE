import { join } from 'node:path';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions, databaseConfigFor, rabbitmqConfig } from '@nexhire/infra';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { EmailModule } from './email/email.module';
import { NotificationModule } from './in-app/notification.module';
import { WebPushModule } from './web-push/web-push.module';
import { notificationServiceConfig } from './config/notification-service.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfigFor('NOTIFICATION_SERVICE'), rabbitmqConfig, notificationServiceConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('notificationService.smtp.host'),
          port: config.get<number>('notificationService.smtp.port'),
          secure: config.get<boolean>('notificationService.smtp.secure', false),
          auth: {
            user: config.get<string>('notificationService.smtp.user'),
            pass: config.get<string>('notificationService.smtp.pass'),
          },
        },
        defaults: { from: config.get<string>('notificationService.smtp.from') },
        template: {
          dir: join(process.cwd(), 'apps', 'notification-service', 'src', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
    HealthModule,
    NotificationModule,
    EmailModule,
    WebPushModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class NotificationServiceModule {}
