import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailEventsConsumer } from './email-events.consumer';
import { EmailService } from './email.service';

@Module({
  controllers: [EmailController],
  providers: [EmailService, EmailEventsConsumer],
  exports: [EmailService],
})
export class EmailModule {}
