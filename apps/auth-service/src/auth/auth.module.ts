import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController, AuthInternalController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthIdentity } from './entities/auth-identity.entity';
import { EmailVerification } from './entities/email-verification.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RecruiterCompanyLink } from './entities/recruiter-company-link.entity';
import { Role } from './entities/role.entity';
import { UserCredential } from './entities/user-credential.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { User } from './entities/user.entity';
import { TokenModule } from '../token/token.module';
import { CandidateProfileEventsConsumer } from './events/consumers/candidate-profile-events.consumer';
import { CompanyLinkEventsConsumer } from './events/consumers/company-link-events.consumer';
import { AuthEventPublisher } from './events/auth-event.publisher';
import { ManualAuthController } from './manual/manual-auth.controller';
import { ManualAuthService } from './manual/manual-auth.service';

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
      AuthIdentity,
    ]),
  ],
  controllers: [AuthController, AuthInternalController, ManualAuthController],
  providers: [
    AuthService,
    ManualAuthService,
    AuthEventPublisher,
    CompanyLinkEventsConsumer,
    CandidateProfileEventsConsumer,
  ],
  exports: [AuthService],
})
export class AuthModule {}
