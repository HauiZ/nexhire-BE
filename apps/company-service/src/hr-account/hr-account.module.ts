import { Module } from '@nestjs/common';
import { HrAccountController } from './hr-account.controller';
import { HrAccountService } from './hr-account.service';

@Module({
  controllers: [HrAccountController],
  providers: [HrAccountService],
  exports: [HrAccountService],
})
export class HrAccountModule {}
