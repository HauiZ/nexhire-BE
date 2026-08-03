import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationController } from './notification.controller';
import { NotificationEventsConsumer } from './notification-events.consumer';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { AdminRecipientClientService } from './admin-recipient-client.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationEventsConsumer, AdminRecipientClientService],
  exports: [NotificationService],
})
export class NotificationModule {}
