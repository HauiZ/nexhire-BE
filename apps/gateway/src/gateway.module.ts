import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { gatewayConfig } from './config/gateway.config';
import { validationSchema } from './config/env.validation';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OptionalJwtAuthGuard } from './guards/optional-jwt.guard';
import { ProxyModule } from './proxy/proxy.module';
import { HealthModule } from './health/health.module';
import { buildGatewayThrottlers } from './rate-limit/auth-rate-limit';
import { RecruiterDashboardModule } from './recruiter-dashboard/recruiter-dashboard.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [gatewayConfig],
      validationSchema,
    }),
    ThrottlerModule.forRoot(buildGatewayThrottlers()),
    PassportModule,
    AdminDashboardModule,
    RecruiterDashboardModule,
    ProxyModule,
    HealthModule,
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Decode the JWT if present (identity forwarding); never blocks the request.
    { provide: APP_GUARD, useClass: OptionalJwtAuthGuard },
  ],
})
export class GatewayModule {}
