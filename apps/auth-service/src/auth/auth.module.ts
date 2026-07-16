import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController, AuthInternalController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerification } from './entities/email-verification.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RecruiterCompanyLink } from './entities/recruiter-company-link.entity';
import { Role } from './entities/role.entity';
import { UserCredential } from './entities/user-credential.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { User } from './entities/user.entity';
import { TokenModule } from '../token/token.module';
import { CompanyLinkEventsConsumer } from './events/consumers/company-link-events.consumer';
import { AuthEventPublisher } from './events/auth-event.publisher';

@Module({
  imports: [
    ConfigModule,
    TokenModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: () => ({}),
    }),
    TypeOrmModule.forFeature([
      User,
      UserCredential,
      Role,
      UserRoleEntity,
      EmailVerification,
      PasswordResetToken,
      RecruiterCompanyLink,
    ]),
  ],
  controllers: [AuthController, AuthInternalController],
  providers: [AuthService, AuthEventPublisher, CompanyLinkEventsConsumer],
  exports: [AuthService],
})
export class AuthModule {}
