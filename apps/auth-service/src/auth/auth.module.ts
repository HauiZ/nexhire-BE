import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerification } from './entities/email-verification.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Role } from './entities/role.entity';
import { UserCredential } from './entities/user-credential.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { User } from './entities/user.entity';
import { TokenModule } from '../token/token.module';

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
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
