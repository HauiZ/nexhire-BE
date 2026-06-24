import { join } from 'node:path';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { notificationConfig } from './config/notification.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [notificationConfig],
      validationSchema,
    }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('notification.smtp.host'),
          port: config.get<number>('notification.smtp.port'),
          auth: {
            user: config.get<string>('notification.smtp.user'),
            pass: config.get<string>('notification.smtp.pass'),
          },
        },
        defaults: { from: config.get<string>('notification.smtp.from') },
        template: {
          // Templates are not compiled by webpack/tsc; load them from source.
          // In Docker the same relative path is populated by the Dockerfile.
          dir: join(process.cwd(), 'apps', 'notification', 'src', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
    HealthModule,
    // notification feature module (queue consumer + controller) added as built
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class NotificationModule {}
