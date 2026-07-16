import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenModule } from '../token/token.module';
import { User } from '../auth/entities/user.entity';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';

@Module({
  imports: [TokenModule, TypeOrmModule.forFeature([User])],
  controllers: [AdminUserController],
  providers: [AdminUserService],
})
export class AdminUserModule {}
